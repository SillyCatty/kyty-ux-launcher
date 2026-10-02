//! KytyPS5 ships portable zips (no installer), so a "silent install" is:
//! download → extract to staging → swap files in place, keeping saves and config.

use std::{
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
    time::Duration,
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::emulator::EMULATOR_EXE;

const ASSET_SUFFIX: &str = "-windows-x64.zip";
const MAX_UNPACKED_BYTES: u64 = 8 * 1024 * 1024 * 1024;
/// Runtime data and user files that an update must never overwrite.
const PRESERVED: [&str; 8] =
    ["_savedata", "_downloaddata", "_tempdata", "_shaders", "_buffers", "_patches", "kyty.ini", "_kyty.txt"];

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    html_url: String,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    assets: Vec<Asset>,
}

#[derive(Deserialize)]
struct Asset {
    name: String,
    browser_download_url: String,
    size: u64,
}

#[derive(Serialize, Clone)]
pub struct UpdateInfo {
    pub current_tag: Option<String>,
    pub latest_tag: String,
    pub update_available: bool,
    pub asset_name: Option<String>,
    pub asset_size: u64,
    pub notes: String,
    pub html_url: String,
    #[serde(skip)]
    download_url: Option<String>,
}

#[derive(Serialize, Clone)]
struct Progress<'a> {
    stage: &'a str,
    downloaded: u64,
    total: u64,
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("Kyty-Launcher")
        .connect_timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())
}

fn valid_repo(repo: &str) -> bool {
    let mut parts = repo.split('/');
    let ok = |s: &str| {
        !s.is_empty()
            && !s.chars().all(|c| c == '.')
            && s.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
    };
    matches!((parts.next(), parts.next(), parts.next()), (Some(o), Some(r), None) if ok(o) && ok(r))
}

fn trusted_download_host(url: &str) -> bool {
    reqwest::Url::parse(url).ok().is_some_and(|u| {
        u.scheme() == "https"
            && u.host_str().is_some_and(|h| h == "github.com" || h.ends_with(".githubusercontent.com"))
    })
}

/// `KytyPS5-2026-09-30-b7a1fac`: newer if the date is later; same date with a different hash counts as newer.
fn is_newer(current: &str, latest: &str) -> bool {
    if current == latest {
        return false;
    }
    let date = |t: &str| t.strip_prefix("KytyPS5-").filter(|r| r.len() >= 10).map(|r| r[..10].to_owned());
    match (date(current), date(latest)) {
        (Some(c), Some(l)) if c != l => l > c,
        _ => true,
    }
}

pub async fn check(repo: &str, current_tag: Option<String>) -> Result<UpdateInfo, String> {
    if !valid_repo(repo) {
        return Err("The update repository must look like owner/name.".into());
    }
    let response = client()?
        .get(format!("https://api.github.com/repos/{repo}/releases/latest"))
        .header("Accept", "application/vnd.github+json")
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| format!("Couldn't reach GitHub: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("GitHub answered {} for {repo}.", response.status()));
    }
    let release: Release = response.json().await.map_err(|e| format!("Unexpected GitHub response: {e}"))?;

    let asset = release.assets.iter().find(|a| a.name.to_lowercase().ends_with(ASSET_SUFFIX));
    let update_available = match &current_tag {
        Some(current) => is_newer(current, &release.tag_name),
        None => true,
    } && asset.is_some();

    Ok(UpdateInfo {
        current_tag,
        latest_tag: release.tag_name,
        update_available,
        asset_name: asset.map(|a| a.name.clone()),
        asset_size: asset.map_or(0, |a| a.size),
        notes: release.body.unwrap_or_default().chars().take(4000).collect(),
        html_url: release.html_url,
        download_url: asset.map(|a| a.browser_download_url.clone()),
    })
}

async fn download(app: &AppHandle, url: &str, dest: &Path, expected: u64) -> Result<(), String> {
    if !trusted_download_host(url) {
        return Err("Refusing to download from an untrusted host.".into());
    }
    let mut response = client()?
        .get(url)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("Download failed: {e}"))?;
    let total = response.content_length().unwrap_or(expected);

    let mut file = fs::File::create(dest).map_err(|e| e.to_string())?;
    let mut downloaded = 0u64;
    let mut last_emit = 0u64;
    while let Some(chunk) = response.chunk().await.map_err(|e| format!("Download interrupted: {e}"))? {
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        if downloaded - last_emit > 256 * 1024 || downloaded == total {
            last_emit = downloaded;
            let _ = app.emit("update-progress", Progress { stage: "downloading", downloaded, total });
        }
    }
    file.flush().map_err(|e| e.to_string())?;
    if expected > 0 && downloaded != expected {
        return Err("The downloaded file is incomplete.".into());
    }
    Ok(())
}

fn extract(zip_path: &Path, staging: &Path) -> Result<(), String> {
    let mut archive = zip::ZipArchive::new(fs::File::open(zip_path).map_err(|e| e.to_string())?)
        .map_err(|e| format!("The update archive is corrupt: {e}"))?;
    let mut unpacked = 0u64;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        // `enclosed_name` rejects absolute paths and `..` traversal.
        let Some(relative) = entry.enclosed_name() else { continue };
        let out = staging.join(relative);
        if entry.is_dir() {
            fs::create_dir_all(&out).map_err(|e| e.to_string())?;
            continue;
        }
        unpacked += entry.size();
        if unpacked > MAX_UNPACKED_BYTES {
            return Err("The update archive is unreasonably large.".into());
        }
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut file = fs::File::create(&out).map_err(|e| e.to_string())?;
        io::copy(&mut entry, &mut file).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// The zip may or may not wrap everything in a single folder.
fn find_payload_root(staging: &Path) -> Option<PathBuf> {
    if staging.join(EMULATOR_EXE).is_file() {
        return Some(staging.to_path_buf());
    }
    fs::read_dir(staging)
        .ok()?
        .filter_map(Result::ok)
        .map(|e| e.path())
        .find(|p| p.join(EMULATOR_EXE).is_file())
}

fn collect_files(root: &Path, dir: &Path, out: &mut Vec<PathBuf>) -> io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        if path.is_dir() {
            collect_files(root, &path, out)?;
        } else if let Ok(rel) = path.strip_prefix(root) {
            out.push(rel.to_path_buf());
        }
    }
    Ok(())
}

fn is_preserved(relative: &Path) -> bool {
    relative
        .components()
        .next()
        .map(|c| c.as_os_str().to_string_lossy().to_lowercase())
        .is_some_and(|first| PRESERVED.contains(&first.as_str()))
}

/// Copies new files over the install, backing up every replaced file so a failure rolls back cleanly.
fn swap_in(payload: &Path, install: &Path, backup: &Path) -> Result<usize, String> {
    let mut files = Vec::new();
    collect_files(payload, payload, &mut files).map_err(|e| e.to_string())?;
    files.retain(|f| !is_preserved(f));

    let mut written: Vec<(PathBuf, bool)> = Vec::new();
    let result = (|| -> io::Result<()> {
        for rel in &files {
            let dest = install.join(rel);
            let existed = dest.is_file();
            if existed {
                let saved = backup.join(rel);
                if let Some(parent) = saved.parent() {
                    fs::create_dir_all(parent)?;
                }
                fs::copy(&dest, &saved)?;
            }
            if let Some(parent) = dest.parent() {
                fs::create_dir_all(parent)?;
            }
            written.push((rel.clone(), existed));
            fs::copy(payload.join(rel), &dest)?;
        }
        Ok(())
    })();

    if let Err(err) = result {
        for (rel, existed) in written.iter().rev() {
            let dest = install.join(rel);
            let _ = if *existed { fs::copy(backup.join(rel), &dest).map(|_| ()) } else { fs::remove_file(&dest) };
        }
        return Err(format!("Couldn't replace files ({err}). The previous version was restored."));
    }
    Ok(files.len())
}

pub async fn install(app: AppHandle, info: UpdateInfo, install_dir: PathBuf) -> Result<usize, String> {
    let url = info.download_url.clone().ok_or("This release has no Windows x64 download.")?;
    let work = std::env::temp_dir().join("kyty-launcher-update");
    let _ = fs::remove_dir_all(&work);
    fs::create_dir_all(&work).map_err(|e| e.to_string())?;

    let zip_path = work.join("update.zip");
    download(&app, &url, &zip_path, info.asset_size).await?;

    let _ = app.emit("update-progress", Progress { stage: "installing", downloaded: 0, total: 0 });
    let work_for_task = work.clone();
    let count = tauri::async_runtime::spawn_blocking(move || -> Result<usize, String> {
        let staging = work_for_task.join("staging");
        fs::create_dir_all(&staging).map_err(|e| e.to_string())?;
        extract(&zip_path, &staging)?;
        let payload = find_payload_root(&staging)
            .ok_or_else(|| format!("The update doesn't contain {EMULATOR_EXE}."))?;
        swap_in(&payload, &install_dir, &work_for_task.join("backup"))
    })
    .await
    .map_err(|e| e.to_string())??;

    let _ = fs::remove_dir_all(&work);
    let _ = app.emit("update-progress", Progress { stage: "done", downloaded: 0, total: 0 });
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn newer_detection() {
        assert!(!is_newer("KytyPS5-2026-09-30-b7a1fac", "KytyPS5-2026-09-30-b7a1fac"));
        assert!(is_newer("KytyPS5-2026-09-30-b7a1fac", "KytyPS5-2026-10-02-1234567"));
        assert!(!is_newer("KytyPS5-2026-10-02-1234567", "KytyPS5-2026-09-30-b7a1fac"));
        assert!(is_newer("KytyPS5-2026-09-30-b7a1fac", "KytyPS5-2026-09-30-aaaaaaa"));
    }

    #[test]
    fn preserved_paths() {
        assert!(is_preserved(Path::new("_SaveData/PPSA1/x.bin")));
        assert!(is_preserved(Path::new("Kyty.ini")));
        assert!(!is_preserved(Path::new("kyty_emulator.exe")));
        assert!(!is_preserved(Path::new("platforms/qwindows.dll")));
    }

    #[test]
    fn repo_and_host_validation() {
        assert!(valid_repo("KytyPS5/KytyPS5"));
        assert!(!valid_repo("a/b/c"));
        assert!(!valid_repo("../etc"));
        assert!(trusted_download_host("https://github.com/o/r/releases/download/t/a.zip"));
        assert!(trusted_download_host("https://objects.githubusercontent.com/x"));
        assert!(!trusted_download_host("https://evil.example/a.zip"));
        assert!(!trusted_download_host("http://github.com/a.zip"));
    }
}
