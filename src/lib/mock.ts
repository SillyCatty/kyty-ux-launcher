// Dev-only stand-in for the Rust backend, used when the UI runs in a plain browser (npm run dev).
import { DEFAULT_PS4_SETTINGS, DEFAULT_SETTINGS } from "./fields";
import type { Devices, Game, Ps4Settings, RunningInfo, Settings, UpdateInfo, Version } from "./api";

const listeners = new Map<string, Set<(p: never) => void>>();
const emit = (event: string, payload: unknown) => listeners.get(event)?.forEach((h) => h(payload as never));

export async function mockListen<T>(event: string, handler: (payload: T) => void) {
  const set = listeners.get(event) ?? new Set();
  set.add(handler as never);
  listeners.set(event, set);
  return () => set.delete(handler as never);
}

const games: Game[] = [
  ["Minecraft", "PPSA17221", "1.008", "7.02", false, 7320, 1_790_000_000],
  ["Astro Bot", "PPSA01325", "1.003", "6.50", true, 98000, 1_790_400_000],
  ["Dreaming Sarah", "PPSA03981", "1.000", "4.00", false, 0, null],
  ["Grand Theft Auto V", "PPSA04264", "1.005", "5.00", false, 1800, 1_788_000_000],
  ["Stray", "PPSA05620", "1.002", "5.50", false, 360, 1_787_000_000],
  ["Celeste", "PPSA08155", "1.011", "6.00", false, 45000, 1_789_000_000],
  ["Hotline Retro", "CUSA00419", "01.04", "5.05", false, 5400, 1_790_300_000, "ps4"],
  ["Pixel Cart Racing", "CUSA09311", "01.00", "6.72", false, 0, null, "ps4"],
].map(([name, id, version, firmware, custom, secs, last, platform]) => ({
  id: `c:/games/${id}`, platform: ((platform as string | undefined) ?? "ps5") as "ps5" | "ps4", name: name as string, title_id: id as string,
  version: version as string, firmware: firmware as string,
  path: `C:/Games/${id}`, icon: null, background: null, custom_settings: custom as boolean,
  last_played: last as number | null, play_seconds: secs as number,
}));

// ?fresh -> first run with no emulator found, ?found -> an existing install is detected,
// ?ps4 -> the PS4 emulator is already set up, ?nops4games -> hide the sample PS4 games.
const query = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
let emulatorDir: string | null = query.has("fresh") ? null : "C:/Emu/KytyPS5";
let ps4Dir: string | null = query.has("ps4") ? "C:/Emu/KytyPS4" : null;
let ps4Settings: Ps4Settings = { ...DEFAULT_PS4_SETTINGS };
const ps4Modules = { available: ["eboot.bin", "sce_module/game_logic.prx", "sce_module/libc.prx", "sce_module/libSceFios2.prx"], selected: ["eboot.bin"] };
let setupComplete = !query.has("fresh") && !query.has("setup");

let saved: Settings ={ ...DEFAULT_SETTINGS, amd_cpu_enabled: true, gpu_index: 0, printf_direction: "File", game_dirs: ["C:/Users/You/Downloads/ps5 games"] };
let converter = { path: query.has("conv") ? "C:\\Tools\\unpack.exe" : "", args: "\"{pkg}\" \"{out}\"" };
let cancelled = false;
let running: RunningInfo | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
const version: Version = { line: "Release, ver = 0.3.0, git = b7a1fac, date = 2026.09.30", tag: "KytyPS5-2026-09-30-b7a1fac", semver: "0.3.0" };
const devices: Devices = {
  gpus: ["AMD Radeon RX 6700 XT", "Intel(R) UHD Graphics"], microphones: ["Microphone (Realtek Audio)", "Headset (USB)"],
  cpu: "AMD64 Family 25 Model 33 AuthenticAMD", amd_cpu: true,
};
const update: UpdateInfo = {
  current_tag: version.tag, latest_tag: "KytyPS5-2026-10-02-9f3c2ab", update_available: true, asset_name: "KytyPS5-2026-10-02-9f3c2ab-Windows-x64.zip",
  asset_size: 96_400_000, notes: "Fixes:\n- Improved boot reliability for Unity titles\n- Fixed a crash in the shader cache\n- Faster startup", html_url: "https://github.com/KytyPS5/KytyPS5/releases",
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function mockInvoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  await wait(120);
  switch (cmd) {
    case "get_state": return {
      emulator_dir: emulatorDir, repo: "KytyPS5/KytyPS5", auto_check_updates: false, setup_complete: setupComplete,
      default_install_dir: "C:\\Users\\You\\AppData\\Local\\KytyPS5",
      ps4_dir: ps4Dir, ps4_repo: "InoriRus/Kyty", default_ps4_install_dir: "C:\\Users\\You\\AppData\\Local\\KytyPS4", running,
    } as T;
    case "find_installs": {
      await wait(900);
      if (args.platform === "ps4") {
        return (query.has("found4") ? [{ path: "C:\\Users\\You\\Downloads\\Kyty-v0.2.0", modified: 1_660_800_000 }] : []) as T;
      }
      return (query.has("found")
        ? [{ path: "C:\\Users\\You\\Downloads\\KytyPS5-Windows-x64", modified: 1_790_700_000 }, { path: "D:\\Games\\KytyPS5", modified: 1_780_000_000 }]
        : []) as T;
    }
    case "clear_ps4": ps4Dir = null; return undefined as T;
    case "get_ps4_settings": return ps4Settings as T;
    case "save_ps4_settings": {
      const next = args.new as Ps4Settings;
      const changed = (Object.keys(next) as (keyof Ps4Settings)[]).filter((k) => next[k] !== ps4Settings[k]);
      ps4Settings = next;
      return changed as T;
    }
    case "get_game_modules": return ps4Modules as T;
    case "set_game_modules": ps4Modules.selected = args.selected as string[]; return undefined as T;
    case "open_folder": return undefined as T;
    case "get_converter": return { path: converter.path, args: converter.args, out_root: saved.game_dirs[0] ?? null, running: false } as T;
    case "set_converter": converter = { path: args.path as string, args: args.args as string }; return undefined as T;
    case "convert_pkg": {
      cancelled = false;
      const name = "Example Game-PPSA00000";
      void (async () => {
        for (const line of ["Reading package header...", "Extracting 1/3 ... 34%", "Extracting 2/3 ... 71%", "Extracting 3/3 ... 100%"]) {
          await wait(700);
          if (cancelled) { emit("convert-done", { name, ok: false, cancelled: true, code: null, found: 0, out_dir: "" }); return; }
          emit("convert-log", line);
        }
        await wait(500);
        emit("convert-done", { name, ok: true, cancelled: false, code: 0, found: 1, out_dir: `${saved.game_dirs[0]}/${name}` });
      })();
      return name as T;
    }
    case "cancel_convert": cancelled = true; return undefined as T;
    case "set_emulator_dir":
      if (args.platform === "ps4") ps4Dir = args.path as string; else emulatorDir = args.path as string;
      return undefined as T;
    case "install_emulator": {
      const ps4 = args.platform === "ps4";
      const total = ps4 ? 16_262_000 : 25_182_166;
      for (let i = 1; i <= 12; i++) { await wait(250); emit("update-progress", { stage: "downloading", downloaded: Math.round((i * total) / 12), total }); }
      emit("update-progress", { stage: "installing", downloaded: 0, total: 0 });
      await wait(1200);
      if (ps4) { ps4Dir = (args.dir as string | null) ?? "C:\\Users\\You\\AppData\\Local\\KytyPS4"; return ps4Dir as T; }
      emulatorDir = (args.dir as string | null) ?? "C:\\Users\\You\\AppData\\Local\\KytyPS5";
      return emulatorDir as T;
    }
    case "finish_setup": setupComplete = true; return undefined as T;
    case "reset_setup": setupComplete = false; return undefined as T;
    case "get_version":
      return (args.platform === "ps4"
        ? { line: "Release, clang-lld-64, ver = 0.2.0, git = v0.2.0, lua = 5.2, date = 2022.08.18", tag: "v0.2.0", semver: "0.2.0" }
        : version) as T;
    case "get_settings": return { settings: saved, config_path: "C:\\ProgramData\\Kyty\\Kyty.ini", config_exists: !query.has("fresh") } as T;
    case "get_devices": return devices as T;
    case "list_games": return (query.has("nops4games") ? games.filter((g) => g.platform === "ps5") : games) as T;
    case "save_settings": {
      const next = args.new as Settings;
      const changed = (Object.keys(next) as (keyof Settings)[]).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(saved[k]));
      saved = next;
      return changed as T;
    }
    case "launch_game": {
      const game = games.find((g) => g.id === args.gameId)!;
      running = { game_id: game.id, name: game.name, started_at: Date.now() / 1000, pid: 4242 };
      emit("emulator-started", running);
      let n = 0;
      timer = setInterval(() => emit("emulator-log", [`[${(n++ * 0.5).toFixed(1)}s] vkQueueSubmit frame ${n}`]), 500);
      return running as T;
    }
    case "stop_game": {
      clearInterval(timer);
      const id = running?.game_id;
      running = null;
      emit("emulator-exit", { game_id: id, code: 0, seconds: 12 });
      return undefined as T;
    }
    case "check_update":
      if (args.platform === "ps4") {
        return { current_tag: "v0.2.0", latest_tag: "v0.2.0", update_available: false, asset_name: "Kyty-v0.2.0.zip", asset_size: 16_262_000, notes: "", html_url: "https://github.com/InoriRus/Kyty/releases" } as T;
      }
      return update as T;
    case "install_update": {
      for (let i = 1; i <= 10; i++) { await wait(250); emit("update-progress", { stage: "downloading", downloaded: i * 9_640_000, total: update.asset_size }); }
      emit("update-progress", { stage: "installing", downloaded: 0, total: 0 });
      await wait(1200);
      return { ...version, tag: update.latest_tag } as T;
    }
    default: return undefined as T;
  }
}
