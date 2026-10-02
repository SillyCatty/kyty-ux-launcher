use std::{
    collections::{HashSet, VecDeque},
    fs,
    path::{Path, PathBuf},
};

use serde::Serialize;
use serde_json::Value;

use crate::settings::{normalize_dir, path_key};

const MAX_PARAM_SIZE: u64 = 1024 * 1024;
const MAX_SCAN_DEPTH: usize = 6;

#[derive(Debug, Clone, Serialize)]
pub struct Game {
    pub id: String,
    pub name: String,
    pub title_id: String,
    pub version: String,
    pub firmware: String,
    pub path: String,
    pub icon: Option<String>,
    pub background: Option<String>,
    pub custom_settings: bool,
    pub last_played: Option<u64>,
    pub play_seconds: u64,
}

struct Metadata {
    name: Option<String>,
    title_id: String,
    version: String,
    firmware: String,
}

fn json_str(v: &Value, key: &str) -> String {
    v.get(key).and_then(Value::as_str).unwrap_or_default().trim().to_owned()
}

fn localized_title(root: &Value) -> Option<String> {
    let localized = root.get("localizedParameters")?.as_object()?;
    let title_of = |lang: &str| {
        localized.get(lang).map(|v| json_str(v, "titleName")).filter(|t| !t.is_empty())
    };
    let default_lang = localized.get("defaultLanguage").and_then(Value::as_str).unwrap_or_default();
    title_of(default_lang)
        .or_else(|| title_of("en-US"))
        .or_else(|| localized.values().map(|v| json_str(v, "titleName")).find(|t| !t.is_empty()))
}

/// `0x0110000000000000`-style value → "1.10" (patch appended when non-zero).
fn firmware_version(encoded: &str) -> String {
    let hex = encoded.strip_prefix("0x").or_else(|| encoded.strip_prefix("0X"));
    let Some(hex) = hex.filter(|h| h.len() == 16 && h.chars().all(|c| c.is_ascii_hexdigit())) else {
        return String::new();
    };
    let digits = &hex[..6];
    if !digits.chars().all(|c| c.is_ascii_digit()) {
        return String::new();
    }
    let major: u32 = digits[..2].parse().unwrap_or(0);
    let mut version = format!("{major}.{}", &digits[2..4]);
    if &digits[4..6] != "00" {
        version.push('.');
        version.push_str(&digits[4..6]);
    }
    version
}

fn read_metadata(game_dir: &Path) -> Metadata {
    let param = game_dir.join("sce_sys").join("param.json");
    let root = fs::metadata(&param)
        .ok()
        .filter(|m| m.len() <= MAX_PARAM_SIZE)
        .and_then(|_| fs::read(&param).ok())
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok());
    let Some(root) = root else {
        return Metadata { name: None, title_id: String::new(), version: String::new(), firmware: String::new() };
    };
    let mut version = json_str(&root, "appVersion");
    if version.is_empty() {
        version = json_str(&root, "contentVersion");
    }
    Metadata {
        name: localized_title(&root),
        title_id: json_str(&root, "titleId"),
        version,
        firmware: firmware_version(&json_str(&root, "requiredSystemSoftwareVersion")),
    }
}

fn existing(path: PathBuf) -> Option<String> {
    path.is_file().then(|| path.to_string_lossy().into_owned())
}

fn subdirs(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(dir) else { return Vec::new() };
    let mut dirs: Vec<PathBuf> = entries
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_ok_and(|t| t.is_dir() && !t.is_symlink()))
        .map(|e| e.path())
        .collect();
    dirs.sort();
    dirs
}

/// Same discovery rule as the Qt launcher: any folder holding `eboot.bin`.
pub fn scan(game_dirs: &[String]) -> Vec<Game> {
    let mut found = HashSet::new();
    let mut games = Vec::new();

    for root in game_dirs {
        let root = PathBuf::from(root);
        if !root.is_dir() {
            continue;
        }
        let mut pending: VecDeque<(PathBuf, usize)> = subdirs(&root).into_iter().map(|d| (d, 1)).collect();
        while let Some((dir, depth)) = pending.pop_front() {
            if dir.join("eboot.bin").is_file() {
                let path = normalize_dir(&dir.to_string_lossy());
                let id = path_key(&path);
                if !found.insert(id.clone()) {
                    continue;
                }
                let meta = read_metadata(&dir);
                let sce_sys = dir.join("sce_sys");
                games.push(Game {
                    id,
                    name: meta.name.unwrap_or_else(|| {
                        dir.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
                    }),
                    title_id: meta.title_id,
                    version: meta.version,
                    firmware: meta.firmware,
                    path,
                    icon: existing(sce_sys.join("icon0.png")),
                    background: existing(sce_sys.join("pic0.png"))
                        .or_else(|| existing(sce_sys.join("pic1.png"))),
                    custom_settings: false,
                    last_played: None,
                    play_seconds: 0,
                });
                continue;
            }
            if depth < MAX_SCAN_DEPTH {
                pending.extend(subdirs(&dir).into_iter().map(|d| (d, depth + 1)));
            }
        }
    }

    games.sort_by_key(|g| g.name.to_lowercase());
    games
}

/// Number of games at or under `dir`. `dir` may itself be a game folder, which a plain scan of `dir` would miss.
pub fn count_in(dir: &Path) -> usize {
    let Some(parent) = dir.parent() else { return 0 };
    let key = path_key(&dir.to_string_lossy());
    let nested = format!("{key}/");
    scan(&[parent.to_string_lossy().into_owned()])
        .iter()
        .filter(|g| g.id == key || g.id.starts_with(&nested))
        .count()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_games_inside_an_output_folder() {
        let base = std::env::temp_dir().join(format!("kyty-count-{}", std::process::id()));
        let touch = |rel: &str| {
            let file = base.join(rel);
            fs::create_dir_all(file.parent().unwrap()).unwrap();
            fs::write(file, b"x").unwrap();
        };
        touch("Out/eboot.bin"); // the output folder is itself the game
        touch("Out2/nested/deeper/eboot.bin"); // the game is inside the output folder
        touch("Other/eboot.bin"); // an unrelated game must not be counted
        fs::create_dir_all(base.join("Empty")).unwrap();

        assert_eq!(count_in(&base.join("Out")), 1);
        assert_eq!(count_in(&base.join("Out2")), 1);
        assert_eq!(count_in(&base.join("Empty")), 0);
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn firmware_parsing() {
        assert_eq!(firmware_version("0x0110000000000000"), "1.10");
        assert_eq!(firmware_version("0x0702010000000000"), "7.02.01");
        assert_eq!(firmware_version("bogus"), "");
    }
}
