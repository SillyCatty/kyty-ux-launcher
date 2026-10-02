use std::{
    io::{BufRead, BufReader, Read},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::settings::LaunchProfile;

pub const EMULATOR_EXE: &str = "kyty_emulator.exe";
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const MAX_LOG_BATCH: usize = 400;

/// Port of `CreateEmulatorArgs` from launcher/src/mainDialog.cpp.
pub fn build_args(profile: &LaunchProfile, game_dir: &Path, title_id: &str, emulator_dir: &Path) -> Vec<String> {
    let s = &profile.settings;
    let b = |v: bool| if v { "true" } else { "false" };
    let (w, h) = s.screen_resolution.split_once('x').unwrap_or(("1280", "720"));
    let mut a = Args::default();

    a.kv("--screen-width", w);
    a.kv("--screen-height", h);
    a.kv("--user-name", &s.user_name);
    a.kv("--user-id", &s.user_id.to_string());
    if !s.audio_input_device.is_empty() {
        a.kv("--mic", &s.audio_input_device);
    }
    if !s.controller_color.is_empty() {
        a.kv("--controller-color", &s.controller_color);
    }
    a.kv("--present-mode", &s.present_mode);
    if s.gpu_index >= 0 {
        a.kv("--gpu", &s.gpu_index.to_string());
    }
    a.flag_if(s.fullscreen_enabled, "--fullscreen");
    a.kv("--readback-linear-images", b(s.readback_linear_images));
    a.flag_if(s.tessellation_enabled, "--tessellation");
    a.kv("--vblank-frequency", &s.vblank_frequency.to_string());
    a.kv("--console-language", &s.console_language.to_string());
    a.kv("--vulkan-validation", b(s.vulkan_validation_enabled));
    a.kv("--shader-validation", b(s.shader_validation_enabled));
    a.kv("--shader-optimization-type", &s.shader_optimization_type);
    a.kv("--shader-log-direction", &s.shader_log_direction);
    a.kv("--shader-log-folder", &s.shader_log_folder);
    a.kv("--command-buffer-dump", b(s.command_buffer_dump_enabled));
    a.kv("--command-buffer-dump-folder", &s.command_buffer_dump_folder);
    a.kv("--printf-direction", &s.printf_direction);
    a.kv("--printf-output-file", &s.printf_output_file);
    a.flag_if(s.profiler_enabled, "--profile");
    a.kv("--spirv-debug-printf", "false");
    a.flag_if(s.amd_cpu_enabled, "--amd-cpu");
    a.flag_if(s.red_zone_protection_enabled, "--redzone");
    for binding in &profile.host_input_mapping {
        a.kv("--keymap", binding);
    }
    a.flag_if(s.renderdoc_enabled, "--rd");

    let game = if profile.elf.is_empty() { game_dir.to_path_buf() } else { game_dir.join(&profile.elf) };
    a.kv("--game", &game.to_string_lossy());

    let title_id = title_id.trim();
    if !title_id.is_empty() {
        let patch = emulator_dir.join("_Patches").join(format!("{}.json", title_id.to_uppercase()));
        if patch.is_file() {
            a.kv("--game-patch", &patch.to_string_lossy());
        }
    }
    a.0
}

#[derive(Default)]
struct Args(Vec<String>);

impl Args {
    fn kv(&mut self, key: &str, value: &str) {
        self.0.push(key.to_owned());
        self.0.push(value.to_owned());
    }

    fn flag_if(&mut self, on: bool, flag: &str) {
        if on {
            self.0.push(flag.to_owned());
        }
    }
}

#[derive(Clone, Serialize)]
pub struct RunningInfo {
    pub game_id: String,
    pub name: String,
    pub started_at: u64,
    pub pid: u32,
}

pub struct RunningGame {
    child: Child,
    pub info: RunningInfo,
    started: Instant,
}

pub type Running = Arc<Mutex<Option<RunningGame>>>;

#[derive(Clone, Serialize)]
pub struct ExitInfo {
    pub game_id: String,
    pub code: Option<i32>,
    pub seconds: u64,
}

fn pump<R: Read + Send + 'static>(reader: R, sink: Arc<Mutex<Vec<String>>>) {
    thread::spawn(move || {
        let mut reader = BufReader::new(reader);
        let mut buf = Vec::new();
        while reader.read_until(b'\n', &mut buf).is_ok_and(|n| n > 0) {
            let line = String::from_utf8_lossy(&buf).trim_end().to_owned();
            buf.clear();
            if let Ok(mut lines) = sink.lock() {
                lines.push(line);
                // Keep memory bounded if the UI can't keep up with a chatty game.
                if lines.len() > MAX_LOG_BATCH * 4 {
                    let excess = lines.len() - MAX_LOG_BATCH;
                    lines.drain(..excess);
                }
            }
        }
    });
}

/// Starts the emulator without any window of its own; only the game window appears.
pub fn spawn(
    app: AppHandle,
    running: Running,
    emulator_dir: &Path,
    args: Vec<String>,
    info: RunningInfo,
    on_exit: impl FnOnce(ExitInfo) + Send + 'static,
) -> Result<RunningInfo, String> {
    let mut guard = running.lock().map_err(|_| "Internal state is poisoned")?;
    if guard.is_some() {
        return Err("A game is already running.".into());
    }

    let exe: PathBuf = emulator_dir.join(EMULATOR_EXE);
    let mut cmd = Command::new(&exe);
    cmd.args(&args)
        .current_dir(emulator_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = cmd.spawn().map_err(|e| format!("Couldn't start {}: {e}", exe.display()))?;

    let logs = Arc::new(Mutex::new(Vec::<String>::new()));
    if let Some(out) = child.stdout.take() {
        pump(out, logs.clone());
    }
    if let Some(err) = child.stderr.take() {
        pump(err, logs.clone());
    }

    let info = RunningInfo { pid: child.id(), ..info };
    *guard = Some(RunningGame { child, info: info.clone(), started: Instant::now() });
    drop(guard);
    let _ = app.emit("emulator-started", info.clone());

    let watcher_running = running.clone();
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(200));

        let batch: Vec<String> = logs.lock().map(|mut l| std::mem::take(&mut *l)).unwrap_or_default();
        if !batch.is_empty() {
            let start = batch.len().saturating_sub(MAX_LOG_BATCH);
            let _ = app.emit("emulator-log", &batch[start..]);
        }

        let Ok(mut guard) = watcher_running.lock() else { break };
        let Some(game) = guard.as_mut() else { break };
        let status = match game.child.try_wait() {
            Ok(None) => continue,
            Ok(Some(status)) => status.code(),
            Err(_) => None,
        };
        let Some(game) = guard.take() else { break };
        drop(guard);

        let exit = ExitInfo {
            game_id: game.info.game_id,
            code: status,
            seconds: game.started.elapsed().as_secs(),
        };
        let _ = app.emit("emulator-exit", exit.clone());
        on_exit(exit);
        break;
    });

    Ok(info)
}

fn force_kill(running: &Running) -> Result<(), String> {
    let mut guard = running.lock().map_err(|_| "Internal state is poisoned")?;
    match guard.as_mut() {
        // The watcher thread notices the exit and does the bookkeeping.
        Some(game) => game.child.kill().map_err(|e| format!("Couldn't stop the emulator: {e}")),
        None => Ok(()),
    }
}

/// Posts WM_CLOSE to the process's windows so the emulator shuts down cleanly (saves, pipeline cache).
#[cfg(windows)]
fn request_close(pid: u32) -> bool {
    use windows_sys::Win32::{
        Foundation::{HWND, LPARAM},
        UI::WindowsAndMessaging::{EnumWindows, GetWindowThreadProcessId, PostMessageW, WM_CLOSE},
    };

    struct Search {
        pid: u32,
        posted: bool,
    }

    unsafe extern "system" fn visit(hwnd: HWND, lparam: LPARAM) -> i32 {
        let search = &mut *(lparam as *mut Search);
        let mut owner = 0u32;
        GetWindowThreadProcessId(hwnd, &mut owner);
        if owner == search.pid && PostMessageW(hwnd, WM_CLOSE, 0, 0) != 0 {
            search.posted = true;
        }
        1
    }

    let mut search = Search { pid, posted: false };
    unsafe { EnumWindows(Some(visit), &mut search as *mut Search as LPARAM) };
    search.posted
}

#[cfg(not(windows))]
fn request_close(_pid: u32) -> bool {
    false
}

/// Asks the game to close; force-kills it if it hasn't exited after a grace period.
pub fn stop(running: &Running) -> Result<(), String> {
    let Some(pid) = current(running).map(|i| i.pid) else { return Ok(()) };
    if !request_close(pid) {
        return force_kill(running);
    }
    let running = running.clone();
    thread::spawn(move || {
        for _ in 0..50 {
            thread::sleep(Duration::from_millis(200));
            if current(&running).is_none_or(|i| i.pid != pid) {
                return;
            }
        }
        let _ = force_kill(&running);
    });
    Ok(())
}

pub fn current(running: &Running) -> Option<RunningInfo> {
    running.lock().ok()?.as_ref().map(|g| g.info.clone())
}

/// First stdout line of a bare `kyty_emulator.exe` run, e.g.
/// `Release, clang-lld_link, ver = 0.3.0, git = b7a1fac, date = 2026.09.30`.
pub fn version_line(emulator_dir: &Path) -> Option<String> {
    let mut cmd = Command::new(emulator_dir.join(EMULATOR_EXE));
    cmd.current_dir(emulator_dir).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = cmd.spawn().ok()?;
    let stdout = child.stdout.take()?;
    let (tx, rx) = std::sync::mpsc::channel();
    thread::spawn(move || {
        let mut out = String::new();
        let _ = BufReader::new(stdout).take(64 * 1024).read_to_string(&mut out);
        let _ = tx.send(out);
    });
    let out = rx.recv_timeout(Duration::from_secs(10)).ok();
    let _ = child.kill();
    let _ = child.wait();
    out?.lines()
        .map(str::trim)
        .find(|l| l.contains("git =") || l.contains("ver ="))
        .map(str::to_owned)
}

fn field<'a>(line: &'a str, name: &str) -> Option<&'a str> {
    line.split(',').map(str::trim).find_map(|part| {
        let (k, v) = part.split_once('=')?;
        (k.trim() == name).then(|| v.trim())
    })
}

/// Reconstructs the GitHub release tag (`KytyPS5-YYYY-MM-DD-<sha7>`) from the version line.
pub fn release_tag(line: &str) -> Option<String> {
    let git = field(line, "git")?;
    let date = field(line, "date")?.replace('.', "-");
    (!git.is_empty() && date.len() == 10).then(|| format!("KytyPS5-{date}-{git}"))
}

pub fn semver(line: &str) -> Option<String> {
    field(line, "ver").map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{ini::IniDoc, settings};

    #[test]
    fn version_parsing() {
        let line = "Release, clang-lld_link, ver = 0.3.0, git = b7a1fac, date = 2026.09.30";
        assert_eq!(release_tag(line).as_deref(), Some("KytyPS5-2026-09-30-b7a1fac"));
        assert_eq!(semver(line).as_deref(), Some("0.3.0"));
    }

    #[test]
    fn args_match_original_launcher() {
        let doc = IniDoc::parse("[GlobalConfiguration]\nscreen_resolution=R1920X1080\namd_cpu_enabled=true\nprintf_direction=File\ngpu_index=0\nfullscreen_enabled=true\nhost_input_mapping=Cross=Space, Circle=Escape\n");
        let profile = settings::launch_profile(&doc, "C:/g");
        let args = build_args(&profile, Path::new("C:\\g"), "", Path::new("C:\\emu"));
        let joined = args.join(" ");
        assert!(joined.starts_with("--screen-width 1920 --screen-height 1080 --user-name Kyty --user-id 1000 --present-mode Mailbox --gpu 0 --fullscreen --readback-linear-images false"));
        assert!(joined.contains("--printf-direction File --printf-output-file _kyty.txt --spirv-debug-printf false --amd-cpu --keymap Cross=Space --keymap Circle=Escape --game C:\\g\\eboot.bin"));
    }
}
