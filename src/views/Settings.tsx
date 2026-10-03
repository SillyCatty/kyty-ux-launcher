import { useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  CONSOLE_LANGUAGES, LOG_DIRECTIONS, PRESENT_MODES, PROFILER_DIRECTIONS, PS4_RESOLUTIONS, RESOLUTIONS, SHADER_OPTIMIZATIONS, diffPs4, diffSettings,
} from "../lib/fields";
import { itemVariants, pageVariants } from "../lib/motion";
import { useApp } from "../store/app";
import { Button, Row, Section, Select, Stepper, TextField, Toggle, type Option } from "../components/ui";
import { GameFolders, Lightbar, Segmented } from "../components/Shared";

const opts = (list: string[]): Option<string>[] => list.map((v) => ({ value: v, label: v }));
const byteLength = (s: string) => new TextEncoder().encode(s).length;

/** PS5 | PS4 switch, shown once the PS4 emulator is set up. */
function PlatformSwitch() {
  const { ps4Dir, settingsPlatform, setSettingsPlatform } = useApp();
  if (!ps4Dir) return null;
  return (
    <div className="w-44">
      <Segmented<"ps5" | "ps4">
        value={settingsPlatform} onChange={setSettingsPlatform}
        options={[{ value: "ps5", label: "PS5" }, { value: "ps4", label: "PS4" }]}
      />
    </div>
  );
}

export function SettingsView() {
  const { settingsPlatform, ps4Dir } = useApp();
  return ps4Dir && settingsPlatform === "ps4" ? <Ps4Settings /> : <Ps5Settings />;
}

function Ps4Settings() {
  const { ps4Draft, ps4Original, patchPs4Draft, resetPs4Defaults, openDiff, rerunSetup } = useApp();
  const changes = useMemo(() => (ps4Original && ps4Draft ? diffPs4(ps4Original, ps4Draft) : []), [ps4Original, ps4Draft]);
  if (!ps4Draft) return null;
  const d = ps4Draft;
  const blank = [d.shader_log_folder, d.command_buffer_dump_folder, d.printf_output_file, d.profiler_output_file].some((v) => !v.trim());
  const profilerOn = d.profiler_direction === "File" || d.profiler_direction === "FileAndNetwork";

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" className="flex h-full flex-col">
      <motion.header variants={itemVariants} className="flex items-end justify-between gap-4 px-8 pb-4 pt-2">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold tracking-tight">Settings</h1>
          <p className="truncate text-[13px] text-mute">PS4 emulator (Kyty). These are saved by the launcher and applied each time you start a PS4 game.</p>
        </div>
        <div className="flex items-center gap-2.5"><PlatformSwitch /><Button onClick={() => void rerunSetup()}>Run setup again</Button></div>
      </motion.header>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-6">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Section title="Graphics & display" className="self-start">
            <Row label="Screen resolution"><Select value={d.screen_resolution} onChange={(v) => patchPs4Draft({ screen_resolution: v })} options={opts(PS4_RESOLUTIONS)} /></Row>
            <Row label="Shader optimization"><Select value={d.shader_optimization_type} onChange={(v) => patchPs4Draft({ shader_optimization_type: v })} options={opts(SHADER_OPTIMIZATIONS)} /></Row>
            <div className="mt-1 border-t border-line/70 pt-2">
              <Toggle checked={d.neo} onChange={(v) => patchPs4Draft({ neo: v })} label="PS4 Pro mode (Neo)" hint="Emulate the PS4 Pro hardware" />
            </div>
          </Section>

          <Section title="Debugging & logs">
            <Toggle checked={d.vulkan_validation_enabled} onChange={(v) => patchPs4Draft({ vulkan_validation_enabled: v })} label="Vulkan validation" hint="Needs the Vulkan SDK validation layer" />
            <Toggle checked={d.shader_validation_enabled} onChange={(v) => patchPs4Draft({ shader_validation_enabled: v })} label="Shader validation" />
            <Toggle checked={d.command_buffer_dump_enabled} onChange={(v) => patchPs4Draft({ command_buffer_dump_enabled: v })} label="Command buffer dump" />
            <Row label="Shader logging"><Select value={d.shader_log_direction} onChange={(v) => patchPs4Draft({ shader_log_direction: v })} options={opts(LOG_DIRECTIONS)} /></Row>
            <Row label="Printf output"><Select value={d.printf_direction} onChange={(v) => patchPs4Draft({ printf_direction: v })} options={opts(LOG_DIRECTIONS)} /></Row>
            <Row label="Profiler"><Select value={d.profiler_direction} onChange={(v) => patchPs4Draft({ profiler_direction: v })} options={opts(PROFILER_DIRECTIONS)} /></Row>
          </Section>
        </div>

        <Section title="Output locations" className="mt-4">
          <div className="grid grid-cols-1 gap-x-8 lg:grid-cols-2">
            <Row label="Shader log folder"><TextField value={d.shader_log_folder} onChange={(v) => patchPs4Draft({ shader_log_folder: v })} disabled={d.shader_log_direction !== "File"} invalid={!d.shader_log_folder.trim()} /></Row>
            <Row label="Command buffer folder"><TextField value={d.command_buffer_dump_folder} onChange={(v) => patchPs4Draft({ command_buffer_dump_folder: v })} disabled={!d.command_buffer_dump_enabled} invalid={!d.command_buffer_dump_folder.trim()} /></Row>
            <Row label="Printf output file"><TextField value={d.printf_output_file} onChange={(v) => patchPs4Draft({ printf_output_file: v })} disabled={d.printf_direction !== "File"} invalid={!d.printf_output_file.trim()} /></Row>
            <Row label="Profiler output file"><TextField value={d.profiler_output_file} onChange={(v) => patchPs4Draft({ profiler_output_file: v })} disabled={!profilerOn} invalid={!d.profiler_output_file.trim()} /></Row>
          </div>
        </Section>

        <Section title="Game folders" className="mt-4">
          <p className="px-2 pb-1 text-[12px] text-mute">Shared with PS5: PS4 and PS5 games are told apart automatically.</p>
          <GameFolders />
        </Section>
      </div>

      <motion.footer variants={itemVariants} className="relative z-10 flex shrink-0 items-center justify-between gap-4 border-t border-line bg-bg/80 px-8 py-3.5 backdrop-blur-xl">
        <span className={`text-[13px] ${changes.length ? "text-warn" : "text-mute"}`}>
          {changes.length ? `${changes.length} unsaved change${changes.length === 1 ? "" : "s"}` : "No unsaved changes"}
        </span>
        <div className="flex gap-2.5">
          <Button onClick={resetPs4Defaults}>Reset to defaults</Button>
          <Button variant="primary" pulse disabled={!changes.length || blank} onClick={openDiff}>Save Config</Button>
        </div>
      </motion.footer>
    </motion.div>
  );
}

function Ps5Settings() {
  const { draft, original, devices, patchDraft, resetToDefaults, openDiff, configPath, rerunSetup } = useApp();
  const changes = useMemo(() => (original && draft ? diffSettings(original, draft, { devices }) : []), [original, draft, devices]);
  if (!draft) return null;

  const nameBytes = byteLength(draft.user_name);
  const nameInvalid = nameBytes < 1 || nameBytes > 16;
  const idInvalid = draft.user_id === 254 || draft.user_id === 255;

  const micOptions: Option<string>[] = [{ value: "", label: "None" }, ...(devices?.microphones ?? []).map((m) => ({ value: m, label: m }))];
  if (draft.audio_input_device && !micOptions.some((o) => o.value === draft.audio_input_device)) {
    micOptions.push({ value: draft.audio_input_device, label: `${draft.audio_input_device} (unavailable)` });
  }
  const gpuOptions: Option<number>[] = [{ value: -1, label: "Auto" }, ...(devices?.gpus ?? []).map((g, i) => ({ value: i, label: g }))];
  if (draft.gpu_index >= (devices?.gpus.length ?? 0) && draft.gpu_index >= 0) gpuOptions.push({ value: draft.gpu_index, label: `GPU ${draft.gpu_index} (unavailable)` });

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" className="flex h-full flex-col">
      <motion.header variants={itemVariants} className="flex items-end justify-between gap-4 px-8 pb-4 pt-2">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold tracking-tight">Settings</h1>
          <p className="truncate text-[13px] text-mute">Edits the emulator's own config <span className="font-mono text-[12px]">{configPath}</span></p>
        </div>
        <div className="flex items-center gap-2.5"><PlatformSwitch /><Button onClick={() => void rerunSetup()}>Run setup again</Button></div>
      </motion.header>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-6">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="flex flex-col gap-4">
            <Section title="User profile">
              <Row label="User name" hint={nameInvalid ? "1 to 16 bytes" : undefined}>
                <TextField value={draft.user_name} onChange={(v) => patchDraft({ user_name: v })} invalid={nameInvalid} />
              </Row>
              <Row label="User ID" hint={idInvalid ? "254 and 255 are reserved" : "Local user ID exposed to games"}>
                <Stepper value={draft.user_id} min={0} max={2147483647} onChange={(v) => patchDraft({ user_id: v })} />
              </Row>
              <Row label="Console language">
                <Select value={draft.console_language} onChange={(v) => patchDraft({ console_language: v })} options={CONSOLE_LANGUAGES.map((l, i) => ({ value: i, label: l }))} />
              </Row>
              <Row label="DualSense lightbar"><Lightbar /></Row>
            </Section>

            <Section title="Compatibility">
              <Toggle checked={draft.amd_cpu_enabled} onChange={(v) => patchDraft({ amd_cpu_enabled: v })} label="AMD CPU patch (experimental)" />
              <Toggle checked={draft.red_zone_protection_enabled} onChange={(v) => patchDraft({ red_zone_protection_enabled: v })} label="Windows SysV red zone crash protection (experimental)" />
            </Section>

            <Section title="Audio">
              <Row label="Microphone" hint="None supplies silence to games">
                <Select value={draft.audio_input_device} onChange={(v) => patchDraft({ audio_input_device: v })} options={micOptions} />
              </Row>
            </Section>
          </div>

          <Section title="Graphics & display" className="self-start">
            <Row label="Screen resolution"><Select value={draft.screen_resolution} onChange={(v) => patchDraft({ screen_resolution: v })} options={opts(RESOLUTIONS)} /></Row>
            <Row label="Present mode"><Select value={draft.present_mode} onChange={(v) => patchDraft({ present_mode: v })} options={opts(PRESENT_MODES)} /></Row>
            <Row label="Vblank frequency" hint="Virtual refresh rate for frame pacing">
              <Stepper value={draft.vblank_frequency} min={30} max={360} onChange={(v) => patchDraft({ vblank_frequency: v })} />
            </Row>
            <Row label="Shader optimization"><Select value={draft.shader_optimization_type} onChange={(v) => patchDraft({ shader_optimization_type: v })} options={opts(SHADER_OPTIMIZATIONS)} /></Row>
            <Row label="GPU"><Select value={draft.gpu_index} onChange={(v) => patchDraft({ gpu_index: v })} options={gpuOptions} /></Row>
            <div className="mt-1 border-t border-line/70 pt-2">
              <Toggle checked={draft.fullscreen_enabled} onChange={(v) => patchDraft({ fullscreen_enabled: v })} label="Fullscreen" />
              <Toggle checked={draft.readback_linear_images} onChange={(v) => patchDraft({ readback_linear_images: v })} label="Enable readback" />
              <Toggle checked={draft.tessellation_enabled} onChange={(v) => patchDraft({ tessellation_enabled: v })} label="Enable tessellation support (experimental)" />
            </div>
          </Section>
        </div>

        <Section title="Debugging & logs" className="mt-4">
          <div className="grid grid-cols-1 gap-x-8 lg:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Toggle checked={draft.vulkan_validation_enabled} onChange={(v) => patchDraft({ vulkan_validation_enabled: v })} label="Vulkan validation" />
              <Toggle checked={draft.renderdoc_enabled} onChange={(v) => patchDraft({ renderdoc_enabled: v })} label="RenderDoc capture" />
              <Row label="Shader logging"><Select value={draft.shader_log_direction} onChange={(v) => patchDraft({ shader_log_direction: v })} options={opts(LOG_DIRECTIONS)} /></Row>
              <Row label="Printf output"><Select value={draft.printf_direction} onChange={(v) => patchDraft({ printf_direction: v })} options={opts(LOG_DIRECTIONS)} /></Row>
              <Toggle checked={draft.profiler_enabled} onChange={(v) => patchDraft({ profiler_enabled: v })} label="Tracy profiler" />
            </div>
            <div className="flex flex-col gap-1">
              <Toggle checked={draft.shader_validation_enabled} onChange={(v) => patchDraft({ shader_validation_enabled: v })} label="Shader validation" />
              <Toggle checked={draft.command_buffer_dump_enabled} onChange={(v) => patchDraft({ command_buffer_dump_enabled: v })} label="Command buffer dump" />
              <Row label="Shader log folder"><TextField value={draft.shader_log_folder} onChange={(v) => patchDraft({ shader_log_folder: v })} disabled={draft.shader_log_direction !== "File"} /></Row>
              <Row label="Printf output file"><TextField value={draft.printf_output_file} onChange={(v) => patchDraft({ printf_output_file: v })} disabled={draft.printf_direction !== "File"} /></Row>
              <Row label="Command buffer folder"><TextField value={draft.command_buffer_dump_folder} onChange={(v) => patchDraft({ command_buffer_dump_folder: v })} disabled={!draft.command_buffer_dump_enabled} /></Row>
            </div>
          </div>
        </Section>

        <Section title="Game folders" className="mt-4">
          <GameFolders />
        </Section>
      </div>

      <motion.footer variants={itemVariants} className="relative z-10 flex shrink-0 items-center justify-between gap-4 border-t border-line bg-bg/80 px-8 py-3.5 backdrop-blur-xl">
        <div className="flex items-center gap-3 text-[13px]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={changes.length ? "dirty" : "clean"} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}
              className={changes.length ? "text-warn" : "text-mute"}
            >
              {changes.length ? `${changes.length} unsaved change${changes.length === 1 ? "" : "s"}` : "No unsaved changes"}
            </motion.span>
          </AnimatePresence>
        </div>
        <div className="flex gap-2.5">
          <Button onClick={resetToDefaults}>Reset to defaults</Button>
          <Button variant="primary" pulse disabled={!changes.length || nameInvalid || idInvalid} onClick={openDiff}>Save Config</Button>
        </div>
      </motion.footer>
    </motion.div>
  );
}
