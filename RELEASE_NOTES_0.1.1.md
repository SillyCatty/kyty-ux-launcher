## Kyty UX Launcher 0.1.1 (alpha)

This release adds **self-updating**: the launcher can now update itself from GitHub Releases.

### What's new

- **Launcher auto-update.** On startup the launcher checks this repository's latest release. When a newer version exists, the Updates tab shows it with release notes and an **Install & restart** button. The update downloads in the background, is verified against a signature, installs quietly and relaunches the launcher.
- **Signed updates.** Every update is cryptographically signed. The launcher refuses to install anything that doesn't match its built-in public key.
- **Updates tab redesigned** to cover both the launcher and the KytyPS5 emulator, and the sidebar badge lights up for either.
- The launcher refuses to update while a game is running.

### Important: upgrading from 0.1.0

Version 0.1.0 has no updater, so it can't update itself. **Install 0.1.1 manually once** (download the installer below and run it over your existing install; your settings, game list and play time are kept). From 0.1.1 onward, updates arrive automatically.

### Install

Download `Kyty.Launcher_0.1.1_x64-setup.exe` below and run it. It installs per user (no admin needed). Windows SmartScreen may show a warning because the installer is not code-signed with a paid certificate: choose **More info -> Run anyway**.

### Known limitations

- Alpha quality; please report issues.
- Per-game custom settings are respected when launching but can only be edited with the emulator's own launcher for now.
- Zipped/archived games and the controller input-mapping editor are not supported yet.
- The self-updater is new; if an update ever fails, download the latest installer from the Releases page.

### Disclaimer

Unofficial community project, not affiliated with Sony Interactive Entertainment or the KytyPS5 project. It includes no emulator code, games or firmware.
