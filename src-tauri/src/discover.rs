//! Finds existing KytyPS5 installs in the places people usually put them.

use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use serde::Serialize;

use crate::emulator::EMULATOR_EXE;

#[derive(Serialize)]
pub struct Install {
    pub path: String,
    pub modified: u64,
}

fn env_path(name: &str) -> Option<PathBuf> {
    std::env::var_os(name).map(PathBuf::from).filter(|p| p.is_dir())
}

fn child_dirs(dir: &Path) -> Vec<PathBuf> {
    fs::read_dir(dir)
        .map(|entries| {
            entries
                .filter_map(Result::ok)
                .filter(|e| e.file_type().is_ok_and(|t| t.is_dir() && !t.is_symlink()))
                .map(|e| e.path())
                .collect()
        })
        .unwrap_or_default()
}

fn looks_like_kyty(dir: &Path) -> bool {
    dir.file_name().is_some_and(|n| n.to_string_lossy().to_lowercase().contains("kyty"))
}

/// Default folder for a launcher-managed install.
pub fn default_install_dir() -> PathBuf {
    env_path("LOCALAPPDATA").unwrap_or_else(|| PathBuf::from("C:\\")).join("KytyPS5")
}

pub fn find_installs(extra: &[PathBuf]) -> Vec<Install> {
    let mut found: Vec<PathBuf> = Vec::new();
    let mut seen = HashSet::new();
    let mut check = |dir: &Path| {
        if dir.join(EMULATOR_EXE).is_file() && seen.insert(dir.to_string_lossy().to_lowercase()) {
            found.push(dir.to_path_buf());
        }
    };

    for dir in extra {
        check(dir);
    }
    check(&default_install_dir());

    let home = env_path("USERPROFILE");
    let mut roots: Vec<PathBuf> = ["Downloads", "Desktop", "Documents"]
        .iter()
        .filter_map(|sub| home.as_ref().map(|h| h.join(sub)))
        .collect();
    roots.extend(env_path("LOCALAPPDATA"));
    roots.extend(env_path("ProgramFiles"));
    roots.extend(["C:\\", "D:\\"].iter().map(PathBuf::from).filter(|p| p.is_dir()));

    for root in roots {
        check(&root);
        // Archives usually extract to `<name>\<name>`, so look two levels into anything called kyty*.
        for child in child_dirs(&root).into_iter().filter(|c| looks_like_kyty(c)) {
            check(&child);
            for grandchild in child_dirs(&child) {
                check(&grandchild);
            }
        }
    }

    let mut installs: Vec<Install> = found
        .into_iter()
        .map(|dir| {
            let modified = fs::metadata(dir.join(EMULATOR_EXE))
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map_or(0, |d| d.as_secs());
            Install { path: dir.to_string_lossy().into_owned(), modified }
        })
        .collect();
    installs.sort_by(|a, b| b.modified.cmp(&a.modified));
    installs
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_nested_extracted_install() {
        let base = std::env::temp_dir().join(format!("kyty-discover-{}", std::process::id()));
        let nested = base.join("KytyPS5-2026-10-02-abc").join("KytyPS5-2026-10-02-abc");
        fs::create_dir_all(&nested).unwrap();
        fs::write(nested.join(EMULATOR_EXE), b"x").unwrap();
        let unrelated = base.join("Games");
        fs::create_dir_all(&unrelated).unwrap();
        fs::write(unrelated.join(EMULATOR_EXE), b"x").unwrap();

        let found = find_installs(&[nested.clone()]);
        assert!(found.iter().any(|i| Path::new(&i.path) == nested));
        let _ = fs::remove_dir_all(&base);
    }
}
