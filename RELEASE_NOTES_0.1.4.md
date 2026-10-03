## Kyty UX Launcher 0.1.4 (alpha)

### What's new

- **PS4 support (original Kyty emulator).** You can now set up the [original Kyty](https://github.com/InoriRus/Kyty) PS4 emulator alongside KytyPS5 and use one launcher for both.
  - **One library.** PS4 and PS5 games appear together, with a PS4/PS5 tag on each card and an All / PS5 / PS4 filter. Games are told apart automatically (PS4 dumps carry `param.sfo`, PS5 ones `param.json`), and their title, ID, version and firmware are read for you.
  - **Setup wizard step.** A new optional step finds an existing PS4 emulator, lets you pick its folder, or downloads and installs it quietly. You can skip it and add it later with **Settings, then Run setup again**.
  - **PS4 settings.** A PS5 | PS4 switch in Settings opens the PS4 page: resolution, PS4 Pro mode, shader and Vulkan validation, logging and profiler. It uses the same review-before-save screen as PS5.
  - **Per-game modules.** A PS4 game's detail panel has a "Modules to load" checklist. By default only `eboot.bin` is loaded; Kyty emulates the system libraries itself.
  - **Updates.** The Updates tab always has a PS4 emulator card. If the emulator isn't installed it offers **Download & install** (quiet, with a progress bar) or **Choose folder**; once installed it shows the version with **Check for updates**.
  - Launching works like PS5: the emulator starts hidden and only the game window appears.
- **Setup wizard polish.** On the optional PS4 step the button now says **Skip** until an emulator is chosen or installed, then **Continue**.

### Good to know

- The PS4 emulator is old (its last release was in 2022) and its own documentation says it only runs some simple games and has no audio. Compatibility is limited by that project, not by this launcher.
- You still need the KytyPS5 emulator set up, because both platforms share the game folder list.
- PS4 settings are stored by the launcher itself, so they never touch the shared `Kyty.ini`.

### Updating

If you are on 0.1.1 or later, the launcher offers this update itself: open **Updates** and click **Install & restart**. If you are on 0.1.0, install this version manually once.

### Install

Download `Kyty.Launcher_0.1.4_x64-setup.exe` below and run it. It installs per user (no admin needed). Windows SmartScreen may show a warning because the installer is not code-signed with a paid certificate: choose **More info -> Run anyway**.

### Known limitations

- Alpha quality; please report issues.
- Per-game custom settings are respected when launching KytyPS5 games but can only be edited with the emulator's own launcher for now.
- Zipped/archived games and the controller input-mapping editor are not supported yet.
- A `.pkg` converter that opens its own window can't be hidden; only console windows are.

### Disclaimer

Unofficial community project, not affiliated with Sony Interactive Entertainment, the KytyPS5 project or the original Kyty project. It includes no emulator code, games, firmware or unpacking tools.
