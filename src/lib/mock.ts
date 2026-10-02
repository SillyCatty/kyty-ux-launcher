// Dev-only stand-in for the Rust backend, used when the UI runs in a plain browser (npm run dev).
import { DEFAULT_SETTINGS } from "./fields";
import type { Devices, Game, RunningInfo, Settings, UpdateInfo, Version } from "./api";

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
].map(([name, id, version, firmware, custom, secs, last]) => ({
  id: `c:/games/${id}`, name: name as string, title_id: id as string, version: version as string, firmware: firmware as string,
  path: `C:/Games/${id}`, icon: null, background: null, custom_settings: custom as boolean,
  last_played: last as number | null, play_seconds: secs as number,
}));

// ?fresh -> first run with no emulator found, ?found -> an existing install is detected.
const query = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
let emulatorDir: string | null = query.has("fresh") ? null : "C:/Emu/KytyPS5";
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
      default_install_dir: "C:\\Users\\You\\AppData\\Local\\KytyPS5", running,
    } as T;
    case "find_installs": {
      await wait(900);
      return (query.has("found")
        ? [{ path: "C:\\Users\\You\\Downloads\\KytyPS5-Windows-x64", modified: 1_790_700_000 }, { path: "D:\\Games\\KytyPS5", modified: 1_780_000_000 }]
        : []) as T;
    }
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
    case "set_emulator_dir": emulatorDir = args.path as string; return undefined as T;
    case "install_emulator": {
      for (let i = 1; i <= 12; i++) { await wait(250); emit("update-progress", { stage: "downloading", downloaded: i * 2_098_000, total: 25_182_166 }); }
      emit("update-progress", { stage: "installing", downloaded: 0, total: 0 });
      await wait(1200);
      emulatorDir = (args.dir as string | null) ?? "C:\\Users\\You\\AppData\\Local\\KytyPS5";
      return emulatorDir as T;
    }
    case "finish_setup": setupComplete = true; return undefined as T;
    case "reset_setup": setupComplete = false; return undefined as T;
    case "get_version": return version as T;
    case "get_settings": return { settings: saved, config_path: "C:\\ProgramData\\Kyty\\Kyty.ini", config_exists: !query.has("fresh") } as T;
    case "get_devices": return devices as T;
    case "list_games": return games as T;
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
    case "check_update": return update as T;
    case "install_update": {
      for (let i = 1; i <= 10; i++) { await wait(250); emit("update-progress", { stage: "downloading", downloaded: i * 9_640_000, total: update.asset_size }); }
      emit("update-progress", { stage: "installing", downloaded: 0, total: 0 });
      await wait(1200);
      return { ...version, tag: update.latest_tag } as T;
    }
    default: return undefined as T;
  }
}
