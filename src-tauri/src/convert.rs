//! Runs a user-supplied .pkg converter. The launcher only launches the tool the user configured;
//! it contains no unpacking or decryption logic of its own.

use std::{
    io::{BufRead, BufReader, Read},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub struct Job {
    child: Child,
    cancelled: bool,
}

pub type Active = Arc<Mutex<Option<Job>>>;

#[derive(Serialize, Clone)]
pub struct Done {
    pub name: String,
    pub ok: bool,
    pub cancelled: bool,
    pub code: Option<i32>,
    pub found: usize,
    pub out_dir: String,
}

/// Splits an argument template into tokens, honouring double quotes (no shell is ever involved).
pub fn split_args(template: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut cur = String::new();
    let mut in_quotes = false;
    let mut has_token = false;
    for c in template.chars() {
        match c {
            '"' => {
                in_quotes = !in_quotes;
                has_token = true;
            }
            c if c.is_whitespace() && !in_quotes => {
                if has_token {
                    args.push(std::mem::take(&mut cur));
                    has_token = false;
                }
            }
            c => {
                cur.push(c);
                has_token = true;
            }
        }
    }
    if has_token {
        args.push(cur);
    }
    args
}

pub fn render_args(template: &str, pkg: &Path, out: &Path) -> Vec<String> {
    let pkg = pkg.to_string_lossy();
    let out = out.to_string_lossy();
    split_args(template)
        .into_iter()
        .map(|token| token.replace("{pkg}", &pkg).replace("{out}", &out))
        .collect()
}

/// Folder name for the converted game, safe to create on Windows.
pub fn output_name(pkg: &Path) -> String {
    let stem = pkg.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let clean: String = stem
        .chars()
        .map(|c| if c.is_alphanumeric() || matches!(c, ' ' | '-' | '_' | '.' | '[' | ']' | '(' | ')') { c } else { '_' })
        .collect();
    let clean = clean.trim().trim_end_matches('.').to_owned();
    if clean.is_empty() { "converted-game".into() } else { clean }
}

pub fn is_pkg(path: &Path) -> bool {
    path.is_file() && path.extension().is_some_and(|e| e.eq_ignore_ascii_case("pkg"))
}

fn pump<R: Read + Send + 'static>(reader: R, sink: Arc<Mutex<Vec<String>>>) {
    thread::spawn(move || {
        let mut reader = BufReader::new(reader);
        let mut buf = Vec::new();
        while reader.read_until(b'\n', &mut buf).is_ok_and(|n| n > 0) {
            let text = String::from_utf8_lossy(&buf).into_owned();
            buf.clear();
            // Progress bars rewrite the same line with \r; keep only the latest state.
            let line = text.trim_end().rsplit('\r').next().unwrap_or_default().trim().to_owned();
            if !line.is_empty() {
                if let Ok(mut lines) = sink.lock() {
                    lines.push(line);
                    if lines.len() > 200 {
                        lines.drain(..100);
                    }
                }
            }
        }
    });
}

pub fn start(
    app: AppHandle,
    active: Active,
    program: PathBuf,
    args: Vec<String>,
    name: String,
    out_dir: PathBuf,
    count_games: impl Fn(&Path) -> usize + Send + 'static,
) -> Result<(), String> {
    let mut guard = active.lock().map_err(|_| "Internal state is poisoned")?;
    if guard.is_some() {
        return Err("A conversion is already running.".into());
    }

    let mut cmd = Command::new(&program);
    cmd.args(&args)
        .current_dir(program.parent().unwrap_or_else(|| Path::new(".")))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = cmd.spawn().map_err(|e| format!("Couldn't start {}: {e}", program.display()))?;

    let lines = Arc::new(Mutex::new(Vec::<String>::new()));
    if let Some(out) = child.stdout.take() {
        pump(out, lines.clone());
    }
    if let Some(err) = child.stderr.take() {
        pump(err, lines.clone());
    }
    *guard = Some(Job { child, cancelled: false });
    drop(guard);

    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(250));
        let batch: Vec<String> = lines.lock().map(|mut l| std::mem::take(&mut *l)).unwrap_or_default();
        if let Some(last) = batch.last() {
            let _ = app.emit("convert-log", last);
        }

        let Ok(mut guard) = active.lock() else { break };
        let Some(job) = guard.as_mut() else { break };
        let code = match job.child.try_wait() {
            Ok(None) => continue,
            Ok(Some(status)) => status.code(),
            Err(_) => None,
        };
        let Some(job) = guard.take() else { break };
        drop(guard);

        let ok = code == Some(0) && !job.cancelled;
        let found = if ok { count_games(&out_dir) } else { 0 };
        let _ = app.emit(
            "convert-done",
            Done { name: name.clone(), ok, cancelled: job.cancelled, code, found, out_dir: out_dir.to_string_lossy().into_owned() },
        );
        break;
    });
    Ok(())
}

/// Kills the converter and everything it started, so helper processes aren't left running.
fn kill_tree(pid: u32) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|s| s.success())
    }
    #[cfg(not(windows))]
    {
        let _ = pid;
        false
    }
}

pub fn cancel(active: &Active) -> Result<(), String> {
    let mut guard = active.lock().map_err(|_| "Internal state is poisoned")?;
    if let Some(job) = guard.as_mut() {
        job.cancelled = true;
        if !kill_tree(job.child.id()) {
            job.child.kill().map_err(|e| format!("Couldn't stop the converter: {e}"))?;
        }
    }
    Ok(())
}

pub fn is_running(active: &Active) -> bool {
    active.lock().is_ok_and(|g| g.is_some())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_quoted_arguments() {
        assert_eq!(split_args("\"{pkg}\" \"{out}\""), vec!["{pkg}", "{out}"]);
        assert_eq!(split_args("-i {pkg} -o \"{out dir}\" --fast"), vec!["-i", "{pkg}", "-o", "{out dir}", "--fast"]);
        assert_eq!(split_args("   "), Vec::<String>::new());
        assert_eq!(split_args("\"\""), vec![""]);
    }

    #[test]
    fn renders_placeholders_without_a_shell() {
        let args = render_args("-i \"{pkg}\" -o \"{out}\"", Path::new("C:\\g\\My Game.pkg"), Path::new("C:\\games\\My Game"));
        assert_eq!(args, vec!["-i", "C:\\g\\My Game.pkg", "-o", "C:\\games\\My Game"]);
        // A hostile file name stays a single argument; nothing is interpreted.
        let evil = render_args("{pkg}", Path::new("a & calc.exe.pkg"), Path::new("o"));
        assert_eq!(evil, vec!["a & calc.exe.pkg"]);
    }

    #[test]
    fn output_names_are_filesystem_safe() {
        assert_eq!(output_name(Path::new("C:\\x\\Game: Deluxe?.pkg")), "Game_ Deluxe_");
        assert_eq!(output_name(Path::new("C:\\x\\[Group]-Title-PPSA1.pkg")), "[Group]-Title-PPSA1");
        assert_eq!(output_name(Path::new("")), "converted-game");
    }
}
