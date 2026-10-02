import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { formatBytes } from "../lib/fields";
import { itemVariants, pageVariants, springBouncy } from "../lib/motion";
import { useApp } from "../store/app";
import { Button, Progress, Section, TextField, Toggle } from "../components/ui";
import { IconCheck, IconDownload, IconRefresh } from "../components/icons";

function StatusCard() {
  const { update, installUpdate, checkUpdate, running } = useApp();
  const { status, info, progress, error } = update;
  const pct = progress && progress.total > 0 ? progress.downloaded / progress.total : 0;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={status}
        initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.98 }}
        transition={{ opacity: { duration: 0.18 }, y: springBouncy, scale: springBouncy }}
      >
        {status === "idle" && <p className="text-[13px] text-mute">Not checked yet.</p>}

        {status === "checking" && (
          <div className="flex items-center gap-3 text-[13px] text-mute">
            <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, ease: "linear", duration: 0.9 }} className="inline-flex"><IconRefresh width={16} height={16} /></motion.span>
            Checking GitHub for the latest build…
          </div>
        )}

        {status === "uptodate" && (
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-good/15 text-good"><IconCheck width={18} height={18} /></span>
            <div>
              <div className="text-[14px] font-medium">You're up to date</div>
              <div className="font-mono text-[11.5px] text-mute">{info?.latest_tag}</div>
            </div>
          </div>
        )}

        {status === "available" && info && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[15px] font-semibold text-accent">New build available</div>
                <div className="font-mono text-[11.5px] text-mute">{info.current_tag ?? "unknown"} → {info.latest_tag}</div>
                {info.asset_name && <div className="mt-0.5 text-[11.5px] text-mute">{info.asset_name} · {formatBytes(info.asset_size)}</div>}
              </div>
              <Button variant="primary" disabled={!!running} onClick={() => void installUpdate()}><IconDownload width={15} height={15} /> Install update</Button>
            </div>
            {running && <p className="text-[12px] text-warn">Close the running game before updating.</p>}
            {info.notes && (
              <div className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-xl border border-line bg-black/25 p-3.5 text-[12px] leading-relaxed text-ink/80">{info.notes}</div>
            )}
          </div>
        )}

        {status === "installing" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between text-[13px]">
              <span className="font-medium">{progress?.stage === "installing" ? "Installing…" : "Downloading update…"}</span>
              {progress?.stage === "downloading" && progress.total > 0 && (
                <span className="font-mono text-[12px] text-mute">{formatBytes(progress.downloaded)} / {formatBytes(progress.total)}</span>
              )}
            </div>
            <Progress value={pct} indeterminate={progress?.stage === "installing" || progress?.total === 0} />
            <p className="text-[11.5px] text-mute">Your saves and settings are left untouched. This runs in the background.</p>
          </div>
        )}

        {status === "done" && (
          <div className="flex items-center gap-3">
            <motion.span initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={springBouncy} className="grid h-9 w-9 place-items-center rounded-full bg-good/15 text-good"><IconCheck width={18} height={18} /></motion.span>
            <div className="text-[14px] font-medium">Update installed</div>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-start gap-3">
            <div className="text-[13px] text-bad">{error}</div>
            <Button onClick={() => void checkUpdate(true)}>Try again</Button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

export function UpdatesView() {
  const { version, repo, autoCheck, savePrefs, checkUpdate, update } = useApp();
  const [repoText, setRepoText] = useState(repo);
  useEffect(() => setRepoText(repo), [repo]);
  const busy = update.status === "checking" || update.status === "installing";

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" className="flex h-full flex-col overflow-y-auto px-8 pb-8">
      <motion.header variants={itemVariants} className="pb-5 pt-2">
        <h1 className="text-[28px] font-semibold tracking-tight">Updates</h1>
        <p className="text-[13px] text-mute">Keeps your KytyPS5 build current, straight from GitHub releases.</p>
      </motion.header>

      <div className="grid max-w-[860px] gap-4">
        <Section title="Installed build">
          <div className="flex flex-wrap items-center justify-between gap-4 px-2 py-1">
            <div>
              <div className="text-[18px] font-semibold">KytyPS5 {version?.semver ?? ""}</div>
              <div className="font-mono text-[12px] text-mute">{version?.tag ?? version?.line ?? "Version could not be read"}</div>
            </div>
            <Button disabled={busy} onClick={() => void checkUpdate(true)}><IconRefresh width={15} height={15} /> Check for updates</Button>
          </div>
        </Section>

        <Section title="Latest release">
          <div className="px-2 py-1"><StatusCard /></div>
        </Section>

        <Section title="Source">
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 text-[12px] text-mute">GitHub repository</div>
              <TextField value={repoText} onChange={setRepoText} placeholder="owner/name" disabled={busy} />
            </div>
            <Button className="mt-5" disabled={busy || repoText.trim() === repo} onClick={() => void savePrefs(repoText, autoCheck)}>Apply</Button>
          </div>
          <Toggle checked={autoCheck} onChange={(v) => void savePrefs(repo, v)} label="Check for updates on startup" />
        </Section>
      </div>
    </motion.div>
  );
}
