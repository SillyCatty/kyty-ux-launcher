import { invoke as tauriInvoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen as tauriListen } from "@tauri-apps/api/event";

export interface Settings {
  user_name: string;
  user_id: number;
  console_language: number;
  controller_color: string;
  amd_cpu_enabled: boolean;
  red_zone_protection_enabled: boolean;
  audio_input_device: string;
  screen_resolution: string;
  present_mode: string;
  vblank_frequency: number;
  shader_optimization_type: string;
  gpu_index: number;
  fullscreen_enabled: boolean;
  readback_linear_images: boolean;
  tessellation_enabled: boolean;
  vulkan_validation_enabled: boolean;
  shader_validation_enabled: boolean;
  renderdoc_enabled: boolean;
  command_buffer_dump_enabled: boolean;
  profiler_enabled: boolean;
  shader_log_direction: string;
  shader_log_folder: string;
  printf_direction: string;
  printf_output_file: string;
  command_buffer_dump_folder: string;
  game_dirs: string[];
}

export interface Game {
  id: string;
  name: string;
  title_id: string;
  version: string;
  firmware: string;
  path: string;
  icon: string | null;
  background: string | null;
  custom_settings: boolean;
  last_played: number | null;
  play_seconds: number;
}

export interface RunningInfo {
  game_id: string;
  name: string;
  started_at: number;
  pid: number;
}

export interface ExitInfo {
  game_id: string;
  code: number | null;
  seconds: number;
}

export interface Snapshot {
  emulator_dir: string | null;
  repo: string;
  auto_check_updates: boolean;
  setup_complete: boolean;
  default_install_dir: string;
  running: RunningInfo | null;
}

export interface Install {
  path: string;
  modified: number;
}

export interface ConverterConfig {
  path: string;
  args: string;
  out_root: string | null;
  running: boolean;
}

export interface ConvertDone {
  name: string;
  ok: boolean;
  cancelled: boolean;
  code: number | null;
  found: number;
  out_dir: string;
}

export interface Version {
  line: string | null;
  tag: string | null;
  semver: string | null;
}

export interface Devices {
  gpus: string[];
  microphones: string[];
  cpu: string;
  amd_cpu: boolean;
}

export interface UpdateInfo {
  current_tag: string | null;
  latest_tag: string;
  update_available: boolean;
  asset_name: string | null;
  asset_size: number;
  notes: string;
  html_url: string;
}

export interface UpdateProgress {
  stage: "downloading" | "installing" | "done";
  downloaded: number;
  total: number;
}

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
type Listen = <T>(event: string, handler: (payload: T) => void) => Promise<() => void>;

const realInvoke: Invoke = (cmd, args) => tauriInvoke(cmd, args);
const realListen: Listen = (event, handler) => tauriListen(event, (e) => handler(e.payload as never));

let backend: Promise<{ invoke: Invoke; listen: Listen }> | null = null;

/** In dev, outside Tauri (or with `?mock`) a mock stands in for the Rust backend. */
const useMock = import.meta.env.DEV && (!isTauri || new URLSearchParams(location.search).has("mock"));

function getBackend() {
  backend ??= useMock
    ? import("./mock").then((m) => ({ invoke: m.mockInvoke as Invoke, listen: m.mockListen as Listen }))
    : Promise.resolve({ invoke: realInvoke, listen: realListen });
  return backend;
}

const call = async <T>(cmd: string, args?: Record<string, unknown>) => (await getBackend()).invoke<T>(cmd, args);

export const on = async <T>(event: string, handler: (payload: T) => void) => (await getBackend()).listen<T>(event, handler);

export const imageSrc = (path: string | null) =>
  path ? (useMock ? path : convertFileSrc(path)) : undefined;

export const api = {
  getState: () => call<Snapshot>("get_state"),
  setEmulatorDir: (path: string) => call<void>("set_emulator_dir", { path }),
  findInstalls: () => call<Install[]>("find_installs"),
  openFolder: (path: string) => call<void>("open_folder", { path }),
  getConverter: () => call<ConverterConfig>("get_converter"),
  setConverter: (path: string, args: string) => call<void>("set_converter", { path, args }),
  convertPkg: (pkg: string) => call<string>("convert_pkg", { pkg }),
  cancelConvert: () => call<void>("cancel_convert"),
  installEmulator: (dir?: string) => call<string>("install_emulator", { dir: dir ?? null }),
  finishSetup: () => call<void>("finish_setup"),
  resetSetup: () => call<void>("reset_setup"),
  setUpdatePrefs: (repo: string, autoCheck: boolean) => call<void>("set_update_prefs", { repo, autoCheck }),
  getVersion: () => call<Version>("get_version"),
  getSettings: () => call<{ settings: Settings; config_path: string; config_exists: boolean }>("get_settings"),
  saveSettings: (settings: Settings) => call<string[]>("save_settings", { new: settings }),
  listGames: () => call<Game[]>("list_games"),
  launchGame: (gameId: string) => call<RunningInfo>("launch_game", { gameId }),
  stopGame: () => call<void>("stop_game"),
  getDevices: () => call<Devices>("get_devices"),
  checkUpdate: () => call<UpdateInfo>("check_update"),
  installUpdate: () => call<Version>("install_update"),
};

export interface LauncherUpdate {
  version: string;
  notes: string;
  /** Downloads, verifies the signature and installs; the app restarts itself afterwards. */
  install: (onProgress: (fraction: number) => void) => Promise<void>;
}

export const launcherApi = {
  version: async (): Promise<string> => (useMock ? "0.1.1" : (await import("@tauri-apps/api/app")).getVersion()),

  check: async (): Promise<LauncherUpdate | null> => {
    if (useMock) {
      if (!new URLSearchParams(location.search).has("lu")) return null;
      return {
        version: "0.1.2",
        notes: "- Faster library loading\n- Fixed a rare crash on startup",
        install: async (onProgress) => {
          for (let i = 1; i <= 10; i++) { await new Promise((r) => setTimeout(r, 250)); onProgress(i / 10); }
        },
      };
    }
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) return null;
    return {
      version: update.version,
      notes: update.body ?? "",
      install: async (onProgress) => {
        let total = 0;
        let done = 0;
        await update.downloadAndInstall((event) => {
          if (event.event === "Started") total = event.data.contentLength ?? 0;
          else if (event.event === "Progress") {
            done += event.data.chunkLength;
            if (total > 0) onProgress(Math.min(1, done / total));
          } else onProgress(1);
        });
      },
    };
  },
};

export async function pickFile(title: string, extensions: string[]): Promise<string | null> {
  if (isTauri && !useMock) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ directory: false, multiple: false, title, filters: [{ name: extensions.join(", "), extensions }] });
    return typeof picked === "string" ? picked : null;
  }
  if (useMock) return extensions.includes("pkg") ? "C:\\Users\\You\\Downloads\\Example Game-PPSA00000.pkg" : "C:\\Tools\\unpack.exe";
  return window.prompt(title);
}

export async function pickFolder(title: string): Promise<string | null> {
  if (isTauri && !useMock) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ directory: true, multiple: false, title });
    return typeof picked === "string" ? picked : null;
  }
  return useMock ? "C:\\Users\\You\\Downloads\\KytyPS5-Windows-x64" : window.prompt(title);
}

export const errorText =(e: unknown) => (typeof e === "string" ? e : e instanceof Error ? e.message : "Something went wrong.");
