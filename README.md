# Kyty UX Launcher

A modern, animated front-end for the open-source [KytyPS5](https://github.com/KytyPS5/KytyPS5) emulator, built with Rust, Tauri 2 and React.

> **Alpha software.** Expect rough edges. Please report bugs in the issue tracker.

> **Unofficial.** This is an independent community project. It is not affiliated with, endorsed by, or connected to Sony Interactive Entertainment or the KytyPS5 project. It contains no emulator code, games, firmware or other copyrighted material. Use only game files you own and obtained legally.

## Features

- **Game library**: scans your game folders, shows covers, title IDs, versions, play time and last played, and launches games with one click.
- **Invisible launching**: starts the emulator directly with no console or extra window. Only the game's own window appears, and closing it from the launcher shuts it down cleanly.
- **Full settings editor**: every option from the emulator's own settings dialog, written to the emulator's real config (`Kyty.ini`). Only the keys you change are touched.
- **Review before saving**: "Save Config" shows exactly what will change; you can cancel (reverts) or apply.
- **First-run setup**: finds an existing KytyPS5 install or downloads and installs it quietly, then walks you through profile, GPU, system and game folders.
- **Emulator updates**: checks GitHub Releases for new KytyPS5 builds and installs them in the background, keeping your saves and settings.
- **PS4 support (original Kyty)**: optionally set up the [original Kyty](https://github.com/InoriRus/Kyty) PS4 emulator next to KytyPS5. PS4 and PS5 games share one library (told apart automatically from `param.sfo` / `param.json`), with a platform filter, per-platform settings, per-game module selection and one-click install. That emulator is old and only runs some simple games.
- **Game folder menu**: open, change, add or remove game folders from the Library, and optionally run a converter program of your choice on a `.pkg` (the launcher includes no unpacking or decryption tools of its own).
- **Launcher auto-update**: the launcher updates itself from this repository's Releases (signed updates, installed quietly, then restarts).

## Install

1. Download the `Kyty.Launcher_*_x64-setup.exe` installer from the [latest release](../../releases/latest).
2. Run it. It installs per user and does not need administrator rights.
3. Windows SmartScreen may warn because the installer is not code-signed. Choose **More info -> Run anyway**.

Requires Windows 10/11 x64 with the WebView2 runtime (included with Windows 11).

## Build from source

Requirements: [Rust](https://rustup.rs), [Node.js](https://nodejs.org) 20+, and the Tauri [Windows prerequisites](https://tauri.app/start/prerequisites/).

```bash
npm install
npm run tauri dev      # run in development
npm run tauri build    # produce the installer in src-tauri/target/release/bundle/nsis
```

Run the backend tests with `cargo test` inside `src-tauri`.

### Releasing (maintainers)

Updates are signed with a Tauri updater key. Set `TAURI_SIGNING_PRIVATE_KEY` (and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) before `npm run tauri build`; the build then emits `*-setup.exe` and `*-setup.exe.sig`. Publish both with a `latest.json` (version, notes, signature, download URL) to the release. The public key lives in `src-tauri/tauri.conf.json`.

## How it works

The launcher replaces the emulator's own Qt launcher. It reads and patches `Kyty.ini`, builds the same command-line flags the original launcher uses, and starts `kyty_emulator.exe` hidden. See `src-tauri/src` for the backend (`ini.rs`, `settings.rs`, `games.rs`, `emulator.rs`, `updater.rs`, `discover.rs`).

## License

MIT, see [LICENSE](LICENSE).
