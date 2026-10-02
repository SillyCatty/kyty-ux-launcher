//! Typed view of the `[GlobalConfiguration]` section that KytyPS5's Qt launcher
//! writes (see launcher/include/configuration.h in the emulator source).

use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

use crate::ini::{decode_list, decode_string, encode_list, encode_str, IniDoc};

pub const GLOBAL: &str = "GlobalConfiguration";
pub const LAUNCHER: &str = "Launcher";
pub const GAME_CONFIGS: &str = "GameConfigurations";

pub const RESOLUTIONS: [&str; 4] = ["1280x720", "1920x1080", "2560x1440", "3840x2160"];
pub const PRESENT_MODES: [&str; 3] = ["Fifo", "Mailbox", "Immediate"];
pub const SHADER_OPTIMIZATIONS: [&str; 3] = ["None", "Size", "Performance"];
pub const LOG_DIRECTIONS: [&str; 3] = ["Silent", "Console", "File"];
pub const MAX_CONSOLE_LANGUAGE: i32 = 29;
pub const MAX_USER_NAME_BYTES: usize = 16;
pub const DEFAULT_USER_ID: i32 = 1000;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Settings {
    pub user_name: String,
    pub user_id: i32,
    pub console_language: i32,
    pub controller_color: String,
    pub amd_cpu_enabled: bool,
    pub red_zone_protection_enabled: bool,
    pub audio_input_device: String,
    pub screen_resolution: String,
    pub present_mode: String,
    pub vblank_frequency: i32,
    pub shader_optimization_type: String,
    pub gpu_index: i32,
    pub fullscreen_enabled: bool,
    pub readback_linear_images: bool,
    pub tessellation_enabled: bool,
    pub vulkan_validation_enabled: bool,
    pub shader_validation_enabled: bool,
    pub renderdoc_enabled: bool,
    pub command_buffer_dump_enabled: bool,
    pub profiler_enabled: bool,
    pub shader_log_direction: String,
    pub shader_log_folder: String,
    pub printf_direction: String,
    pub printf_output_file: String,
    pub command_buffer_dump_folder: String,
    pub game_dirs: Vec<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            user_name: "Kyty".into(),
            user_id: DEFAULT_USER_ID,
            console_language: 1,
            controller_color: String::new(),
            amd_cpu_enabled: false,
            red_zone_protection_enabled: false,
            audio_input_device: String::new(),
            screen_resolution: "1280x720".into(),
            present_mode: "Mailbox".into(),
            vblank_frequency: 60,
            shader_optimization_type: "Performance".into(),
            gpu_index: -1,
            fullscreen_enabled: false,
            readback_linear_images: false,
            tessellation_enabled: false,
            vulkan_validation_enabled: false,
            shader_validation_enabled: true,
            renderdoc_enabled: false,
            command_buffer_dump_enabled: false,
            profiler_enabled: false,
            shader_log_direction: "Silent".into(),
            shader_log_folder: "_Shaders".into(),
            printf_direction: "Silent".into(),
            printf_output_file: "_kyty.txt".into(),
            command_buffer_dump_folder: "_Buffers".into(),
            game_dirs: Vec::new(),
        }
    }
}

/// 0xfe/0xff are the reserved "everyone"/"system" user ids in the emulator.
pub fn is_user_id_valid(id: i32) -> bool {
    id >= 0 && id != 0xfe && id != 0xff
}

fn is_hex_color(s: &str) -> bool {
    s.len() == 7 && s.starts_with('#') && s[1..].chars().all(|c| c.is_ascii_hexdigit())
}

fn pick(value: Option<String>, options: &[&str], default: &str) -> String {
    value
        .filter(|v| options.contains(&v.as_str()))
        .unwrap_or_else(|| default.to_owned())
}

fn parse_bool(value: Option<String>, default: bool) -> bool {
    match value.as_deref().map(str::trim) {
        Some("true") => true,
        Some("false") => false,
        _ => default,
    }
}

fn parse_int(value: Option<String>, default: i32) -> i32 {
    value.and_then(|v| v.trim().parse().ok()).unwrap_or(default)
}

impl Settings {
    /// `get` returns the raw (still Qt-escaped) value for a key.
    pub fn read(get: &dyn Fn(&str) -> Option<String>) -> Self {
        let d = Self::default();
        let s = |k: &str| get(k).map(|raw| decode_string(&raw));

        let resolution = s("screen_resolution")
            .map(|r| r.trim_start_matches('R').to_ascii_lowercase())
            .filter(|r| RESOLUTIONS.contains(&r.as_str()))
            .unwrap_or(d.screen_resolution);
        let user_id = parse_int(s("user_id"), DEFAULT_USER_ID);
        let console_language = parse_int(s("console_language"), d.console_language);
        let controller_color = s("controller_color")
            .map(|c| c.to_ascii_lowercase())
            .filter(|c| is_hex_color(c))
            .unwrap_or_default();

        Self {
            user_name: s("user_name").unwrap_or(d.user_name),
            user_id: if is_user_id_valid(user_id) { user_id } else { DEFAULT_USER_ID },
            console_language: if (0..=MAX_CONSOLE_LANGUAGE).contains(&console_language) {
                console_language
            } else {
                1
            },
            controller_color,
            amd_cpu_enabled: parse_bool(s("amd_cpu_enabled"), d.amd_cpu_enabled),
            red_zone_protection_enabled: parse_bool(
                s("red_zone_protection_enabled"),
                d.red_zone_protection_enabled,
            ),
            audio_input_device: s("audio_input_device").unwrap_or_default(),
            screen_resolution: resolution,
            present_mode: pick(s("present_mode"), &PRESENT_MODES, &d.present_mode),
            vblank_frequency: parse_int(s("vblank_frequency"), d.vblank_frequency),
            shader_optimization_type: pick(
                s("shader_optimization_type"),
                &SHADER_OPTIMIZATIONS,
                &d.shader_optimization_type,
            ),
            gpu_index: parse_int(s("gpu_index"), -1).max(-1),
            fullscreen_enabled: parse_bool(s("fullscreen_enabled"), d.fullscreen_enabled),
            readback_linear_images: parse_bool(s("readback_linear_images"), d.readback_linear_images),
            tessellation_enabled: parse_bool(s("tessellation_enabled"), d.tessellation_enabled),
            vulkan_validation_enabled: parse_bool(
                s("vulkan_validation_enabled"),
                d.vulkan_validation_enabled,
            ),
            shader_validation_enabled: parse_bool(
                s("shader_validation_enabled"),
                d.shader_validation_enabled,
            ),
            renderdoc_enabled: parse_bool(s("renderdoc_enabled"), d.renderdoc_enabled),
            command_buffer_dump_enabled: parse_bool(
                s("command_buffer_dump_enabled"),
                d.command_buffer_dump_enabled,
            ),
            profiler_enabled: parse_bool(s("profiler_enabled"), d.profiler_enabled),
            shader_log_direction: pick(s("shader_log_direction"), &LOG_DIRECTIONS, &d.shader_log_direction),
            shader_log_folder: s("shader_log_folder").unwrap_or(d.shader_log_folder),
            printf_direction: pick(s("printf_direction"), &LOG_DIRECTIONS, &d.printf_direction),
            printf_output_file: s("printf_output_file").unwrap_or(d.printf_output_file),
            command_buffer_dump_folder: s("command_buffer_dump_folder")
                .unwrap_or(d.command_buffer_dump_folder),
            game_dirs: Vec::new(),
        }
    }

    /// Raw INI values for `[GlobalConfiguration]`, in the launcher's write order.
    pub fn entries(&self) -> Vec<(&'static str, String)> {
        let b = |v: bool| v.to_string();
        vec![
            ("screen_resolution", format!("R{}", self.screen_resolution.to_ascii_uppercase())),
            ("user_name", encode_str(&self.user_name)),
            ("user_id", self.user_id.to_string()),
            ("audio_input_device", encode_str(&self.audio_input_device)),
            ("controller_color", encode_str(&self.controller_color)),
            ("present_mode", self.present_mode.clone()),
            ("gpu_index", self.gpu_index.to_string()),
            ("fullscreen_enabled", b(self.fullscreen_enabled)),
            ("readback_linear_images", b(self.readback_linear_images)),
            ("tessellation_enabled", b(self.tessellation_enabled)),
            ("vblank_frequency", self.vblank_frequency.to_string()),
            ("console_language", self.console_language.to_string()),
            ("vulkan_validation_enabled", b(self.vulkan_validation_enabled)),
            ("shader_validation_enabled", b(self.shader_validation_enabled)),
            ("shader_optimization_type", self.shader_optimization_type.clone()),
            ("shader_log_direction", self.shader_log_direction.clone()),
            ("shader_log_folder", encode_str(&self.shader_log_folder)),
            ("command_buffer_dump_enabled", b(self.command_buffer_dump_enabled)),
            ("command_buffer_dump_folder", encode_str(&self.command_buffer_dump_folder)),
            ("printf_direction", self.printf_direction.clone()),
            ("printf_output_file", encode_str(&self.printf_output_file)),
            ("profiler_enabled", b(self.profiler_enabled)),
            ("renderdoc_enabled", b(self.renderdoc_enabled)),
            ("amd_cpu_enabled", b(self.amd_cpu_enabled)),
            ("red_zone_protection_enabled", b(self.red_zone_protection_enabled)),
        ]
    }

    pub fn validate(&self) -> Result<(), String> {
        let name_len = self.user_name.len();
        if name_len == 0 || name_len > MAX_USER_NAME_BYTES {
            return Err(format!("User name must be 1-{MAX_USER_NAME_BYTES} bytes long."));
        }
        if !is_user_id_valid(self.user_id) {
            return Err("User ID must be 0 or higher and cannot be 254 or 255.".into());
        }
        if !(0..=MAX_CONSOLE_LANGUAGE).contains(&self.console_language) {
            return Err("Unknown console language.".into());
        }
        if !(30..=360).contains(&self.vblank_frequency) {
            return Err("Vblank frequency must be between 30 and 360.".into());
        }
        if !self.controller_color.is_empty() && !is_hex_color(&self.controller_color) {
            return Err("Lightbar color must look like #RRGGBB.".into());
        }
        if self.gpu_index < -1 {
            return Err("Invalid GPU selection.".into());
        }
        let enums: [(&str, &[&str]); 5] = [
            (&self.screen_resolution, &RESOLUTIONS),
            (&self.present_mode, &PRESENT_MODES),
            (&self.shader_optimization_type, &SHADER_OPTIMIZATIONS),
            (&self.shader_log_direction, &LOG_DIRECTIONS),
            (&self.printf_direction, &LOG_DIRECTIONS),
        ];
        if let Some((v, _)) = enums.iter().find(|(v, opts)| !opts.contains(v)) {
            return Err(format!("Unsupported value \"{v}\"."));
        }
        Ok(())
    }
}

pub fn config_path(emulator_dir: &Path) -> PathBuf {
    let local = emulator_dir.join("Kyty.ini");
    if local.is_file() {
        return local;
    }
    let program_data = std::env::var_os("ProgramData").unwrap_or_else(|| "C:\\ProgramData".into());
    PathBuf::from(program_data).join("Kyty").join("Kyty.ini")
}

pub fn normalize_dir(dir: &str) -> String {
    let d = dir.trim().replace('\\', "/");
    let d = d.trim_end_matches('/');
    if d.ends_with(':') { format!("{d}/") } else { d.to_owned() }
}

/// Case-insensitive comparison key for a path (Windows semantics).
pub fn path_key(path: &str) -> String {
    normalize_dir(path).to_lowercase()
}

pub fn load(doc: &IniDoc) -> Settings {
    let has_global = !doc.entries(GLOBAL).is_empty();
    let mut settings = if has_global {
        Settings::read(&|k| doc.get(GLOBAL, k))
    } else {
        Settings::default()
    };

    let raw_dirs = doc.get(LAUNCHER, "game_dirs").or_else(|| doc.get(LAUNCHER, "game_dir"));
    let mut seen = std::collections::HashSet::new();
    settings.game_dirs = raw_dirs
        .map(|r| decode_list(&r))
        .unwrap_or_default()
        .iter()
        .map(|d| normalize_dir(d))
        .filter(|d| !d.is_empty() && seen.insert(path_key(d)))
        .collect();
    settings
}

/// Writes only keys whose value actually differs; returns the changed keys.
pub fn apply(doc: &mut IniDoc, new: &Settings) -> Vec<&'static str> {
    let old = load(doc);
    let old_entries: BTreeMap<_, _> = old.entries().into_iter().collect();
    let mut changed = Vec::new();

    for (key, value) in new.entries() {
        let missing = doc.get(GLOBAL, key).is_none();
        if missing || old_entries.get(key) != Some(&value) {
            doc.set(GLOBAL, key, &value);
            changed.push(key);
        }
    }

    let dirs: Vec<String> = new.game_dirs.iter().map(|d| normalize_dir(d)).filter(|d| !d.is_empty()).collect();
    if dirs != old.game_dirs || doc.get(LAUNCHER, "game_dirs").is_none() {
        doc.set(LAUNCHER, "game_dirs", &encode_list(&dirs));
        changed.push("game_dirs");
    }
    changed
}

/// Everything needed to start a game: per-game custom config when the original
/// launcher has one for it, otherwise the global configuration.
pub struct LaunchProfile {
    pub settings: Settings,
    pub host_input_mapping: Vec<String>,
    pub elf: String,
}

fn game_config_entries(doc: &IniDoc) -> Vec<BTreeMap<String, String>> {
    let mut by_index: BTreeMap<u32, BTreeMap<String, String>> = BTreeMap::new();
    for (key, value) in doc.entries(GAME_CONFIGS) {
        if let Some((idx, field)) = key.split_once('\\') {
            if let Ok(i) = idx.parse() {
                by_index.entry(i).or_default().insert(field.to_owned(), value);
            }
        }
    }
    by_index.into_values().collect()
}

pub fn custom_game_keys(doc: &IniDoc, game_dirs: &[String]) -> Vec<String> {
    game_config_entries(doc)
        .iter()
        .filter_map(|e| e.get("game_path").map(|p| decode_string(p)))
        .flat_map(|p| resolve_game_path_keys(&p, game_dirs))
        .collect()
}

/// Legacy launcher builds stored game paths relative to the game folder.
fn resolve_game_path_keys(stored: &str, game_dirs: &[String]) -> Vec<String> {
    let p = normalize_dir(stored);
    if Path::new(&p).is_absolute() {
        return vec![path_key(&p)];
    }
    game_dirs.iter().map(|root| path_key(&format!("{}/{p}", normalize_dir(root)))).collect()
}

pub fn launch_profile(doc: &IniDoc, game_path: &str) -> LaunchProfile {
    let global = load(doc);
    let target = path_key(game_path);

    let read_extras = |get: &dyn Fn(&str) -> Option<String>| {
        let mapping = get("host_input_mapping").map(|r| decode_list(&r)).unwrap_or_default();
        let elf = get("elf").map(|r| decode_string(&r)).unwrap_or_else(|| "eboot.bin".into());
        (mapping, elf)
    };

    for entry in game_config_entries(doc) {
        let Some(stored) = entry.get("game_path").map(|p| decode_string(p)) else { continue };
        if resolve_game_path_keys(&stored, &global.game_dirs).contains(&target) {
            let get = |k: &str| entry.get(k).cloned();
            let (host_input_mapping, elf) = read_extras(&get);
            return LaunchProfile { settings: Settings::read(&get), host_input_mapping, elf };
        }
    }

    let get = |k: &str| doc.get(GLOBAL, k);
    let (host_input_mapping, elf) = read_extras(&get);
    LaunchProfile { settings: global, host_input_mapping, elf }
}

#[cfg(test)]
mod tests {
    use super::*;

    const REAL: &str = "[MainDialog]\r\ncheck_updates_on_startup=true\r\n\r\n[Launcher]\r\ngame_dirs=C:/Users/You/Downloads/ps5 games\r\n\r\n[GlobalConfiguration]\r\nname=\r\nbasedir=\r\ngame_path=\r\ncustom_settings=false\r\nscreen_resolution=R1280X720\r\nuser_name=Kyty\r\nuser_id=1000\r\naudio_input_device=\r\ncontroller_color=\r\npresent_mode=Mailbox\r\ngpu_index=0\r\nfullscreen_enabled=false\r\nreadback_linear_images=false\r\ntessellation_enabled=false\r\nvblank_frequency=60\r\nconsole_language=1\r\nvulkan_validation_enabled=false\r\nshader_validation_enabled=true\r\nshader_optimization_type=Performance\r\nshader_log_direction=Silent\r\nshader_log_folder=_Shaders\r\ncommand_buffer_dump_enabled=false\r\ncommand_buffer_dump_folder=_Buffers\r\nprintf_direction=File\r\nprintf_output_file=_kyty.txt\r\nprofiler_enabled=false\r\nrenderdoc_enabled=false\r\namd_cpu_enabled=true\r\nred_zone_protection_enabled=false\r\nhost_input_mapping=@Invalid()\r\nelf=eboot.bin\r\n\r\n[GameConfigurations]\r\nsize=0\r\n";

    #[test]
    fn reads_real_config() {
        let s = load(&IniDoc::parse(REAL));
        assert_eq!(s.screen_resolution, "1280x720");
        assert!(s.amd_cpu_enabled);
        assert_eq!(s.gpu_index, 0);
        assert_eq!(s.printf_direction, "File");
        assert_eq!(s.game_dirs, vec!["C:/Users/You/Downloads/ps5 games".to_string()]);
    }

    #[test]
    fn unchanged_settings_write_nothing() {
        let mut doc = IniDoc::parse(REAL);
        let s = load(&doc);
        assert!(apply(&mut doc, &s).is_empty());
        assert_eq!(doc.serialize(), REAL);
    }

    #[test]
    fn only_changed_keys_are_written() {
        let mut doc = IniDoc::parse(REAL);
        let mut s = load(&doc);
        s.fullscreen_enabled = true;
        s.screen_resolution = "1920x1080".into();
        let changed = apply(&mut doc, &s);
        assert_eq!(changed, vec!["screen_resolution", "fullscreen_enabled"]);
        let out = doc.serialize();
        assert!(out.contains("screen_resolution=R1920X1080\r\n"));
        assert!(out.contains("fullscreen_enabled=true\r\n"));
        let reverted = out
            .replace("R1920X1080", "R1280X720")
            .replace("fullscreen_enabled=true", "fullscreen_enabled=false");
        assert_eq!(reverted, REAL);
    }

    #[test]
    fn per_game_profile_wins() {
        let text = REAL.replace("[GameConfigurations]\r\nsize=0", "[GameConfigurations]\r\n1\\game_path=C:/Games/X\r\n1\\fullscreen_enabled=true\r\n1\\elf=eboot.bin\r\nsize=1");
        let doc = IniDoc::parse(&text);
        assert!(launch_profile(&doc, "c:\\games\\x\\").settings.fullscreen_enabled);
        assert!(!launch_profile(&doc, "C:/Games/Y").settings.fullscreen_enabled);
    }
}
