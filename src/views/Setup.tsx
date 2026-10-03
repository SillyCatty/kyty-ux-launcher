import { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { pickFolder, type Platform } from "../lib/api";
import { CONSOLE_LANGUAGES, PRESENT_MODES, RESOLUTIONS, diffSettings, formatBytes, formatDate } from "../lib/fields";
import { itemVariants, pageVariants, springBouncy, springSoft, tap } from "../lib/motion";
import { useApp } from "../store/app";
import { Button, Progress, Row, Select, Stepper, TextField, Toggle, type Option } from "../components/ui";
import { GameFolders, Lightbar, Segmented } from "../components/Shared";
import { IconCheck, IconDownload, IconFolder, IconRefresh } from "../components/icons";

const STEPS = ["Emulator", "PS4", "Profile", "Graphics", "System", "Games", "Finish"];
const byteLength = (s: string) => new TextEncoder().encode(s).length;

const slide = {
  initial: (d: number) => ({ opacity: 0, x: 64 * d, scale: 0.98 }),
  animate: { opacity: 1, x: 0, scale: 1, transition: { opacity: { duration: 0.2 }, x: springBouncy, scale: springBouncy, staggerChildren: 0.05, delayChildren: 0.04 } },
  exit: (d: number) => ({ opacity: 0, x: -44 * d, transition: { duration: 0.14 } }),
};

function Heading({ title, children }: { title: string; children: ReactNode }) {
  return (
    <motion.div variants={itemVariants} className="mb-6">
      <h2 className="text-[24px] font-semibold tracking-tight">{title}</h2>
      <p className="mt-1.5 max-w-[560px] text-[13.5px] leading-relaxed text-mute">{children}</p>
    </motion.div>
  );
}

function Spinner() {
  return <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, ease: "linear", duration: 0.9 }} className="inline-flex"><IconRefresh width={16} height={16} /></motion.span>;
}

function Progression({ step }: { step: number }) {
  return (
    <div className="relative mb-7 px-8">
      <div className="absolute left-12 right-12 top-4 h-0.5 rounded bg-line" />
      <motion.div
        className="absolute left-12 top-4 h-0.5 rounded bg-gradient-to-r from-accent to-accent-2"
        initial={false} animate={{ width: `calc((100% - 6rem) * ${step / (STEPS.length - 1)})` }} transition={springSoft}
      />
      <ol className="relative flex justify-between">
        {STEPS.map((name, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <li key={name} className="flex w-16 flex-col items-center gap-2">
              <motion.span
                initial={false}
                animate={{ scale: active ? 1.18 : 1, backgroundColor: done ? "#7c8cff" : active ? "#1c2233" : "#11151c", borderColor: done || active ? "#7c8cff" : "#232a37" }}
                transition={springBouncy}
                className={`grid h-8 w-8 place-items-center rounded-full border-2 text-[12px] font-semibold ${done ? "text-white" : active ? "text-accent" : "text-mute"}`}
                style={active ? { boxShadow: "0 0 0 5px rgba(124,140,255,0.15)" } : undefined}
              >
                {done ? <IconCheck width={14} height={14} /> : i + 1}
              </motion.span>
              <span className={`text-[11px] font-medium ${active ? "text-ink" : "text-mute"}`}>{name}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Finds, picks or installs one emulator. The PS4 one is optional, so it also offers a skip. */
function EmulatorStep({ platform = "ps5" }: { platform?: Platform }) {
  const app = useApp();
  const ps4 = platform === "ps4";
  const emulatorDir = ps4 ? app.ps4Dir : app.emulatorDir;
  const installs = ps4 ? app.ps4Installs : app.installs;
  const emulatorInstall = ps4 ? app.ps4Install : app.emulatorInstall;
  const defaultInstallDir = ps4 ? app.defaultPs4InstallDir : app.defaultInstallDir;
  const version = ps4 ? app.ps4Version : app.version;
  const { adoptInstall, browseForEmulator, installEmulator, scanInstalls, skipPs4 } = app;
  const name = ps4 ? "the PS4 emulator (Kyty)" : "KytyPS5";
  const [changing, setChanging] = useState(false);
  const [freshInstall, setFreshInstall] = useState(false);
  const [parent, setParent] = useState<string | null>(null);
  const installPath = parent ? `${parent.replace(/[\\/]+$/, "")}\\${ps4 ? "KytyPS4" : "KytyPS5"}` : defaultInstallDir;
  const installing = emulatorInstall.status === "installing";
  const progress = emulatorInstall.progress;
  const pct = progress && progress.total > 0 ? progress.downloaded / progress.total : 0;

  const changeLocation = async () => {
    const picked = await pickFolder(`Choose where to install ${name}`);
    if (picked) setParent(picked);
  };
  const install = async () => {
    if (await installEmulator(installPath, platform)) setChanging(false);
  };

  if (installing) {
    return (
      <>
        <Heading title={`Installing ${name}`}>Downloading the latest build in the background. Nothing will open and your browser isn't involved.</Heading>
        <motion.div variants={itemVariants} className="flex flex-col gap-3 rounded-2xl border border-line bg-black/20 p-5">
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="font-medium">{progress?.stage === "installing" ? "Installing…" : "Downloading…"}</span>
            {progress?.stage === "downloading" && progress.total > 0 && (
              <span className="font-mono text-[12px] text-mute">{formatBytes(progress.downloaded)} / {formatBytes(progress.total)}</span>
            )}
          </div>
          <Progress value={pct} indeterminate={progress?.stage === "installing" || !progress || progress.total === 0} />
          <div className="truncate font-mono text-[11.5px] text-mute">{installPath}</div>
        </motion.div>
      </>
    );
  }

  if (emulatorDir && !changing) {
    return (
      <>
        <Heading title={ps4 ? "The PS4 emulator is ready" : "KytyPS5 is ready"}>
          {ps4 ? "PS4 games in your game folders will launch with this copy of Kyty." : "The launcher will use this copy of the emulator and its settings."}
        </Heading>
        <motion.div variants={itemVariants} className="flex items-center gap-4 rounded-2xl border border-good/30 bg-good/[0.06] p-5">
          <motion.span initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={springBouncy} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-good/20 text-good"><IconCheck width={22} height={22} /></motion.span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-[12.5px]" title={emulatorDir}>{emulatorDir}</div>
            <div className="mt-0.5 text-[12px] text-mute">{version?.semver ? `Version ${version.semver} · ` : ""}{version?.tag ?? "Detected"}</div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button onClick={() => { setChanging(true); void scanInstalls(platform); }}>Change</Button>
            {ps4 && <Button onClick={() => void skipPs4()}>Remove</Button>}
          </div>
        </motion.div>
      </>
    );
  }

  if (installs === null) {
    return (
      <>
        <Heading title={ps4 ? "Looking for the PS4 emulator" : "Looking for KytyPS5"}>Checking the usual places on this PC.</Heading>
        <motion.div variants={itemVariants} className="flex items-center gap-3 text-[13px] text-mute"><Spinner /> Searching…</motion.div>
      </>
    );
  }

  if (installs.length > 0 && !freshInstall) {
    return (
      <>
        <Heading title={ps4 ? "We found the PS4 emulator" : "We found KytyPS5"}>Pick the copy you want to use, or choose a different folder yourself.</Heading>
        <motion.ul variants={itemVariants} className="flex flex-col gap-2.5">
          {installs.map((i) => (
            <motion.li key={i.path}>
              <motion.button
                type="button" whileHover={{ x: 4 }} whileTap={tap} transition={springBouncy}
                onClick={async () => { if (await adoptInstall(i.path, platform)) setChanging(false); }}
                className="flex w-full items-center gap-3.5 rounded-2xl border border-line bg-black/20 p-4 text-left transition-colors hover:border-accent/60 hover:bg-white/[0.04]"
              >
                <IconFolder className="shrink-0 text-accent" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[12.5px]">{i.path}</span>
                  <span className="text-[11.5px] text-mute">Updated {formatDate(i.modified)}</span>
                </span>
                <span className="text-[12px] font-medium text-accent">Use this</span>
              </motion.button>
            </motion.li>
          ))}
        </motion.ul>
        <motion.div variants={itemVariants} className="mt-5 flex flex-wrap gap-2.5">
          <Button onClick={() => void browseForEmulator(platform).then(() => setChanging(false))}><IconFolder width={15} height={15} /> Choose another folder</Button>
          <Button onClick={() => setFreshInstall(true)}><IconDownload width={15} height={15} /> Download a fresh copy</Button>
        </motion.div>
      </>
    );
  }

  return (
    <>
      <Heading title={ps4 ? "PS4 emulator (optional)" : "KytyPS5 wasn't found"}>
        {ps4
          ? "Want to play PS4 games too? Install the original Kyty emulator automatically, or point me to a copy you already have. You can skip this and add it later."
          : "Install it automatically, or point me to a copy you already have. The download runs quietly in the background."}
      </Heading>
      <motion.div variants={itemVariants} className="flex flex-col gap-4 rounded-2xl border border-line bg-black/20 p-5">
        <div className="flex items-center gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-white"><IconDownload width={22} height={22} /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold">Download &amp; install</div>
            <div className="truncate font-mono text-[11.5px] text-mute" title={installPath}>{installPath}</div>
          </div>
          <button type="button" onClick={() => void changeLocation()} className="text-[12px] font-medium text-accent hover:underline">Change</button>
        </div>
        {emulatorInstall.status === "error" && <div className="rounded-xl bg-bad/10 px-3.5 py-2.5 text-[12.5px] text-bad">{emulatorInstall.error}</div>}
        <Button variant="primary" onClick={() => void install()} className="!h-11 !text-[14px]">
          <IconDownload width={16} height={16} /> {emulatorInstall.status === "error" ? "Try again" : ps4 ? "Install the PS4 emulator" : "Install KytyPS5"}
        </Button>
      </motion.div>
      <motion.div variants={itemVariants} className="mt-4 flex flex-wrap items-center gap-3 text-[13px] text-mute">
        Already have it?
        <Button onClick={() => void browseForEmulator(platform).then(() => setChanging(false))}><IconFolder width={15} height={15} /> Choose its folder</Button>
        {installs.length > 0 && <button type="button" onClick={() => setFreshInstall(false)} className="text-accent hover:underline">Back to detected copies</button>}
      </motion.div>
    </>
  );
}

function ProfileStep() {
  const { draft, patchDraft } = useApp();
  if (!draft) return null;
  const bytes = byteLength(draft.user_name);
  const nameInvalid = bytes < 1 || bytes > 16;
  const idInvalid = draft.user_id === 254 || draft.user_id === 255;
  return (
    <>
      <Heading title="Who's playing?">This is the PS5 profile that games see. You can change it any time.</Heading>
      <motion.div variants={itemVariants} className="flex flex-col gap-1">
        <Row label="User name" hint={nameInvalid ? "Use 1 to 16 characters" : "Shown inside games"}>
          <TextField value={draft.user_name} onChange={(v) => patchDraft({ user_name: v })} invalid={nameInvalid} />
        </Row>
        <Row label="User ID" hint={idInvalid ? "254 and 255 are reserved" : "Local user ID exposed to games"}>
          <Stepper value={draft.user_id} min={0} max={2147483647} onChange={(v) => patchDraft({ user_id: v })} />
        </Row>
        <Row label="Console language" hint="Language games start in">
          <Select value={draft.console_language} onChange={(v) => patchDraft({ console_language: v })} options={CONSOLE_LANGUAGES.map((l, i) => ({ value: i, label: l }))} />
        </Row>
      </motion.div>
    </>
  );
}

function GraphicsStep() {
  const { draft, devices, patchDraft } = useApp();
  if (!draft) return null;
  const gpus = [{ value: -1, name: "Automatic", sub: "Let the emulator pick the best GPU" }, ...(devices?.gpus ?? []).map((g, i) => ({ value: i, name: g, sub: `GPU ${i}` }))];
  return (
    <>
      <Heading title="Graphics">Choose the GPU and how games are displayed.</Heading>
      <motion.div variants={itemVariants} role="radiogroup" aria-label="GPU" className="mb-5 grid gap-2 md:grid-cols-2">
        {gpus.map((g) => {
          const active = draft.gpu_index === g.value;
          return (
            <motion.button
              key={g.value} type="button" role="radio" aria-checked={active} whileHover={{ x: 4 }} whileTap={tap} transition={springBouncy}
              onClick={() => patchDraft({ gpu_index: g.value })}
              className={`flex items-center gap-3.5 rounded-2xl border p-3.5 text-left transition-colors ${active ? "border-accent bg-accent/10" : "border-line bg-black/20 hover:border-white/20"}`}
            >
              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${active ? "border-accent" : "border-mute/50"}`}>
                <AnimatePresence>{active && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={springBouncy} className="h-2.5 w-2.5 rounded-full bg-accent" />}</AnimatePresence>
              </span>
              <span className="min-w-0"><span className="block truncate text-[13.5px] font-medium">{g.name}</span><span className="text-[11.5px] text-mute">{g.sub}</span></span>
            </motion.button>
          );
        })}
        {!devices?.gpus.length && <div className="text-[12px] text-mute">No Vulkan GPU was detected. Automatic will be used.</div>}
      </motion.div>
      <motion.div variants={itemVariants} className="flex flex-col gap-4">
        <div>
          <div className="mb-1.5 text-[12px] text-mute">Resolution</div>
          <Segmented value={draft.screen_resolution} onChange={(v) => patchDraft({ screen_resolution: v })} options={RESOLUTIONS.map((r) => ({ value: r, label: r.replace("x", "×") }))} />
        </div>
        <div>
          <div className="mb-1.5 text-[12px] text-mute">Present mode</div>
          <Segmented
            value={draft.present_mode} onChange={(v) => patchDraft({ present_mode: v })}
            options={PRESENT_MODES.map((m) => ({ value: m, label: m, hint: { Fifo: "VSync", Mailbox: "Low latency", Immediate: "Uncapped" }[m] }))}
          />
        </div>
        <Row label="Vblank frequency" hint="Virtual refresh rate"><Stepper value={draft.vblank_frequency} min={30} max={360} onChange={(v) => patchDraft({ vblank_frequency: v })} /></Row>
        <Toggle checked={draft.fullscreen_enabled} onChange={(v) => patchDraft({ fullscreen_enabled: v })} label="Start games fullscreen" />
      </motion.div>
    </>
  );
}

function SystemStep() {
  const { draft, devices, patchDraft } = useApp();
  if (!draft) return null;
  const mics: Option<string>[] = [{ value: "", label: "None" }, ...(devices?.microphones ?? []).map((m) => ({ value: m, label: m }))];
  if (draft.audio_input_device && !mics.some((o) => o.value === draft.audio_input_device)) mics.push({ value: draft.audio_input_device, label: `${draft.audio_input_device} (unavailable)` });
  return (
    <>
      <Heading title="System &amp; controller">Compatibility tweaks, audio input and your DualSense lightbar.</Heading>
      <motion.div variants={itemVariants} className="flex flex-col gap-1">
        <Toggle
          checked={draft.amd_cpu_enabled} onChange={(v) => patchDraft({ amd_cpu_enabled: v })} label="AMD CPU patch (experimental)"
          hint={devices?.amd_cpu ? "AMD processor detected, recommended for your PC" : "Only needed on AMD processors"}
        />
        <Toggle checked={draft.red_zone_protection_enabled} onChange={(v) => patchDraft({ red_zone_protection_enabled: v })} label="Windows SysV red zone crash protection (experimental)" hint="Try this if games crash at startup" />
        <div className="mt-2 border-t border-line/70 pt-2">
          <Row label="Microphone" hint="None supplies silence to games"><Select value={draft.audio_input_device} onChange={(v) => patchDraft({ audio_input_device: v })} options={mics} /></Row>
          <Row label="DualSense lightbar"><Lightbar /></Row>
        </div>
      </motion.div>
    </>
  );
}

function GamesStep() {
  const { draft, games } = useApp();
  if (!draft) return null;
  return (
    <>
      <Heading title="Where are your games?">
        Add the folders that contain your PS5 games. Each game folder holds an <span className="font-mono text-ink/90">eboot.bin</span>; subfolders are searched automatically.
      </Heading>
      <motion.div variants={itemVariants}>
        <GameFolders />
        {games.length > 0 && <p className="mt-3 text-[12px] text-mute">{games.length} game{games.length === 1 ? "" : "s"} found so far.</p>}
      </motion.div>
    </>
  );
}

function FinishStep() {
  const { emulatorDir, draft, original, devices, version, ps4Dir, ps4Version } = useApp();
  const changes = useMemo(() => (original && draft ? diffSettings(original, draft, { devices }).length : 0), [original, draft, devices]);
  if (!draft) return null;
  const gpu = draft.gpu_index < 0 ? "Automatic" : (devices?.gpus[draft.gpu_index] ?? `GPU ${draft.gpu_index}`);
  const rows: [string, string][] = [
    ["Emulator", `${emulatorDir ?? ""}${version?.semver ? `  (v${version.semver})` : ""}`],
    ["PS4 emulator", ps4Dir ? `${ps4Dir}${ps4Version?.semver ? `  (v${ps4Version.semver})` : ""}` : "Not set up (PS4 games won't launch)"],
    ["Profile", `${draft.user_name} · ID ${draft.user_id} · ${CONSOLE_LANGUAGES[draft.console_language]}`],
    ["Graphics", `${gpu} · ${draft.screen_resolution} · ${draft.present_mode}${draft.fullscreen_enabled ? " · fullscreen" : ""}`],
    ["System", `AMD CPU patch ${draft.amd_cpu_enabled ? "on" : "off"} · mic ${draft.audio_input_device || "none"}`],
    ["Game folders", draft.game_dirs.length ? draft.game_dirs.join(", ") : "None yet"],
  ];
  return (
    <>
      <Heading title="All set">Review your choices. Finishing writes them to the emulator's config and opens your library.</Heading>
      <motion.dl variants={itemVariants} className="flex flex-col gap-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-4 rounded-xl border border-line bg-black/20 px-4 py-3">
            <dt className="w-28 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-mute">{k}</dt>
            <dd className="min-w-0 break-words text-[13px]">{v}</dd>
          </div>
        ))}
      </motion.dl>
      <motion.p variants={itemVariants} className="mt-4 text-[12px] text-mute">
        {changes ? `${changes} setting${changes === 1 ? "" : "s"} will be saved.` : "Your config already matches."} You can change anything later in Settings.
      </motion.p>
    </>
  );
}

export function SetupView() {
  const { emulatorDir, draft, finishSetup, saving, emulatorInstall, ps4Install, ps4Dir } = useApp();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);

  const nameBytes = draft ? byteLength(draft.user_name) : 0;
  const profileValid = !!draft && nameBytes >= 1 && nameBytes <= 16 && draft.user_id !== 254 && draft.user_id !== 255;
  const canNext =
    step === 0 ? !!emulatorDir && emulatorInstall.status !== "installing" : step === 1 ? ps4Install.status !== "installing" : step === 2 ? profileValid : true;
  const last = step === STEPS.length - 1;
  // On the optional PS4 step the button says "Skip" until an emulator is chosen or installed.
  const skipsPs4 = step === 1 && !ps4Dir && ps4Install.status !== "installing";

  const go = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };

  const body = [
    <EmulatorStep key="0" />, <EmulatorStep key="ps4" platform="ps4" />, <ProfileStep key="2" />, <GraphicsStep key="3" />,
    <SystemStep key="4" />, <GamesStep key="5" />, <FinishStep key="6" />,
  ][step];

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" className="grid h-full place-items-center px-8 pb-6">
      <div className="flex h-full max-h-[700px] w-full max-w-[900px] flex-col">
        <motion.div variants={itemVariants} className="mb-5 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-lg font-bold text-white">K</span>
          <div>
            <div className="text-[15px] font-semibold">Welcome to Kyty Launcher</div>
            <div className="text-[12px] text-mute">Step {step + 1} of {STEPS.length}</div>
          </div>
        </motion.div>
        <Progression step={step} />
        <div className="card relative min-h-0 flex-1 overflow-hidden">
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div key={step} custom={direction} variants={slide} initial="initial" animate="animate" exit="exit" className="absolute inset-0 overflow-y-auto p-8">
              {body}
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <Button disabled={step === 0 || saving} onClick={() => go(step - 1)}>Back</Button>
          {last ? (
            <Button variant="primary" disabled={saving || !profileValid} onClick={() => void finishSetup()} className="!h-10 !px-8">{saving ? "Saving…" : "Finish setup"}</Button>
          ) : (
            <Button variant="primary" disabled={!canNext} onClick={() => go(step + 1)} className="!h-10 !px-8">{skipsPs4 ? "Skip" : "Continue"}</Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
