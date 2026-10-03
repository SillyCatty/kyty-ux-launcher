//! PS4 support for the original Kyty emulator (https://github.com/InoriRus/Kyty).
//!
//! Unlike KytyPS5 it has no command-line flags: the emulator (`fc_script.exe`) runs a Lua script that the
//! original launcher generates. This module reproduces that script, so the Qt launcher isn't needed.

use std::{fs, path::Path};

use serde::{Deserialize, Serialize};

pub const RESOLUTIONS: [&str; 2] = ["1280x720", "1920x1080"];
pub const OPTIMIZATIONS: [&str; 3] = ["None", "Size", "Performance"];
pub const LOG_DIRECTIONS: [&str; 3] = ["Silent", "Console", "File"];
pub const PROFILER_DIRECTIONS: [&str; 4] = ["None", "File", "Network", "FileAndNetwork"];
const MAX_ELF_SCAN: usize = 4000;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Ps4Settings {
    pub screen_resolution: String,
    /// PS4 Pro ("Neo") mode.
    pub neo: bool,
    pub vulkan_validation_enabled: bool,
    pub shader_validation_enabled: bool,
    pub shader_optimization_type: String,
    pub shader_log_direction: String,
    pub shader_log_folder: String,
    pub command_buffer_dump_enabled: bool,
    pub command_buffer_dump_folder: String,
    pub printf_direction: String,
    pub printf_output_file: String,
    pub profiler_direction: String,
    pub profiler_output_file: String,
}

impl Default for Ps4Settings {
    fn default() -> Self {
        Self {
            screen_resolution: "1280x720".into(),
            neo: true,
            // The original defaults this on, but it needs the Vulkan SDK's validation layer; off is safer for end users.
            vulkan_validation_enabled: false,
            shader_validation_enabled: true,
            shader_optimization_type: "Performance".into(),
            shader_log_direction: "Silent".into(),
            shader_log_folder: "_Shaders".into(),
            command_buffer_dump_enabled: false,
            command_buffer_dump_folder: "_Buffers".into(),
            printf_direction: "Silent".into(),
            printf_output_file: "_kyty.txt".into(),
            profiler_direction: "None".into(),
            profiler_output_file: "_profile.prof".into(),
        }
    }
}

fn clean_name(s: &str) -> bool {
    !s.trim().is_empty() && !s.chars().any(|c| c.is_control())
}

impl Ps4Settings {
    pub fn validate(&self) -> Result<(), String> {
        let enums: [(&str, &[&str], &str); 5] = [
            (&self.screen_resolution, &RESOLUTIONS, "resolution"),
            (&self.shader_optimization_type, &OPTIMIZATIONS, "shader optimization"),
            (&self.shader_log_direction, &LOG_DIRECTIONS, "shader logging"),
            (&self.printf_direction, &LOG_DIRECTIONS, "printf output"),
            (&self.profiler_direction, &PROFILER_DIRECTIONS, "profiler"),
        ];
        for (value, options, what) in enums {
            if !options.contains(&value) {
                return Err(format!("Unsupported {what} \"{value}\"."));
            }
        }
        for (value, what) in [
            (&self.shader_log_folder, "Shader log folder"),
            (&self.command_buffer_dump_folder, "Command buffer folder"),
            (&self.printf_output_file, "Printf output file"),
            (&self.profiler_output_file, "Profiler output file"),
        ] {
            if !clean_name(value) {
                return Err(format!("{what} can't be empty."));
            }
        }
        Ok(())
    }
}

/// Names of the fields whose value differs.
pub fn changed_keys(old: &Ps4Settings, new: &Ps4Settings) -> Vec<String> {
    let (Ok(serde_json::Value::Object(a)), Ok(serde_json::Value::Object(b))) = (serde_json::to_value(old), serde_json::to_value(new)) else {
        return Vec::new();
    };
    b.iter().filter(|(k, v)| a.get(*k) != Some(*v)).map(|(k, _)| k.clone()).collect()
}

/// Lua single-quoted string literal. Backslashes are normalised to `/` first (paths), and everything
/// that could end the literal or inject code is escaped.
pub fn lua_str(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('\'');
    for c in s.replace('\\', "/").chars() {
        match c {
            '\'' => out.push_str("\\'"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            c if c.is_control() => out.push_str(&format!("\\{}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('\'');
    out
}

/// The script the original launcher writes to `kyty_run.lua`.
pub fn lua_script(s: &Ps4Settings, basedir: &str, param_sfo: Option<&str>, elfs: &[String]) -> String {
    let (w, h) = s.screen_resolution.split_once('x').unwrap_or(("1280", "720"));
    let b = |v: bool| if v { "true" } else { "false" };
    let mut out = String::new();
    out.push_str("local cfg = {\n");
    out.push_str(&format!("\t ScreenWidth = {w};\n\t ScreenHeight = {h};\n\t Neo = {};\n", b(s.neo)));
    out.push_str(&format!("\t VulkanValidationEnabled = {};\n", b(s.vulkan_validation_enabled)));
    out.push_str(&format!("\t ShaderValidationEnabled = {};\n", b(s.shader_validation_enabled)));
    out.push_str(&format!("\t ShaderOptimizationType = {};\n", lua_str(&s.shader_optimization_type)));
    out.push_str(&format!("\t ShaderLogDirection = {};\n", lua_str(&s.shader_log_direction)));
    out.push_str(&format!("\t ShaderLogFolder = {};\n", lua_str(&s.shader_log_folder)));
    out.push_str(&format!("\t CommandBufferDumpEnabled = {};\n", b(s.command_buffer_dump_enabled)));
    out.push_str(&format!("\t CommandBufferDumpFolder = {};\n", lua_str(&s.command_buffer_dump_folder)));
    out.push_str(&format!("\t PrintfDirection = {};\n", lua_str(&s.printf_direction)));
    out.push_str(&format!("\t PrintfOutputFile = {};\n", lua_str(&s.printf_output_file)));
    out.push_str(&format!("\t ProfilerDirection = {};\n", lua_str(&s.profiler_direction)));
    out.push_str(&format!("\t ProfilerOutputFile = {};\n", lua_str(&s.profiler_output_file)));
    out.push_str("\t SpirvDebugPrintfEnabled = false;\n}\n");
    out.push_str("kyty_init(cfg);\n");
    out.push_str(&format!("kyty_mount({}, '/app0');\n", lua_str(basedir)));
    if let Some(param) = param_sfo {
        out.push_str(&format!("kyty_load_param_sfo({});\n", lua_str(param)));
    }
    for elf in elfs {
        out.push_str(&format!("kyty_load_elf({});\n", lua_str(&format!("/app0/{elf}"))));
    }
    out.push_str("kyty_load_symbols_all();\nkyty_execute();\n");
    out
}

/// Every loadable module in a game folder, as `/`-separated paths relative to it.
pub fn scan_elfs(basedir: &Path) -> Vec<String> {
    let mut found = Vec::new();
    let mut stack = vec![basedir.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            let Ok(kind) = entry.file_type() else { continue };
            if kind.is_dir() && !kind.is_symlink() {
                stack.push(path);
            } else if kind.is_file() {
                let name = entry.file_name().to_string_lossy().to_lowercase();
                let ext = name.rsplit_once('.').map(|(_, e)| e.to_owned()).unwrap_or_default();
                if name == "eboot.bin" || matches!(ext.as_str(), "elf" | "prx" | "sprx") {
                    if let Ok(rel) = path.strip_prefix(basedir) {
                        found.push(rel.to_string_lossy().replace('\\', "/"));
                    }
                }
            }
            if found.len() >= MAX_ELF_SCAN {
                found.sort();
                return found;
            }
        }
    }
    found.sort();
    found
}

/// Without a saved choice only the main executable is loaded; system libraries are emulated by Kyty itself.
pub fn default_elfs(basedir: &Path) -> Vec<String> {
    let all = scan_elfs(basedir);
    if all.iter().any(|e| e == "eboot.bin") {
        return vec!["eboot.bin".into()];
    }
    all.into_iter().find(|e| e.to_lowercase().ends_with("eboot.bin")).into_iter().collect()
}

/// A relative module path must stay inside the game folder.
pub fn safe_relative(path: &str) -> bool {
    !path.is_empty()
        && !path.starts_with('/')
        && !path.contains(':')
        && !path.split(['/', '\\']).any(|part| part == ".." || part.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generates_the_same_script_shape_as_the_original_launcher() {
        let s = Ps4Settings { screen_resolution: "1920x1080".into(), neo: false, ..Default::default() };
        let lua = lua_script(&s, "C:\\Games\\My Game", Some("C:\\Games\\My Game\\sce_sys\\param.sfo"), &["eboot.bin".into(), "sce_module/game.prx".into()]);
        let expected = "local cfg = {\n\t ScreenWidth = 1920;\n\t ScreenHeight = 1080;\n\t Neo = false;\n\t VulkanValidationEnabled = false;\n\t ShaderValidationEnabled = true;\n\t ShaderOptimizationType = 'Performance';\n\t ShaderLogDirection = 'Silent';\n\t ShaderLogFolder = '_Shaders';\n\t CommandBufferDumpEnabled = false;\n\t CommandBufferDumpFolder = '_Buffers';\n\t PrintfDirection = 'Silent';\n\t PrintfOutputFile = '_kyty.txt';\n\t ProfilerDirection = 'None';\n\t ProfilerOutputFile = '_profile.prof';\n\t SpirvDebugPrintfEnabled = false;\n}\nkyty_init(cfg);\nkyty_mount('C:/Games/My Game', '/app0');\nkyty_load_param_sfo('C:/Games/My Game/sce_sys/param.sfo');\nkyty_load_elf('/app0/eboot.bin');\nkyty_load_elf('/app0/sce_module/game.prx');\nkyty_load_symbols_all();\nkyty_execute();\n";
        assert_eq!(lua, expected);
    }

    #[test]
    fn param_sfo_line_is_omitted_when_absent() {
        let lua = lua_script(&Ps4Settings::default(), "C:/g", None, &["eboot.bin".into()]);
        assert!(!lua.contains("kyty_load_param_sfo"));
    }

    #[test]
    fn lua_strings_cannot_be_broken_out_of() {
        assert_eq!(lua_str("it's"), "'it\\'s'");
        assert_eq!(lua_str("a\\b"), "'a/b'");
        let evil = lua_str("x');os.execute('calc')--");
        assert_eq!(evil, "'x\\');os.execute(\\'calc\\')--'");
        assert_eq!(lua_str("line1\nline2\r\0"), "'line1\\nline2\\r\\0'");
    }

    #[test]
    fn validates_settings() {
        assert!(Ps4Settings::default().validate().is_ok());
        let bad = Ps4Settings { screen_resolution: "640x480".into(), ..Default::default() };
        assert!(bad.validate().unwrap_err().contains("resolution"));
        let bad = Ps4Settings { printf_output_file: "  ".into(), ..Default::default() };
        assert!(bad.validate().is_err());
        let bad = Ps4Settings { profiler_direction: "Sideways".into(), ..Default::default() };
        assert!(bad.validate().is_err());
    }

    #[test]
    fn reports_only_changed_keys() {
        let a = Ps4Settings::default();
        let b = Ps4Settings { neo: false, screen_resolution: "1920x1080".into(), ..Default::default() };
        let mut keys = changed_keys(&a, &b);
        keys.sort();
        assert_eq!(keys, vec!["neo", "screen_resolution"]);
        assert!(changed_keys(&a, &a).is_empty());
    }

    #[test]
    fn finds_modules_and_picks_a_sensible_default() {
        let base = std::env::temp_dir().join(format!("kyty-ps4-elfs-{}", std::process::id()));
        let touch = |rel: &str| {
            let f = base.join(rel);
            fs::create_dir_all(f.parent().unwrap()).unwrap();
            fs::write(f, b"x").unwrap();
        };
        touch("eboot.bin");
        touch("sce_module/libc.prx");
        touch("Modules/Game.SPRX");
        touch("data/readme.txt");
        let all = scan_elfs(&base);
        assert_eq!(all, vec!["Modules/Game.SPRX", "eboot.bin", "sce_module/libc.prx"]);
        assert_eq!(default_elfs(&base), vec!["eboot.bin"]);
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn rejects_unsafe_module_paths() {
        assert!(safe_relative("eboot.bin"));
        assert!(safe_relative("sce_module/a.prx"));
        assert!(!safe_relative("../evil.prx"));
        assert!(!safe_relative("/abs.prx"));
        assert!(!safe_relative("C:/x.prx"));
        assert!(!safe_relative("a//b.prx"));
        assert!(!safe_relative(""));
    }
}
