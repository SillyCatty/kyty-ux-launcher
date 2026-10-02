## Kyty UX Launcher 0.1.2 (alpha)

A polish release: faster navigation, smoother animations, draggable toggles and easier game-folder management.

### What's new

- **Game folder button.** A folder icon at the bottom right of the Library opens a panel listing your game folders. **Open** shows a folder in Explorer, **Change** swaps it for another folder, **Add folder** adds one, and the new trash button **removes** a folder from your library (nothing is deleted from disk). Changes save and rescan immediately.
- **Draggable toggles.** Grab a toggle's knob and drag it left or right; the track colour blends between off and on as you drag, and the switch commits when you release. Clicking still works.
- **Save Config button** fades in when there are changes to save (with a soft glow) and fades out when there aren't.
- **Smoother game card animation.** The game card now glides back into place when you close its preview instead of bouncing.
- **Faster page switching.** Opening Settings (and every other tab) is about twice as fast: the page now appears in roughly 65 ms instead of 145 ms.

### Fixes

- The game icon in the detail view could be cut off at the top while animating. It no longer gets clipped.
- Toggle knobs were about 1 px off-centre. They are now exactly centred.

### Updating

If you are on 0.1.1, the launcher will offer this update itself: open the **Updates** tab and click **Install & restart**. If you are on 0.1.0, install this version manually once.

### Install

Download `Kyty.Launcher_0.1.2_x64-setup.exe` below and run it. It installs per user (no admin needed). Windows SmartScreen may show a warning because the installer is not code-signed with a paid certificate: choose **More info -> Run anyway**.

### Known limitations

- Alpha quality; please report issues.
- Per-game custom settings are respected when launching but can only be edited with the emulator's own launcher for now.
- Zipped/archived games and the controller input-mapping editor are not supported yet.

### Disclaimer

Unofficial community project, not affiliated with Sony Interactive Entertainment or the KytyPS5 project. It includes no emulator code, games or firmware.
