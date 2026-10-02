import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { pickFile } from "../lib/api";
import { backdropVariants, itemVariants, modalVariants } from "../lib/motion";
import { useApp } from "../store/app";
import { Button, TextField } from "./ui";
import { IconFolder } from "./icons";

const DEFAULT_ARGS = '"{pkg}" "{out}"';

/** Lets the user point the launcher at their own .pkg converter. Nothing is bundled or downloaded. */
export function ConverterModal() {
  const { converter, openConverter, saveConverter } = useApp();
  const [path, setPath] = useState(converter?.path ?? "");
  const [args, setArgs] = useState(converter?.args || DEFAULT_ARGS);
  const [saving, setSaving] = useState(false);
  const argsOk = args.includes("{pkg}") && args.includes("{out}");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && openConverter(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openConverter, saving]);

  const browse = async () => {
    const picked = await pickFile("Select your .pkg converter program", ["exe", "bat", "cmd"]);
    if (picked) setPath(picked);
  };
  const save = async () => {
    setSaving(true);
    await saveConverter(path, args);
    setSaving(false);
  };

  return (
    <motion.div
      variants={backdropVariants} initial="initial" animate="animate" exit="exit" onClick={() => !saving && openConverter(false)}
      className="fixed inset-0 z-[80] grid place-items-center bg-black/65 p-6 backdrop-blur-sm"
    >
      <motion.div
        role="dialog" aria-modal="true" aria-label=".pkg converter" variants={modalVariants} onClick={(e) => e.stopPropagation()}
        className="card flex max-h-[88vh] w-full max-w-[600px] flex-col !rounded-3xl shadow-2xl shadow-black/70"
      >
        <motion.div variants={itemVariants} className="px-7 pb-2 pt-6">
          <h2 className="text-[20px] font-semibold">.pkg converter</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-mute">
            KytyPS5 can't open .pkg files directly. Choose a converter program that you already have, and the launcher will run it on any
            .pkg you add, then show the result in your library.
          </p>
        </motion.div>

        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-7 py-3">
          <motion.div variants={itemVariants}>
            <div className="mb-1.5 text-[12px] text-mute">Converter program (.exe, .bat or .cmd)</div>
            <div className="flex gap-2">
              <div className="min-w-0 flex-1"><TextField value={path} onChange={setPath} placeholder="C:\Tools\converter.exe" /></div>
              <Button onClick={() => void browse()}><IconFolder width={15} height={15} /> Browse</Button>
            </div>
          </motion.div>

          <motion.div variants={itemVariants}>
            <div className="mb-1.5 text-[12px] text-mute">Arguments</div>
            <TextField value={args} onChange={setArgs} invalid={!argsOk} />
            <p className={`mt-1.5 text-[11.5px] leading-relaxed ${argsOk ? "text-mute" : "text-bad"}`}>
              Use <span className="font-mono">{"{pkg}"}</span> for the .pkg file and <span className="font-mono">{"{out}"}</span> for the output folder, which
              is created inside your first game folder{converter?.out_root ? ` (${converter.out_root})` : ""}.
            </p>
          </motion.div>

          <motion.p variants={itemVariants} className="rounded-xl border border-line bg-black/20 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-mute">
            The launcher includes no unpacking or decryption tools and only runs the program you choose. Use tools and files you are
            legally allowed to use.
          </motion.p>
        </div>

        <motion.div variants={itemVariants} className="flex justify-end gap-2.5 border-t border-line px-7 py-4">
          <Button disabled={saving} onClick={() => openConverter(false)}>Cancel</Button>
          <Button variant="primary" disabled={saving || !argsOk} onClick={() => void save()}>{saving ? "Saving…" : "Save"}</Button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
