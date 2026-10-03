//! The launcher's own small state file (not the emulator's config).

use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
};

use serde::{Deserialize, Serialize};

use crate::ps4::Ps4Settings;

pub const DEFAULT_REPO: &str = "KytyPS5/KytyPS5";

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct PlayStats {
    pub last_played: u64,
    pub play_seconds: u64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(default)]
pub struct StoreData {
    pub emulator_dir: String,
    pub repo: String,
    pub auto_check_updates: bool,
    pub setup_complete: bool,
    /// A user-supplied tool that unpacks .pkg files. The launcher bundles no unpacking code.
    pub converter_path: String,
    pub converter_args: String,
    /// Original Kyty (PS4) emulator folder, the one containing `fc_script.exe`. Empty = PS4 not set up.
    pub ps4_dir: String,
    pub ps4_repo: String,
    pub ps4_settings: Ps4Settings,
    /// Which modules to load per PS4 game, keyed by game id.
    pub ps4_elfs: HashMap<String, Vec<String>>,
    pub stats: HashMap<String, PlayStats>,
}

pub const DEFAULT_CONVERTER_ARGS: &str = "\"{pkg}\" \"{out}\"";
pub const DEFAULT_PS4_REPO: &str = "InoriRus/Kyty";

impl Default for StoreData {
    fn default() -> Self {
        Self {
            emulator_dir: String::new(),
            repo: DEFAULT_REPO.into(),
            auto_check_updates: true,
            setup_complete: false,
            converter_path: String::new(),
            converter_args: DEFAULT_CONVERTER_ARGS.into(),
            ps4_dir: String::new(),
            ps4_repo: DEFAULT_PS4_REPO.into(),
            ps4_settings: Ps4Settings::default(),
            ps4_elfs: HashMap::new(),
            stats: HashMap::new(),
        }
    }
}

#[derive(Clone)]
pub struct Store {
    data: Arc<Mutex<StoreData>>,
    path: Arc<PathBuf>,
}

impl Store {
    pub fn load(path: PathBuf) -> Self {
        let data = fs::read(&path)
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        Self { data: Arc::new(Mutex::new(data)), path: Arc::new(path) }
    }

    pub fn get(&self) -> StoreData {
        self.data.lock().map(|d| d.clone()).unwrap_or_default()
    }

    pub fn update(&self, change: impl FnOnce(&mut StoreData)) -> Result<(), String> {
        let snapshot = {
            let mut data = self.data.lock().map_err(|_| "Internal state is poisoned")?;
            change(&mut data);
            data.clone()
        };
        if let Some(dir) = self.path.parent() {
            fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        let json = serde_json::to_vec_pretty(&snapshot).map_err(|e| e.to_string())?;
        let tmp = self.path.with_extension("json.tmp");
        fs::write(&tmp, json).map_err(|e| e.to_string())?;
        fs::rename(&tmp, &*self.path).map_err(|e| e.to_string())
    }
}
