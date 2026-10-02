import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "../lib/api";
import { diffSettings } from "../lib/fields";
import { spring, springBouncy, tap, toastVariants } from "../lib/motion";
import { useApp, type View } from "../store/app";
import { IconCheck, IconClose, IconDownload, IconLibrary, IconMax, IconMin, IconSettings, IconStop } from "./icons";

export function TitleBar() {
  const win = useMemo(() => (isTauri ? getCurrentWindow() : null), []);
  const btn = "grid h-8 w-11 place-items-center text-mute transition-colors hover:text-ink";
  return (
    <div data-tauri-drag-region className="relative z-30 flex h-10 shrink-0 items-center justify-between pl-4">
      <div data-tauri-drag-region className="pointer-events-none flex items-center gap-2 text-[12px] font-medium tracking-wide text-mute">
        <span className="h-2 w-2 rounded-full bg-gradient-to-br from-accent to-accent-2" />
        KYTY LAUNCHER
      </div>
      <div className="flex">
        <motion.button whileTap={tap} className={`${btn} hover:bg-white/10`} onClick={() => win?.minimize()} aria-label="Minimize"><IconMin width={14} height={14} /></motion.button>
        <motion.button whileTap={tap} className={`${btn} hover:bg-white/10`} onClick={() => win?.toggleMaximize()} aria-label="Maximize"><IconMax width={13} height={13} /></motion.button>
        <motion.button whileTap={tap} className={`${btn} hover:!bg-bad/80 hover:!text-white`} onClick={() => win?.close()} aria-label="Close"><IconClose width={14} height={14} /></motion.button>
      </div>
    </div>
  );
}

const NAV: { view: View; label: string; icon: typeof IconLibrary }[] = [
  { view: "library", label: "Library", icon: IconLibrary },
  { view: "settings", label: "Settings", icon: IconSettings },
  { view: "updates", label: "Updates", icon: IconDownload },
];

export function Sidebar() {
  const { view, setView, running, stop, update, original, draft, devices, version, selectGame, games } = useApp();
  const dirty = useMemo(() => (original && draft ? diffSettings(original, draft, { devices }).length : 0), [original, draft, devices]);
  const badge = (v: View) => (v === "settings" && dirty > 0 ? dirty : v === "updates" && update.status === "available" ? "new" : null);
  const runningGame = games.find((g) => g.id === running?.game_id);

  return (
    <motion.aside
      initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ opacity: { duration: 0.3 }, x: springBouncy }}
      className="relative z-20 flex w-[220px] shrink-0 flex-col px-3 pb-3"
    >
      <nav className="flex flex-col gap-1">
        {NAV.map(({ view: v, label, icon: Icon }) => {
          const active = view === v;
          const b = badge(v);
          return (
            <motion.button
              key={v} onClick={() => setView(v)} whileTap={tap} whileHover={{ x: 3 }} transition={springBouncy}
              className={`relative flex h-11 items-center gap-3 rounded-xl px-3.5 text-[13.5px] font-medium transition-colors ${active ? "text-white" : "text-mute hover:text-ink"}`}
            >
              {active && (
                <motion.span layoutId="nav-pill" transition={springBouncy} className="absolute inset-0 rounded-xl border border-white/10 bg-gradient-to-r from-accent/25 to-accent-2/10" />
              )}
              <Icon className="relative" />
              <span className="relative">{label}</span>
              <AnimatePresence>
                {b !== null && (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={springBouncy}
                    className="relative ml-auto rounded-full bg-accent px-2 py-0.5 text-[10.5px] font-semibold text-white"
                  >
                    {b}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        <AnimatePresence>
          {running && (
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.92 }}
              transition={{ opacity: { duration: 0.2 }, y: springBouncy, scale: springBouncy }}
              className="card overflow-hidden p-3"
            >
              <button
                className="block w-full text-left"
                onClick={() => { setView("library"); selectGame(running.game_id); }}
              >
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-good">
                  <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1.6 }} className="h-2 w-2 rounded-full bg-good" />
                  Running
                </div>
                <div className="mt-1 truncate text-[13px] font-medium">{runningGame?.name ?? running.name}</div>
              </button>
              <motion.button whileTap={tap} whileHover={{ scale: 1.03 }} onClick={stop} className="mt-2.5 flex h-8 w-full items-center justify-center gap-2 rounded-lg bg-bad/15 text-[12.5px] font-medium text-bad hover:bg-bad/25">
                <IconStop width={12} height={12} /> Stop
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="px-2 text-[11px] leading-relaxed text-mute">
          <div className="font-medium text-ink/80">KytyPS5 {version?.semver ?? ""}</div>
          <div className="truncate font-mono">{version?.tag?.replace("KytyPS5-", "") ?? "version unknown"}</div>
        </div>
      </div>
    </motion.aside>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useApp();
  const color = { info: "text-accent-2", success: "text-good", error: "text-bad" } as const;
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[340px] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id} layout variants={toastVariants} initial="initial" animate="animate" exit="exit"
            transition={spring}
            onClick={() => dismissToast(t.id)}
            className="card pointer-events-auto flex cursor-pointer items-start gap-3 !rounded-2xl border-white/10 bg-panel-2 p-3.5 shadow-2xl shadow-black/50"
          >
            <span className={`mt-0.5 ${color[t.kind]}`}>{t.kind === "error" ? <IconClose width={16} height={16} /> : <IconCheck width={16} height={16} />}</span>
            <span className="text-[13px] leading-snug">{t.text}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function Ambient() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: mounted ? 1 : 0 }} transition={{ duration: 1.2 }}>
        <div className="ambient-a absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-accent/20 blur-[120px]" />
        <div className="ambient-b absolute -bottom-52 right-0 h-[560px] w-[560px] rounded-full bg-accent-2/10 blur-[130px]" />
      </motion.div>
    </div>
  );
}
