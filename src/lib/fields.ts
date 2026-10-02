import type { Devices, Settings } from "./api";

export const CONSOLE_LANGUAGES = [
  "Japanese", "English (United States)", "French (France)", "Spanish (Spain)", "German", "Italian",
  "Dutch", "Portuguese (Portugal)", "Russian", "Korean", "Chinese (Traditional)", "Chinese (Simplified)",
  "Finnish", "Swedish", "Danish", "Norwegian", "Polish", "Portuguese (Brazil)", "English (United Kingdom)",
  "Turkish", "Spanish (Latin America)", "Arabic", "French (Canada)", "Czech", "Hungarian", "Greek",
  "Romanian", "Thai", "Vietnamese", "Indonesian",
];

export const RESOLUTIONS = ["1280x720", "1920x1080", "2560x1440", "3840x2160"];
export const PRESENT_MODES = ["Fifo", "Mailbox", "Immediate"];
export const SHADER_OPTIMIZATIONS = ["None", "Size", "Performance"];
export const LOG_DIRECTIONS = ["Silent", "Console", "File"];

export const DEFAULT_SETTINGS: Settings = {
  user_name: "Kyty",
  user_id: 1000,
  console_language: 1,
  controller_color: "",
  amd_cpu_enabled: false,
  red_zone_protection_enabled: false,
  audio_input_device: "",
  screen_resolution: "1280x720",
  present_mode: "Mailbox",
  vblank_frequency: 60,
  shader_optimization_type: "Performance",
  gpu_index: -1,
  fullscreen_enabled: false,
  readback_linear_images: false,
  tessellation_enabled: false,
  vulkan_validation_enabled: false,
  shader_validation_enabled: true,
  renderdoc_enabled: false,
  command_buffer_dump_enabled: false,
  profiler_enabled: false,
  shader_log_direction: "Silent",
  shader_log_folder: "_Shaders",
  printf_direction: "Silent",
  printf_output_file: "_kyty.txt",
  command_buffer_dump_folder: "_Buffers",
  game_dirs: [],
};

export interface Ctx {
  devices: Devices | null;
}

interface Meta {
  label: string;
  group: string;
  format: (v: never, ctx: Ctx) => string;
}

const onOff = (v: boolean) => (v ? "On" : "Off");
const plain = (v: string | number) => String(v);
const orNone = (v: string) => v || "None";

/** Single source of truth for labels, used by the settings form and the save diff. */
export const META: Record<keyof Settings, Meta> = {
  user_name: { label: "User name", group: "User profile", format: plain },
  user_id: { label: "User ID", group: "User profile", format: plain },
  console_language: { label: "Console language", group: "User profile", format: ((v: number) => CONSOLE_LANGUAGES[v] ?? String(v)) as Meta["format"] },
  controller_color: { label: "DualSense lightbar", group: "User profile", format: ((v: string) => v.toUpperCase() || "Default") as Meta["format"] },
  amd_cpu_enabled: { label: "AMD CPU patch (experimental)", group: "Compatibility", format: onOff as Meta["format"] },
  red_zone_protection_enabled: { label: "Windows SysV red zone crash protection (experimental)", group: "Compatibility", format: onOff as Meta["format"] },
  audio_input_device: { label: "Microphone", group: "Audio", format: orNone as Meta["format"] },
  screen_resolution: { label: "Screen resolution", group: "Graphics & display", format: plain },
  present_mode: { label: "Present mode", group: "Graphics & display", format: plain },
  vblank_frequency: { label: "Vblank frequency", group: "Graphics & display", format: plain },
  shader_optimization_type: { label: "Shader optimization", group: "Graphics & display", format: plain },
  gpu_index: {
    label: "GPU",
    group: "Graphics & display",
    format: ((v: number, ctx: Ctx) => (v < 0 ? "Auto" : (ctx.devices?.gpus[v] ?? `GPU ${v}`))) as Meta["format"],
  },
  fullscreen_enabled: { label: "Fullscreen", group: "Graphics & display", format: onOff as Meta["format"] },
  readback_linear_images: { label: "Enable readback", group: "Graphics & display", format: onOff as Meta["format"] },
  tessellation_enabled: { label: "Enable tessellation support (experimental)", group: "Graphics & display", format: onOff as Meta["format"] },
  vulkan_validation_enabled: { label: "Vulkan validation", group: "Debugging & logs", format: onOff as Meta["format"] },
  shader_validation_enabled: { label: "Shader validation", group: "Debugging & logs", format: onOff as Meta["format"] },
  renderdoc_enabled: { label: "RenderDoc capture", group: "Debugging & logs", format: onOff as Meta["format"] },
  command_buffer_dump_enabled: { label: "Command buffer dump", group: "Debugging & logs", format: onOff as Meta["format"] },
  profiler_enabled: { label: "Tracy profiler", group: "Debugging & logs", format: onOff as Meta["format"] },
  shader_log_direction: { label: "Shader logging", group: "Debugging & logs", format: plain },
  shader_log_folder: { label: "Shader log folder", group: "Debugging & logs", format: plain },
  printf_direction: { label: "Printf output", group: "Debugging & logs", format: plain },
  printf_output_file: { label: "Printf output file", group: "Debugging & logs", format: plain },
  command_buffer_dump_folder: { label: "Command buffer folder", group: "Debugging & logs", format: plain },
  game_dirs: { label: "Game folders", group: "Game folders", format: ((v: string[]) => v.join(", ") || "None") as Meta["format"] },
};

export interface DiffRow {
  key: keyof Settings;
  label: string;
  group: string;
  before: string;
  after: string;
  added?: string[];
  removed?: string[];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Only the settings whose value differs from the original. */
export function diffSettings(original: Settings, draft: Settings, ctx: Ctx): DiffRow[] {
  return (Object.keys(META) as (keyof Settings)[])
    .filter((key) => !same(original[key], draft[key]))
    .map((key) => {
      const meta = META[key];
      const row: DiffRow = {
        key,
        label: meta.label,
        group: meta.group,
        before: meta.format(original[key] as never, ctx),
        after: meta.format(draft[key] as never, ctx),
      };
      if (key === "game_dirs") {
        const before = original.game_dirs;
        const after = draft.game_dirs;
        row.added = after.filter((d) => !before.includes(d));
        row.removed = before.filter((d) => !after.includes(d));
      }
      return row;
    });
}

export function formatPlayTime(seconds: number): string {
  if (seconds < 60) return seconds > 0 ? "<1 min" : "Never played";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDate(epochSeconds: number | null): string {
  return epochSeconds ? new Date(epochSeconds * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Never";
}
