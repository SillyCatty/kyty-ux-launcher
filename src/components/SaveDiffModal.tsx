import { useEffect, useMemo } from "react";
import { motion } from "motion/react";
import { diffPs4, diffSettings } from "../lib/fields";
import { backdropVariants, itemVariants, modalVariants } from "../lib/motion";
import { useApp } from "../store/app";
import { Button } from "./ui";
import { IconArrow } from "./icons";

/** Lists ONLY the settings that differ from the saved config, then asks to apply or revert. */
export function SaveDiffModal() {
  const { original, draft, devices, ps4Original, ps4Draft, settingsPlatform, closeDiff, cancelChanges, saveChanges, saving } = useApp();
  const ps4 = settingsPlatform === "ps4";
  const rows = useMemo(
    () => (ps4 ? (ps4Original && ps4Draft ? diffPs4(ps4Original, ps4Draft) : []) : original && draft ? diffSettings(original, draft, { devices }) : []),
    [ps4, original, draft, ps4Original, ps4Draft, devices],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && closeDiff();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeDiff, saving]);

  return (
    <motion.div
      variants={backdropVariants} initial="initial" animate="animate" exit="exit" onClick={() => !saving && closeDiff()}
      className="fixed inset-0 z-[80] grid place-items-center bg-black/65 p-6 backdrop-blur-sm"
    >
      <motion.div
        role="dialog" aria-modal="true" aria-label="Review changes"
        variants={modalVariants} onClick={(e) => e.stopPropagation()}
        className="card flex max-h-[85vh] w-full max-w-[640px] flex-col !rounded-3xl shadow-2xl shadow-black/70"
      >
        <motion.div variants={itemVariants} className="px-7 pb-3 pt-6">
          <h2 className="text-[20px] font-semibold">Review changes</h2>
          <p className="mt-1 text-[13px] text-mute">
            {rows.length} setting{rows.length === 1 ? "" : "s"} will be {ps4 ? "saved for the PS4 emulator" : "written to the emulator's config"}.
          </p>
        </motion.div>

        <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-2">
          <ul className="flex flex-col gap-2">
            {rows.map((r) => (
              <motion.li key={r.key} variants={itemVariants} className="rounded-xl border border-line bg-black/20 px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-medium">{r.label}</span>
                  <span className="text-[10.5px] uppercase tracking-wider text-mute">{r.group}</span>
                </div>
                {r.key === "game_dirs" ? (
                  <div className="mt-1.5 flex flex-col gap-1 font-mono text-[12px]">
                    {r.removed?.map((d) => <div key={`-${d}`} className="truncate text-bad">− {d}</div>)}
                    {r.added?.map((d) => <div key={`+${d}`} className="truncate text-good">+ {d}</div>)}
                  </div>
                ) : (
                  <div className="mt-1.5 flex items-center gap-2.5 text-[13px]">
                    <span className="min-w-0 truncate rounded-md bg-bad/10 px-2 py-0.5 text-bad line-through decoration-bad/50">{r.before}</span>
                    <IconArrow width={14} height={14} className="shrink-0 text-mute" />
                    <span className="min-w-0 truncate rounded-md bg-good/10 px-2 py-0.5 text-good">{r.after}</span>
                  </div>
                )}
              </motion.li>
            ))}
          </ul>
        </div>

        <motion.div variants={itemVariants} className="flex justify-end gap-2.5 border-t border-line px-7 py-4">
          <Button variant="danger" disabled={saving} onClick={cancelChanges}>Cancel Changes</Button>
          <Button variant="primary" disabled={saving || rows.length === 0} onClick={() => void saveChanges()}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
