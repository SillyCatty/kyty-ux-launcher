use serde::{Deserialize, Serialize};

/// Which Kyty emulator a game or action belongs to.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Platform {
    Ps5,
    Ps4,
}

impl Platform {
    /// The program that identifies an install folder.
    pub fn exe(self) -> &'static str {
        match self {
            Platform::Ps5 => "kyty_emulator.exe",
            Platform::Ps4 => "fc_script.exe",
        }
    }

    pub fn install_folder_name(self) -> &'static str {
        match self {
            Platform::Ps5 => "KytyPS5",
            Platform::Ps4 => "KytyPS4",
        }
    }

    /// Whether a release asset is this platform's Windows build.
    pub fn asset_matches(self, name: &str) -> bool {
        let n = name.to_lowercase();
        match self {
            Platform::Ps5 => n.ends_with("-windows-x64.zip"),
            Platform::Ps4 => n.ends_with(".zip") && n.contains("kyty") && !n.contains("macos") && !n.contains("linux"),
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Platform::Ps5 => "ps5",
            Platform::Ps4 => "ps4",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_the_right_release_asset() {
        assert!(Platform::Ps5.asset_matches("KytyPS5-2026-10-02-e317465-Windows-x64.zip"));
        assert!(!Platform::Ps5.asset_matches("Kyty-v0.2.0.zip"));
        assert!(Platform::Ps4.asset_matches("Kyty-v0.2.0.zip"));
        assert!(!Platform::Ps4.asset_matches("KytyPS5-2026-10-02-e317465-macOS-x86_64.zip"));
        assert!(!Platform::Ps4.asset_matches("source.tar.gz"));
    }

    #[test]
    fn serializes_as_lowercase() {
        assert_eq!(serde_json::to_string(&Platform::Ps4).unwrap(), "\"ps4\"");
        assert_eq!(serde_json::from_str::<Platform>("\"ps5\"").unwrap(), Platform::Ps5);
    }
}
