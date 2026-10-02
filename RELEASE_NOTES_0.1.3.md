## Kyty UX Launcher 0.1.3 (alpha)

### What's new

- **"Add .pkg file" in the game folder menu.** KytyPS5 can't open `.pkg` files directly, so the launcher can now run a converter program that **you choose** on a `.pkg` you add. Set it up once with the gear button in the folder menu (program plus arguments using `{pkg}` and `{out}`), then pick a `.pkg`. The output goes into a new folder inside your first game folder, progress shows live in the menu, you can cancel at any time, and the finished game appears in your library.
  - The launcher includes **no** unpacking or decryption tools and only runs the program you select. Use only tools and files you are legally allowed to use.
- **Update address moved** to the project's new GitHub account name. Existing installs keep updating normally.

### Fixes and polish

- Cancelling a conversion stops the converter and everything it started.

### Updating

If you are on 0.1.1 or 0.1.2, the launcher offers this update itself: open **Updates** and click **Install & restart**. If you are on 0.1.0, install this version manually once.

### Install

Download `Kyty.Launcher_0.1.3_x64-setup.exe` below and run it. It installs per user (no admin needed). Windows SmartScreen may show a warning because the installer is not code-signed with a paid certificate: choose **More info -> Run anyway**.

### Known limitations

- Alpha quality; please report issues.
- Per-game custom settings are respected when launching but can only be edited with the emulator's own launcher for now.
- Zipped/archived games and the controller input-mapping editor are not supported yet.
- A converter that opens its own window can't be hidden; only console windows are.

### Disclaimer

Unofficial community project, not affiliated with Sony Interactive Entertainment or the KytyPS5 project. It includes no emulator code, games, firmware or unpacking tools.
