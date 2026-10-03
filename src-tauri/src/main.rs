#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod convert;
mod devices;
mod discover;
mod emulator;
mod games;
mod ini;
mod platform;
mod ps4;
mod psf;
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

use platform::Platform;
use settings::Settings;
use store::{PlayStats, Store};

struct AppState {
    store: Store,
    running: emulator::Running,
    updating: Arc<AtomicBool>,
    converting: convert::Active,
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs())
}

/// The install folder of one emulator, checked to still contain its program.
fn platform_dir(state: &AppState, platform: Platform) -> Result<PathBuf, String> {
    let data = state.store.get();
    let dir = match platform {
        Platform::Ps5 => data.emulator_dir,
        Platform::Ps4 => data.ps4_dir,
    };
    let path = PathBuf::from(&dir);
    if dir.is_empty() || !path.join(platform.exe()).is_file() {
        return Err(format!("{} wasn't found. Choose the {} emulator folder first.", platform.exe(), platform.label().to_uppercase()));
    }
    Ok(path)
}

/// KytyPS5's folder; its `Kyty.ini` also holds the game folder list shared by both platforms.
fn emulator_dir(state: &AppState) -> Result<PathBuf, String> {
    platform_dir(state, Platform::Ps5)
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
    ps4_dir: Option<String>,
    ps4_repo: String,
    default_ps4_install_dir: String,
    running: Option<emulator::RunningInfo>,
}

#[tauri::command]
fn get_state(state: State<'_, AppState>) -> Snapshot {
    let data = state.store.get();
    let valid = |dir: &str, platform: Platform| !dir.is_empty() && Path::new(dir).join(platform.exe()).is_file();
    let ps5_ok = valid(&data.emulator_dir, Platform::Ps5);
    let ps4_ok = valid(&data.ps4_dir, Platform::Ps4);
    Snapshot {
        emulator_dir: ps5_ok.then_some(data.emulator_dir),
        repo: data.repo,
        auto_check_updates: data.auto_check_updates,
        setup_complete: data.setup_complete,
        default_install_dir: discover::default_install_dir(Platform::Ps5).to_string_lossy().into_owned(),
        ps4_dir: ps4_ok.then_some(data.ps4_dir),
        ps4_repo: data.ps4_repo,
        default_ps4_install_dir: discover::default_install_dir(Platform::Ps4).to_string_lossy().into_owned(),
        running: emulator::current(&state.running),
    }
}

#[tauri::command]
fn set_emulator_dir(path: String, platform: Option<Platform>, state: State<'_, AppState>) -> Result<(), String> {
    let platform = platform.unwrap_or(Platform::Ps5);
    if !Path::new(&path).join(platform.exe()).is_file() {
        return Err(format!("That folder doesn't contain {}.", platform.exe()));
    }
    state.store.update(|d| match platform {
        Platform::Ps5 => d.emulator_dir = path,
        Platform::Ps4 => d.ps4_dir = path,
    })
}

/// Forgets the PS4 emulator (e.g. when skipping it in setup). Nothing is deleted from disk.
#[tauri::command]
fn clear_ps4(state: State<'_, AppState>) -> Result<(), String> {
    state.store.update(|d| d.ps4_dir.clear())
}

#[tauri::command]
async fn find_installs(platform: Option<Platform>, state: State<'_, AppState>) -> Result<Vec<discover::Install>, String> {
    let platform = platform.unwrap_or(Platform::Ps5);
    let data = state.store.get();
    let current = match platform {
        Platform::Ps5 => data.emulator_dir,
        Platform::Ps4 => data.ps4_dir,
    };
    let own = (platform == Platform::Ps5).then(detect_emulator_dir).flatten();
    let extra: Vec<PathBuf> = [Some(PathBuf::from(current)), own]
        .into_iter()
        .flatten()
        .filter(|p| !p.as_os_str().is_empty())
        .collect();
    tauri::async_runtime::spawn_blocking(move || discover::find_installs(platform, &extra))
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

#[derive(Serialize)]
struct ConverterConfig {
    path: String,
    args: String,
    /// Converted games are saved into the first game folder.
    out_root: Option<String>,
    running: bool,
}

#[tauri::command]
fn get_converter(state: State<'_, AppState>) -> ConverterConfig {
    let data = state.store.get();
    let out_root = load_doc(&state).ok().and_then(|(doc, _)| settings::load(&doc).game_dirs.into_iter().next());
    ConverterConfig { path: data.converter_path, args: data.converter_args, out_root, running: convert::is_running(&state.converting) }
}

#[tauri::command]
fn set_converter(path: String, args: String, state: State<'_, AppState>) -> Result<(), String> {
    let path = path.trim().to_owned();
    let args = args.trim().to_owned();
    if !path.is_empty() {
        let program = Path::new(&path);
        if !program.is_file() {
            return Err("That program doesn't exist.".into());
        }
        let ext = program.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
        if !matches!(ext.as_str(), "exe" | "bat" | "cmd" | "com") {
            return Err("Choose an .exe, .bat or .cmd file.".into());
        }
    }
    if !args.contains("{pkg}") || !args.contains("{out}") {
        return Err("The arguments must contain both {pkg} and {out}.".into());
    }
    state.store.update(|d| {
        d.converter_path = path;
        d.converter_args = args;
    })
}

/// Runs the user's converter on a .pkg, writing into a new folder inside the first game folder.
#[tauri::command]
fn convert_pkg(app: AppHandle, pkg: String, state: State<'_, AppState>) -> Result<String, String> {
    let data = state.store.get();
    let program = PathBuf::from(&data.converter_path);
    if data.converter_path.is_empty() || !program.is_file() {
        return Err("Set up your .pkg converter first.".into());
    }
    let pkg_path = PathBuf::from(&pkg);
    if !convert::is_pkg(&pkg_path) {
        return Err("Choose a .pkg file.".into());
    }
    let (doc, _) = load_doc(&state)?;
    let dirs = settings::load(&doc).game_dirs;
    let root = dirs.first().ok_or("Add a game folder first; converted games are saved into it.")?;

    let name = convert::output_name(&pkg_path);
    let out = Path::new(root).join(&name);
    if out.exists() && std::fs::read_dir(&out).map_or(true, |mut d| d.next().is_some()) {
        return Err(format!("A folder named \"{name}\" already exists in {root}."));
    }
    std::fs::create_dir_all(&out).map_err(|e| format!("Couldn't create {}: {e}", out.display()))?;

    let args = convert::render_args(&data.converter_args, &pkg_path, &out);
    let started = convert::start(app, state.converting.clone(), program, args, name.clone(), out.clone(), games::count_in);
    if let Err(e) = started {
        let _ = std::fs::remove_dir(&out); // only succeeds while it's still empty
        return Err(e);
    }
    Ok(name)
}

#[tauri::command]
fn cancel_convert(state: State<'_, AppState>) -> Result<(), String> {
    convert::cancel(&state.converting)
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
async fn install_emulator(
    app: AppHandle,
    dir: Option<String>,
    platform: Option<Platform>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let platform = platform.unwrap_or(Platform::Ps5);
    if emulator::current(&state.running).is_some() {
        return Err("Close the running game first.".into());
    }
    if state.updating.swap(true, Ordering::SeqCst) {
        return Err("An install is already in progress.".into());
    }
    let _guard = UpdateGuard(state.updating.clone());

    let target = dir.map(PathBuf::from).unwrap_or_else(|| discover::default_install_dir(platform));
    if !target.is_absolute() || target.parent().is_none() || target.is_file() {
        return Err("Choose a folder (not a drive root) to install into.".into());
    }

    let info = updater::check(platform, &repo_for(&state, platform), None).await?;
    if info.asset_name.is_none() {
        return Err("The latest release has no Windows download.".into());
    }
    updater::install(app, platform, info, target.clone()).await?;
    if !target.join(platform.exe()).is_file() {
        return Err("The install finished but the emulator is missing.".into());
    }
    let path = target.to_string_lossy().into_owned();
    state.store.update(|d| match platform {
        Platform::Ps5 => d.emulator_dir = path.clone(),
        Platform::Ps4 => d.ps4_dir = path.clone(),
    })?;
    Ok(path)
}

fn repo_for(state: &AppState, platform: Platform) -> String {
    let data = state.store.get();
    match platform {
        Platform::Ps5 => data.repo,
        Platform::Ps4 => data.ps4_repo,
    }
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

async fn read_version(dir: PathBuf, platform: Platform) -> Result<Version, String> {
    let line = tauri::async_runtime::spawn_blocking(move || emulator::version_line(&dir, platform.exe()))
        .await
        .map_err(|e| e.to_string())?;
    Ok(Version {
        tag: line.as_deref().and_then(|l| emulator::release_tag_for(platform, l)),
        semver: line.as_deref().and_then(emulator::semver),
        line,
    })
}

#[tauri::command]
async fn get_version(platform: Option<Platform>, state: State<'_, AppState>) -> Result<Version, String> {
    let platform = platform.unwrap_or(Platform::Ps5);
    read_version(platform_dir(&state, platform)?, platform).await
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

/// Looks a game up by id among everything in the configured game folders.
async fn find_game(state: &AppState, game_id: &str) -> Result<games::Game, String> {
    let (doc, _) = load_doc(state)?;
    let dirs = settings::load(&doc).game_dirs;
    let id = game_id.to_owned();
    tauri::async_runtime::spawn_blocking(move || games::scan(&dirs))
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|g| g.id == id)
        .ok_or_else(|| "That game is no longer in your game folders.".to_owned())
}

#[tauri::command]
fn get_ps4_settings(state: State<'_, AppState>) -> ps4::Ps4Settings {
    state.store.get().ps4_settings
}

/// Returns the names of the settings that actually changed.
#[tauri::command]
fn save_ps4_settings(new: ps4::Ps4Settings, state: State<'_, AppState>) -> Result<Vec<String>, String> {
    new.validate()?;
    let changed = ps4::changed_keys(&state.store.get().ps4_settings, &new);
    if !changed.is_empty() {
        state.store.update(|d| d.ps4_settings = new)?;
    }
    Ok(changed)
}

#[derive(Serialize)]
struct GameModules {
    available: Vec<String>,
    selected: Vec<String>,
}

/// The loadable modules of a PS4 game and which of them are selected (default: just `eboot.bin`).
#[tauri::command]
async fn get_game_modules(game_id: String, state: State<'_, AppState>) -> Result<GameModules, String> {
    let game = find_game(&state, &game_id).await?;
    if game.platform != Platform::Ps4 {
        return Err("Module selection only applies to PS4 games.".into());
    }
    let saved = state.store.get().ps4_elfs.get(&game.id).cloned().unwrap_or_default();
    let path = PathBuf::from(&game.path);
    tauri::async_runtime::spawn_blocking(move || {
        let available = ps4::scan_elfs(&path);
        let mut selected: Vec<String> = saved.into_iter().filter(|m| available.contains(m)).collect();
        if selected.is_empty() {
            selected = ps4::default_elfs(&path);
        }
        GameModules { available, selected }
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_game_modules(game_id: String, selected: Vec<String>, state: State<'_, AppState>) -> Result<(), String> {
    let game = find_game(&state, &game_id).await?;
    if game.platform != Platform::Ps4 {
        return Err("Module selection only applies to PS4 games.".into());
    }
    let base = PathBuf::from(&game.path);
    if let Some(bad) = selected.iter().find(|m| !ps4::safe_relative(m) || !base.join(m.as_str()).is_file()) {
        return Err(format!("\"{bad}\" isn't a file inside this game's folder."));
    }
    state.store.update(|d| {
        // An empty choice goes back to the default instead of storing "load nothing".
        if selected.is_empty() {
            d.ps4_elfs.remove(&game.id);
        } else {
            d.ps4_elfs.insert(game.id.clone(), selected);
        }
    })
}

#[tauri::command]
async fn launch_game(
    game_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<emulator::RunningInfo, String> {
    // Game folders live in KytyPS5's Kyty.ini and are shared by both platforms.
    let (doc, _) = load_doc(&state)?;
    let game = find_game(&state, &game_id).await?;

    let store = state.store.clone();
    let id = game.id.clone();
    let started = now();
    let info = emulator::RunningInfo { game_id: game.id.clone(), name: game.name.clone(), started_at: started, pid: 0 };
    let on_exit = move |exit: emulator::ExitInfo| {
        let _ = store.update(|d| {
            let s: &mut PlayStats = d.stats.entry(id).or_default();
            s.last_played = started;
            s.play_seconds += exit.seconds;
        });
    };

    match game.platform {
        Platform::Ps5 => {
            let dir = emulator_dir(&state)?;
            let profile = settings::launch_profile(&doc, &game.path);
            profile.settings.validate().map_err(|e| format!("Can't launch with the current settings: {e}"))?;
            let args = emulator::build_args(&profile, Path::new(&game.path), &game.title_id, &dir);
            emulator::spawn(app, state.running.clone(), &dir, Platform::Ps5.exe(), args, info, on_exit)
        }
        Platform::Ps4 => {
            let dir = platform_dir(&state, Platform::Ps4)?;
            let data = state.store.get();
            data.ps4_settings.validate().map_err(|e| format!("Can't launch with the current PS4 settings: {e}"))?;

            let base = Path::new(&game.path);
            let mut modules = data.ps4_elfs.get(&game.id).cloned().filter(|m| !m.is_empty()).unwrap_or_else(|| ps4::default_elfs(base));
            modules.retain(|m| ps4::safe_relative(m) && base.join(m).is_file());
            if modules.is_empty() {
                return Err("Couldn't find eboot.bin (or any module to load) in this game's folder.".into());
            }
            let sfo = base.join("sce_sys").join("param.sfo");
            let sfo = sfo.is_file().then(|| sfo.to_string_lossy().into_owned());
            let script = ps4::lua_script(&data.ps4_settings, &game.path, sfo.as_deref(), &modules);
            let script_path = dir.join("kyty_run.lua");
            std::fs::write(&script_path, script).map_err(|e| format!("Couldn't write {}: {e}", script_path.display()))?;
            emulator::spawn(
                app,
                state.running.clone(),
                &dir,
                Platform::Ps4.exe(),
                vec![script_path.to_string_lossy().into_owned()],
                info,
                on_exit,
            )
        }
    }
}

#[tauri::command]
fn stop_game(state: State<'_, AppState>) -> Result<(), String> {
    emulator::stop(&state.running)
}

#[tauri::command]
async fn get_devices() -> Result<devices::Devices, String> {
    tauri::async_runtime::spawn_blocking(devices::list).await.map_err(|e| e.to_string())
}

async fn current_tag(dir: PathBuf, platform: Platform) -> Option<String> {
    read_version(dir, platform).await.ok().and_then(|v| v.tag)
}

#[tauri::command]
async fn check_update(platform: Option<Platform>, state: State<'_, AppState>) -> Result<updater::UpdateInfo, String> {
    let platform = platform.unwrap_or(Platform::Ps5);
    let dir = platform_dir(&state, platform)?;
    updater::check(platform, &repo_for(&state, platform), current_tag(dir, platform).await).await
}

struct UpdateGuard(Arc<AtomicBool>);

impl Drop for UpdateGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

#[tauri::command]
async fn install_update(app: AppHandle, platform: Option<Platform>, state: State<'_, AppState>) -> Result<Version, String> {
    let platform = platform.unwrap_or(Platform::Ps5);
    let dir = platform_dir(&state, platform)?;
    if emulator::current(&state.running).is_some() {
        return Err("Close the running game before updating.".into());
    }
    if state.updating.swap(true, Ordering::SeqCst) {
        return Err("An update is already in progress.".into());
    }
    let _guard = UpdateGuard(state.updating.clone());

    // Re-check server-side so the download URL never comes from the frontend.
    let info = updater::check(platform, &repo_for(&state, platform), current_tag(dir.clone(), platform).await).await?;
    if !info.update_available {
        return Err("You already have the latest version.".into());
    }
    updater::install(app, platform, info, dir.clone()).await?;
    read_version(dir, platform).await
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
                converting: Default::default(),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_state,
            set_emulator_dir,
            clear_ps4,
            get_ps4_settings,
            save_ps4_settings,
            get_game_modules,
            set_game_modules,
            find_installs,
            open_folder,
            get_converter,
            set_converter,
            convert_pkg,
            cancel_convert,
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
