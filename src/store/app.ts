import { create } from "zustand";
import {
  api, errorText, launcherApi, on, pickFolder,
  type Devices, type ExitInfo, type Game, type Install, type LauncherUpdate, type RunningInfo, type Settings, type UpdateInfo, type UpdateProgress, type Version,
} from "../lib/api";
import { DEFAULT_SETTINGS } from "../lib/fields";

export type View = "library" | "settings" | "updates";
export type Boot = "loading" | "setup" | "ready";
export interface Toast { id: number; kind: "info" | "success" | "error"; text: string }
export interface UpdateState {
  status: "idle" | "checking" | "available" | "uptodate" | "error" | "installing" | "done";
  info?: UpdateInfo;
  progress?: UpdateProgress;
  error?: string;
}
export interface LauncherUpdateState {
  status: "idle" | "checking" | "available" | "uptodate" | "error" | "installing";
  version?: string;
  notes?: string;
  progress?: number;
  error?: string;
}
export interface EmulatorInstall {
  status: "idle" | "installing" | "error";
  progress?: UpdateProgress;
  error?: string;
}

const MAX_LOG_LINES = 300;
let toastId = 0;
let subscribed = false;
let pendingLauncherUpdate: LauncherUpdate | null = null;

interface AppState {
  boot: Boot;
  view: View;
  emulatorDir: string | null;
  defaultInstallDir: string;
  installs: Install[] | null;
  emulatorInstall: EmulatorInstall;
  repo: string;
  autoCheck: boolean;
  version: Version | null;
  configPath: string;

  games: Game[];
  gamesLoading: boolean;
  selectedGameId: string | null;
  running: RunningInfo | null;
  logs: string[];

  original: Settings | null;
  draft: Settings | null;
  devices: Devices | null;
  diffOpen: boolean;
  saving: boolean;

  update: UpdateState;
  launcherVersion: string;
  launcherUpdate: LauncherUpdateState;
  toasts: Toast[];

  init: () => Promise<void>;
  checkLauncherUpdate: (manual: boolean) => Promise<void>;
  installLauncherUpdate: () => Promise<void>;
  scanInstalls: () => Promise<void>;
  adoptInstall: (path: string) => Promise<boolean>;
  browseForEmulator: () => Promise<void>;
  installEmulator: (dir?: string) => Promise<boolean>;
  finishSetup: () => Promise<void>;
  rerunSetup: () => Promise<void>;
  setView: (view: View) => void;
  selectGame: (id: string | null) => void;
  refreshGames: () => Promise<void>;
  launch: (id: string) => Promise<void>;
  stop: () => Promise<void>;

  patchDraft: (patch: Partial<Settings>) => void;
  resetToDefaults: () => void;
  addGameFolder: () => Promise<void>;
  removeGameFolder: (dir: string) => void;
  openFolder: (path: string) => Promise<void>;
  changeGameFolder: (old: string | null) => Promise<void>;
  removeSavedGameFolder: (dir: string) => Promise<void>;
  openDiff: () => void;
  closeDiff: () => void;
  cancelChanges: () => void;
  saveChanges: () => Promise<void>;

  checkUpdate: (manual: boolean) => Promise<void>;
  installUpdate: () => Promise<void>;
  savePrefs: (repo: string, autoCheck: boolean) => Promise<void>;
  toast: (kind: Toast["kind"], text: string) => void;
  dismissToast: (id: number) => void;
}

export const useApp = create<AppState>((set, get) => {
  /** Loads everything that depends on a valid emulator folder. */
  const loadEmulatorData = async () => {
    const [loaded, devices, games, version] = await Promise.all([
      api.getSettings(), api.getDevices(), api.listGames(), api.getVersion(),
    ]);
    // A brand-new config has no AMD patch decision yet, so suggest it for AMD CPUs.
    const draft = !loaded.config_exists && devices.amd_cpu ? { ...loaded.settings, amd_cpu_enabled: true } : loaded.settings;
    set({ original: loaded.settings, draft, configPath: loaded.config_path, devices, games, version });
  };

  /** Saves only the folder list right away; other unsaved edits in Settings stay as drafts. */
  const persistFolders = async (next: string[], message: string) => {
    const { original, draft } = get();
    if (!original || !draft) return;
    try {
      await api.saveSettings({ ...original, game_dirs: next });
      set({ original: { ...original, game_dirs: next }, draft: { ...draft, game_dirs: next } });
      await get().refreshGames();
      get().toast("success", message);
    } catch (e) {
      get().toast("error", errorText(e));
    }
  };

  return {
    boot: "loading",
    view: "library",
    emulatorDir: null,
    defaultInstallDir: "",
    installs: null,
    emulatorInstall: { status: "idle" },
    repo: "KytyPS5/KytyPS5",
    autoCheck: true,
    version: null,
    configPath: "",
    games: [],
    gamesLoading: false,
    selectedGameId: null,
    running: null,
    logs: [],
    original: null,
    draft: null,
    devices: null,
    diffOpen: false,
    saving: false,
    update: { status: "idle" },
    launcherVersion: "",
    launcherUpdate: { status: "idle" },
    toasts: [],

    toast: (kind, text) => {
      const id = ++toastId;
      set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }] }));
      setTimeout(() => get().dismissToast(id), kind === "error" ? 7000 : 3800);
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    init: async () => {
      if (!subscribed) {
        subscribed = true;
        await on<RunningInfo>("emulator-started", (running) => set({ running, logs: [] }));
        await on<string[]>("emulator-log", (lines) => set((s) => ({ logs: [...s.logs, ...lines].slice(-MAX_LOG_LINES) })));
        await on<ExitInfo>("emulator-exit", (exit) => {
          const name = get().running?.name ?? "The game";
          set({ running: null });
          if (exit.code && exit.code !== 0) get().toast("error", `${name} stopped unexpectedly (exit code ${exit.code}).`);
          else get().toast("info", `${name} closed.`);
          void get().refreshGames();
        });
        await on<UpdateProgress>("update-progress", (progress) =>
          set((s) => ({
            update: s.update.status === "installing" ? { ...s.update, progress } : s.update,
            emulatorInstall: s.emulatorInstall.status === "installing" ? { ...s.emulatorInstall, progress } : s.emulatorInstall,
          })),
        );
      }

      try {
        const snap = await api.getState();
        set({
          emulatorDir: snap.emulator_dir, repo: snap.repo, autoCheck: snap.auto_check_updates,
          running: snap.running, defaultInstallDir: snap.default_install_dir,
        });
        void launcherApi.version().then((launcherVersion) => set({ launcherVersion }));
        if (snap.emulator_dir) await loadEmulatorData();
        if (!snap.emulator_dir || !snap.setup_complete) {
          set({ boot: "setup" });
          void get().scanInstalls();
          return;
        }
        set({ boot: "ready" });
        if (snap.auto_check_updates) {
          void get().checkUpdate(false);
          void get().checkLauncherUpdate(false);
        }
      } catch (e) {
        set({ boot: "setup" });
        get().toast("error", errorText(e));
      }
    },

    checkLauncherUpdate: async (manual) => {
      if (get().launcherUpdate.status === "installing") return;
      set({ launcherUpdate: { status: "checking" } });
      try {
        if (!get().launcherVersion) set({ launcherVersion: await launcherApi.version() });
        pendingLauncherUpdate = await launcherApi.check();
        if (!pendingLauncherUpdate) {
          set({ launcherUpdate: { status: "uptodate" } });
          return;
        }
        set({ launcherUpdate: { status: "available", version: pendingLauncherUpdate.version, notes: pendingLauncherUpdate.notes } });
        if (!manual) get().toast("info", `Launcher update available: v${pendingLauncherUpdate.version}`);
      } catch (e) {
        set({ launcherUpdate: { status: "error", error: errorText(e) } });
        if (manual) get().toast("error", errorText(e));
      }
    },

    installLauncherUpdate: async () => {
      const update = pendingLauncherUpdate;
      const { launcherUpdate, running } = get();
      if (!update || launcherUpdate.status !== "available") return;
      if (running) {
        get().toast("error", "Close the running game before updating the launcher.");
        return;
      }
      const base = { version: launcherUpdate.version, notes: launcherUpdate.notes };
      set({ launcherUpdate: { status: "installing", ...base, progress: 0 } });
      try {
        await update.install((progress) => set({ launcherUpdate: { status: "installing", ...base, progress } }));
        // On Windows the installer closes and relaunches the app, so this is only reached briefly.
      } catch (e) {
        set({ launcherUpdate: { status: "error", ...base, error: errorText(e) } });
        get().toast("error", errorText(e));
      }
    },

    scanInstalls: async () => {
      set({ installs: null });
      try {
        set({ installs: await api.findInstalls() });
      } catch {
        set({ installs: [] });
      }
    },

    adoptInstall: async (path) => {
      try {
        await api.setEmulatorDir(path);
        set({ emulatorDir: path });
        await loadEmulatorData();
        return true;
      } catch (e) {
        get().toast("error", errorText(e));
        return false;
      }
    },

    browseForEmulator: async () => {
      const dir = await pickFolder("Select the folder that contains kyty_emulator.exe");
      if (dir) await get().adoptInstall(dir);
    },

    installEmulator: async (dir) => {
      set({ emulatorInstall: { status: "installing", progress: { stage: "downloading", downloaded: 0, total: 0 } } });
      try {
        const path = await api.installEmulator(dir);
        set({ emulatorInstall: { status: "idle" } });
        return await get().adoptInstall(path);
      } catch (e) {
        set({ emulatorInstall: { status: "error", error: errorText(e) } });
        return false;
      }
    },

    finishSetup: async () => {
      const { draft } = get();
      if (!draft) return;
      set({ saving: true });
      try {
        await api.saveSettings(draft);
        await api.finishSetup();
        set({ original: draft, boot: "ready", view: "library" });
        await get().refreshGames();
        get().toast("success", "You're all set. Pick a game to play!");
        if (get().autoCheck) void get().checkUpdate(false);
      } catch (e) {
        get().toast("error", errorText(e));
      } finally {
        set({ saving: false });
      }
    },

    rerunSetup: async () => {
      try {
        await api.resetSetup();
        set({ boot: "setup", selectedGameId: null });
        void get().scanInstalls();
      } catch (e) {
        get().toast("error", errorText(e));
      }
    },

    setView: (view) => set({ view, selectedGameId: null }),
    selectGame: (selectedGameId) => set({ selectedGameId }),

    refreshGames: async () => {
      set({ gamesLoading: true });
      try {
        set({ games: await api.listGames() });
      } catch (e) {
        get().toast("error", errorText(e));
      } finally {
        set({ gamesLoading: false });
      }
    },

    launch: async (id) => {
      try {
        set({ running: await api.launchGame(id), logs: [] });
      } catch (e) {
        get().toast("error", errorText(e));
      }
    },

    stop: async () => {
      try {
        await api.stopGame();
      } catch (e) {
        get().toast("error", errorText(e));
      }
    },

    patchDraft: (patch) => set((s) => (s.draft ? { draft: { ...s.draft, ...patch } } : {})),
    resetToDefaults: () => set((s) => (s.draft ? { draft: { ...DEFAULT_SETTINGS, game_dirs: s.draft.game_dirs } } : {})),
    addGameFolder: async () => {
      const dir = await pickFolder("Select a folder that contains your PS5 games");
      const draft = get().draft;
      if (!dir || !draft) return;
      const norm = dir.replace(/\\/g, "/").replace(/\/+$/, "");
      if (draft.game_dirs.some((d) => d.toLowerCase() === norm.toLowerCase())) return;
      get().patchDraft({ game_dirs: [...draft.game_dirs, norm] });
    },
    removeGameFolder: (dir) => set((s) => (s.draft ? { draft: { ...s.draft, game_dirs: s.draft.game_dirs.filter((d) => d !== dir) } } : {})),

    openFolder: async (path) => {
      try {
        await api.openFolder(path);
      } catch (e) {
        get().toast("error", errorText(e));
      }
    },

    /** Replaces `old` with a newly picked folder (or adds one when `old` is null) and saves right away. */
    changeGameFolder: async (old) => {
      const { original } = get();
      if (!original) return;
      const picked = await pickFolder(old ? "Choose the new location for this games folder" : "Select a folder that contains your games");
      if (!picked) return;
      const norm = picked.replace(/\\/g, "/").replace(/\/+$/, "");
      const swapped = old ? original.game_dirs.map((d) => (d === old ? norm : d)) : [...original.game_dirs, norm];
      const seen = new Set<string>();
      const next = swapped.filter((d) => !seen.has(d.toLowerCase()) && seen.add(d.toLowerCase()));
      await persistFolders(next, old ? "Games folder changed." : "Games folder added.");
    },

    /** Removes a folder from the library. Nothing on disk is deleted. */
    removeSavedGameFolder: async (dir) => {
      const { original } = get();
      if (!original) return;
      await persistFolders(original.game_dirs.filter((d) => d !== dir), "Games folder removed from the library.");
    },

    openDiff: () => set({ diffOpen: true }),
    closeDiff: () => set({ diffOpen: false }),
    cancelChanges: () => set((s) => ({ draft: s.original, diffOpen: false })),

    saveChanges: async () => {
      const { draft, original } = get();
      if (!draft || !original) return;
      set({ saving: true });
      try {
        const changed = await api.saveSettings(draft);
        set({ original: draft, diffOpen: false });
        get().toast("success", changed.length ? `Saved ${changed.length} change${changed.length === 1 ? "" : "s"} to the emulator config.` : "Nothing to save.");
        if (changed.includes("game_dirs")) await get().refreshGames();
      } catch (e) {
        get().toast("error", errorText(e));
      } finally {
        set({ saving: false });
      }
    },

    checkUpdate: async (manual) => {
      set({ update: { status: "checking" } });
      try {
        const info = await api.checkUpdate();
        set({ update: { status: info.update_available ? "available" : "uptodate", info } });
        if (info.update_available && !manual) get().toast("info", `Update available: ${info.latest_tag}`);
      } catch (e) {
        set({ update: { status: "error", error: errorText(e) } });
        if (manual) get().toast("error", errorText(e));
      }
    },

    installUpdate: async () => {
      const info = get().update.info;
      set({ update: { status: "installing", info, progress: { stage: "downloading", downloaded: 0, total: info?.asset_size ?? 0 } } });
      try {
        const version = await api.installUpdate();
        set({ version, update: { status: "done", info } });
        get().toast("success", "KytyPS5 was updated.");
      } catch (e) {
        set({ update: { status: "error", info, error: errorText(e) } });
        get().toast("error", errorText(e));
      }
    },

    savePrefs: async (repo, autoCheck) => {
      try {
        await api.setUpdatePrefs(repo, autoCheck);
        set({ repo: repo.trim(), autoCheck });
      } catch (e) {
        get().toast("error", errorText(e));
      }
    },
  };
});
