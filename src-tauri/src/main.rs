#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod devices;
mod discover;
mod emulator;
mod games;
mod ini;
mod settings;
mod store;
mod updater;

use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use settings::Settings;
use store::{PlayStats, Store};

struct AppState {
    store: Store,
    running: emulator::Running,
    updating: Arc<AtomicBool>,
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs())
}

fn emulator_dir(state: &AppState) -> Result<PathBuf, String> {
    let dir = state.store.get().emulator_dir;
    let path = PathBuf::from(&dir);
    if dir.is_empty() || !path.join(emulator::EMULATOR_EXE).is_file() {
        return Err(format!("{} wasn't found. Choose the emulator folder first.", emulator::EMULATOR_EXE));
    }
    Ok(path)
}

fn load_doc(state: &AppState) -> Result<(ini::IniDoc, PathBuf), String> {
    let path = settings::config_path(&emulator_dir(state)?);
    let doc = ini::IniDoc::load(&path).map_err(|e| format!("Couldn't read {}: {e}", path.display()))?;
    Ok((doc, path))
}

#[derive(Serialize)]
struct Snapshot {
    emulator_dir: Option<String>,
    repo: String,
    auto_check_updates: bool,
    setup_complete: bool,
    default_install_dir: String,
    running: Option<emulator::RunningInfo>,
}

#[tauri::command]
fn get_state(state: State<'_, AppState>) -> Snapshot {
    let data = state.store.get();
    let valid = !data.emulator_dir.is_empty()
        && Path::new(&data.emulator_dir).join(emulator::EMULATOR_EXE).is_file();
    Snapshot {
        emulator_dir: valid.then_some(data.emulator_dir),
        repo: data.repo,
        auto_check_updates: data.auto_check_updates,
        setup_complete: data.setup_complete,
        default_install_dir: discover::default_install_dir().to_string_lossy().into_owned(),
        running: emulator::current(&state.running),
    }
}

#[tauri::command]
fn set_emulator_dir(path: String, state: State<'_, AppState>) -> Result<(), String> {
    if !Path::new(&path).join(emulator::EMULATOR_EXE).is_file() {
        return Err(format!("That folder doesn't contain {}.", emulator::EMULATOR_EXE));
    }
    state.store.update(|d| d.emulator_dir = path)
}

#[tauri::command]
async fn find_installs(state: State<'_, AppState>) -> Result<Vec<discover::Install>, String> {
    let current = state.store.get().emulator_dir;
    let extra: Vec<PathBuf> = [Some(PathBuf::from(current)), detect_emulator_dir()]
        .into_iter()
        .flatten()
        .filter(|p| !p.as_os_str().is_empty())
        .collect();
    tauri::async_runtime::spawn_blocking(move || discover::find_installs(&extra))
        .await
        .map_err(|e| e.to_string())
}

/// Opens a game folder (or a folder inside one) in Explorer. Anything outside the configured game folders is refused.
#[tauri::command]
fn open_folder(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let (doc, _) = load_doc(&state)?;
    let key = settings::path_key(&path);
    let allowed = settings::load(&doc).game_dirs.iter().any(|dir| {
        let root = settings::path_key(dir);
        key == root || key.starts_with(&format!("{root}/"))
    });
    if !allowed {
        return Err("That folder isn't one of your game folders.".into());
    }
    let native = path.replace('/', "\\");
    if !Path::new(&native).is_dir() {
        return Err("That folder no longer exists.".into());
    }
    std::process::Command::new("explorer.exe").arg(&native).spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
fn finish_setup(state: State<'_, AppState>) -> Result<(), String> {
    state.store.update(|d| d.setup_complete = true)
}

#[tauri::command]
fn reset_setup(state: State<'_, AppState>) -> Result<(), String> {
    state.store.update(|d| d.setup_complete = false)
}

/// Downloads the latest release straight from GitHub's API (no browser involved) and installs it quietly.
#[tauri::command]
async fn install_emulator(app: AppHandle, dir: Option<String>, state: State<'_, AppState>) -> Result<String, String> {
    if emulator::current(&state.running).is_some() {
        return Err("Close the running game first.".into());
    }
    if state.updating.swap(true, Ordering::SeqCst) {
        return Err("An install is already in progress.".into());
    }
    let _guard = UpdateGuard(state.updating.clone());

    let target = dir.map(PathBuf::from).unwrap_or_else(discover::default_install_dir);
    if !target.is_absolute() || target.parent().is_none() || target.is_file() {
        return Err("Choose a folder (not a drive root) to install into.".into());
    }

    let info = updater::check(&state.store.get().repo, None).await?;
    if info.asset_name.is_none() {
        return Err("The latest release has no Windows x64 download.".into());
    }
    updater::install(app, info, target.clone()).await?;
    if !target.join(emulator::EMULATOR_EXE).is_file() {
        return Err("The install finished but the emulator is missing.".into());
    }
    let path = target.to_string_lossy().into_owned();
    state.store.update(|d| d.emulator_dir = path.clone())?;
    Ok(path)
}

#[tauri::command]
fn set_update_prefs(repo: String, auto_check: bool, state: State<'_, AppState>) -> Result<(), String> {
    let repo = repo.trim().to_owned();
    if repo.split('/').filter(|p| !p.is_empty()).count() != 2 || repo.matches('/').count() != 1 {
        return Err("The repository must look like owner/name.".into());
    }
    state.store.update(|d| {
        d.repo = repo;
        d.auto_check_updates = auto_check;
    })
}

#[derive(Serialize)]
struct Version {
    line: Option<String>,
    tag: Option<String>,
    semver: Option<String>,
}

#[tauri::command]
async fn get_version(state: State<'_, AppState>) -> Result<Version, String> {
    let dir = emulator_dir(&state)?;
    let line = tauri::async_runtime::spawn_blocking(move || emulator::version_line(&dir))
        .await
        .map_err(|e| e.to_string())?;
    Ok(Version {
        tag: line.as_deref().and_then(emulator::release_tag),
        semver: line.as_deref().and_then(emulator::semver),
        line,
    })
}

#[derive(Serialize)]
struct LoadedSettings {
    settings: Settings,
    config_path: String,
    config_exists: bool,
}

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> Result<LoadedSettings, String> {
    let (doc, path) = load_doc(&state)?;
    Ok(LoadedSettings {
        settings: settings::load(&doc),
        config_exists: path.is_file(),
        config_path: path.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
fn save_settings(new: Settings, state: State<'_, AppState>) -> Result<Vec<String>, String> {
    new.validate()?;
    let (mut doc, path) = load_doc(&state)?;
    let changed = settings::apply(&mut doc, &new);
    if !changed.is_empty() {
        doc.save(&path).map_err(|e| format!("Couldn't write {}: {e}", path.display()))?;
    }
    Ok(changed.into_iter().map(str::to_owned).collect())
}

#[tauri::command]
async fn list_games(app: AppHandle, state: State<'_, AppState>) -> Result<Vec<games::Game>, String> {
    let (doc, _) = load_doc(&state)?;
    let dirs = settings::load(&doc).game_dirs;
    let custom = settings::custom_game_keys(&doc, &dirs);
    let stats = state.store.get().stats;
    let mut found = tauri::async_runtime::spawn_blocking(move || games::scan(&dirs))
        .await
        .map_err(|e| e.to_string())?;
    let asset_scope = app.asset_protocol_scope();
    for game in &mut found {
        for image in [&game.icon, &game.background].into_iter().flatten() {
            let _ = asset_scope.allow_file(image);
        }
        game.custom_settings = custom.contains(&game.id);
        if let Some(s) = stats.get(&game.id) {
            game.last_played = (s.last_played > 0).then_some(s.last_played);
            game.play_seconds = s.play_seconds;
        }
    }
    Ok(found)
}

#[tauri::command]
async fn launch_game(
    game_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<emulator::RunningInfo, String> {
    let dir = emulator_dir(&state)?;
    let (doc, _) = load_doc(&state)?;
    let dirs = settings::load(&doc).game_dirs;
    let game = tauri::async_runtime::spawn_blocking(move || games::scan(&dirs))
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|g| g.id == game_id)
        .ok_or("That game is no longer in your game folders.")?;

    let profile = settings::launch_profile(&doc, &game.path);
    profile.settings.validate().map_err(|e| format!("Can't launch with the current settings: {e}"))?;
    let args = emulator::build_args(&profile, Path::new(&game.path), &game.title_id, &dir);

    let store = state.store.clone();
    let id = game.id.clone();
    let started = now();
    let info = emulator::RunningInfo { game_id: game.id, name: game.name, started_at: started, pid: 0 };
    let info = emulator::spawn(app, state.running.clone(), &dir, args, info, move |exit| {
        let _ = store.update(|d| {
            let s: &mut PlayStats = d.stats.entry(id).or_default();
            s.last_played = started;
            s.play_seconds += exit.seconds;
        });
    })?;
    Ok(info)
}

#[tauri::command]
fn stop_game(state: State<'_, AppState>) -> Result<(), String> {
    emulator::stop(&state.running)
}

#[tauri::command]
async fn get_devices() -> Result<devices::Devices, String> {
    tauri::async_runtime::spawn_blocking(devices::list).await.map_err(|e| e.to_string())
}

async fn current_tag(dir: PathBuf) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || emulator::version_line(&dir))
        .await
        .ok()
        .flatten()
        .as_deref()
        .and_then(emulator::release_tag)
}

#[tauri::command]
async fn check_update(state: State<'_, AppState>) -> Result<updater::UpdateInfo, String> {
    let dir = emulator_dir(&state)?;
    updater::check(&state.store.get().repo, current_tag(dir).await).await
}

struct UpdateGuard(Arc<AtomicBool>);

impl Drop for UpdateGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

#[tauri::command]
async fn install_update(app: AppHandle, state: State<'_, AppState>) -> Result<Version, String> {
    let dir = emulator_dir(&state)?;
    if emulator::current(&state.running).is_some() {
        return Err("Close the running game before updating.".into());
    }
    if state.updating.swap(true, Ordering::SeqCst) {
        return Err("An update is already in progress.".into());
    }
    let _guard = UpdateGuard(state.updating.clone());

    // Re-check server-side so the download URL never comes from the frontend.
    let info = updater::check(&state.store.get().repo, current_tag(dir.clone()).await).await?;
    if !info.update_available {
        return Err("You already have the latest version.".into());
    }
    updater::install(app, info, dir.clone()).await?;

    let line = tauri::async_runtime::spawn_blocking(move || emulator::version_line(&dir))
        .await
        .map_err(|e| e.to_string())?;
    Ok(Version {
        tag: line.as_deref().and_then(emulator::release_tag),
        semver: line.as_deref().and_then(emulator::semver),
        line,
    })
}

fn detect_emulator_dir() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let here = exe.parent()?;
    [here.to_path_buf(), here.parent()?.to_path_buf()]
        .into_iter()
        .find(|d| d.join(emulator::EMULATOR_EXE).is_file())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let path = app.path().app_config_dir()?.join("launcher.json");
            let store = Store::load(path);
            if store.get().emulator_dir.is_empty() {
                if let Some(dir) = detect_emulator_dir() {
                    let _ = store.update(|d| d.emulator_dir = dir.to_string_lossy().into_owned());
                }
            }
            app.manage(AppState {
                store,
                running: Default::default(),
                updating: Arc::new(AtomicBool::new(false)),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_state,
            set_emulator_dir,
            find_installs,
            open_folder,
            install_emulator,
            finish_setup,
            reset_setup,
            set_update_prefs,
            get_version,
            get_settings,
            save_settings,
            list_games,
            launch_game,
            stop_game,
            get_devices,
            check_update,
            install_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running the launcher");
}
