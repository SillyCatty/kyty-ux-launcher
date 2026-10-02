import { useId, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { spring, springBouncy, tap } from "../lib/motion";
import { useApp } from "../store/app";
import { Button } from "./ui";
import { IconFolder, IconPlus, IconTrash } from "./icons";

export function Lightbar() {
  const { draft, patchDraft } = useApp();
  const input = useRef<HTMLInputElement>(null);
  if (!draft) return null;
  return (
    <div className="flex gap-2">
      <motion.button
        type="button" whileTap={tap} whileHover={{ scale: 1.04 }} transition={springBouncy}
        onClick={() => input.current?.click()}
        className="field relative flex h-9 flex-1 items-center justify-center gap-2 px-3 text-[13px]"
      >
        <AnimatePresence initial={false}>
          {draft.controller_color && (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={springBouncy} className="h-3.5 w-3.5 rounded-full border border-white/20" style={{ background: draft.controller_color }} />
          )}
        </AnimatePresence>
        {draft.controller_color ? draft.controller_color.toUpperCase() : "Custom"}
        <input ref={input} type="color" value={draft.controller_color || "#0070d1"} onChange={(e) => patchDraft({ controller_color: e.target.value.toLowerCase() })} className="pointer-events-none absolute inset-0 opacity-0" tabIndex={-1} />
      </motion.button>
      <Button onClick={() => patchDraft({ controller_color: "" })} className="flex-1">Default</Button>
    </div>
  );
}

export function GameFolders() {
  const { draft, addGameFolder, removeGameFolder } = useApp();
  if (!draft) return null;
  return (
    <>
      <ul className="flex flex-col gap-2">
        <AnimatePresence initial={false} mode="popLayout">
          {draft.game_dirs.map((dir) => (
            <motion.li
              key={dir} layout initial={{ opacity: 0, x: -20, scale: 0.97 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 30, scale: 0.95 }}
              transition={{ opacity: { duration: 0.18 }, x: spring, scale: springBouncy, layout: spring }}
              className="flex items-center gap-3 rounded-xl border border-line bg-black/20 px-3.5 py-2.5"
            >
              <IconFolder className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]" title={dir}>{dir}</span>
              <motion.button whileTap={tap} whileHover={{ scale: 1.15 }} onClick={() => removeGameFolder(dir)} aria-label={`Remove ${dir}`} className="grid h-8 w-8 place-items-center rounded-lg text-mute hover:bg-bad/15 hover:text-bad">
                <IconTrash width={16} height={16} />
              </motion.button>
            </motion.li>
          ))}
        </AnimatePresence>
        {draft.game_dirs.length === 0 && <li className="px-1 py-2 text-[13px] text-mute">No game folders yet.</li>}
      </ul>
      <div className="mt-2"><Button onClick={() => void addGameFolder()}><IconPlus width={15} height={15} /> Add folder</Button></div>
    </>
  );
}

/** Pill selector whose highlight glides between options. */
export function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string; hint?: string }[]; onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <div role="radiogroup" className="flex gap-1 rounded-xl border border-line bg-[#0d1118] p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <motion.button
            key={o.value} type="button" role="radio" aria-checked={active} onClick={() => onChange(o.value)} whileTap={tap}
            className={`relative flex-1 rounded-lg px-3 py-2 text-center text-[13px] font-medium transition-colors ${active ? "text-white" : "text-mute hover:text-ink"}`}
          >
            {active && <motion.span layoutId={id} transition={springBouncy} className="absolute inset-0 rounded-lg border border-white/10 bg-gradient-to-br from-accent/40 to-accent-2/20" />}
            <span className="relative block">{o.label}</span>
            {o.hint && <span className="relative block text-[10.5px] font-normal opacity-70">{o.hint}</span>}
          </motion.button>
        );
      })}
    </div>
  );
}
