import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { api, errorText, imageSrc, type Game, type GameModules } from "../lib/api";
import { formatDate, formatPlayTime } from "../lib/fields";
import { backdropVariants, gridVariants, hoverLift, itemVariants, modalVariants, pageVariants, smooth, springBouncy, springSnappy, tap } from "../lib/motion";
import { useApp } from "../store/app";
import { Button, Select } from "../components/ui";
import { Segmented } from "../components/Shared";
import { IconFolder, IconGamepad, IconPackage, IconPlay, IconPlus, IconRefresh, IconSearch, IconStop, IconTrash, IconClose, IconSettings } from "../components/icons";

type Sort = "name" | "recent" | "playtime";

const hue = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

function Cover({ game, className = "" }: { game: Game; className?: string }) {
  const src = imageSrc(game.icon);
  const h = hue(game.name);
  return src ? (
    <img src={src} alt="" draggable={false} className={`h-full w-full object-cover ${className}`} />
  ) : (
    <div className="grid h-full w-full place-items-center text-4xl font-bold text-white/90" style={{ background: `linear-gradient(135deg, hsl(${h} 70% 45%), hsl(${(h + 60) % 360} 70% 30%))` }}>
      {game.name.slice(0, 1).toUpperCase()}
    </div>
  );
}

/** Small PS4/PS5 tag, shown once both platforms are in use. */
function PlatformChip({ platform, className = "" }: { platform: Game["platform"]; className?: string }) {
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide backdrop-blur ${platform === "ps4" ? "bg-accent-2/25 text-accent-2" : "bg-accent/30 text-white"} ${className}`}>
      {platform === "ps4" ? "PS4" : "PS5"}
    </span>
  );
}

function GameCard({ game, showPlatform }: { game: Game; showPlatform: boolean }) {
  const { selectGame, launch, running, ps4Dir } = useApp();
  const isRunning = running?.game_id === game.id;
  const needsPs4 = game.platform === "ps4" && !ps4Dir;
  return (
    <motion.article
      variants={itemVariants} whileHover={hoverLift} whileTap={{ scale: 0.98 }} transition={springBouncy}
      onClick={() => selectGame(game.id)}
      className="group relative cursor-pointer"
    >
      <motion.div layoutId={`cover-${game.id}`} transition={smooth} className="relative aspect-square overflow-hidden rounded-2xl border border-line bg-panel-2 shadow-lg shadow-black/40">
        <Cover game={game} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        {isRunning && (
          <span className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[10.5px] font-semibold text-good backdrop-blur">
            <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1.6 }} className="h-1.5 w-1.5 rounded-full bg-good" />
            RUNNING
          </span>
        )}
        {game.custom_settings && (
          <span className="absolute right-2.5 top-2.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-accent-2 backdrop-blur" title="Uses custom settings">
            <IconSettings width={13} height={13} />
          </span>
        )}
        {showPlatform && <PlatformChip platform={game.platform} className="absolute bottom-2.5 left-2.5" />}
        <button
          aria-label={`Play ${game.name}`} disabled={!!running || needsPs4}
          onClick={(e) => { e.stopPropagation(); void launch(game.id); }}
          className="btn-primary absolute bottom-3 right-3 grid h-11 w-11 translate-y-3 scale-75 place-items-center rounded-full opacity-0 transition-all duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 hover:!scale-110 active:!scale-95 disabled:hidden"
        >
          <IconPlay width={18} height={18} className="translate-x-px" />
        </button>
      </motion.div>
      <div className="px-1 pt-2.5">
        <div className="truncate text-[13.5px] font-medium">{game.name}</div>
        <div className="truncate text-[11.5px] text-mute">{[game.title_id, game.version && `v${game.version}`].filter(Boolean).join(" · ") || "PS5 game"}</div>
      </div>
    </motion.article>
  );
}

function Spinner({ spinning }: { spinning: boolean }) {
  return (
    <motion.span animate={{ rotate: spinning ? 360 : 0 }} transition={spinning ? { repeat: Infinity, ease: "linear", duration: 0.9 } : springBouncy} className="inline-flex">
      <IconRefresh width={16} height={16} />
    </motion.span>
  );
}

/** Which modules of a PS4 game the emulator loads. Most games only need eboot.bin. */
function ModulesPicker({ game }: { game: Game }) {
  const { toast } = useApp();
  const [modules, setModules] = useState<GameModules | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    api.getGameModules(game.id).then((m) => alive && setModules(m)).catch(() => alive && setModules({ available: [], selected: [] }));
    return () => { alive = false; };
  }, [game.id]);

  if (!modules) return null;
  const toggle = async (module: string) => {
    const selected = modules.selected.includes(module) ? modules.selected.filter((m) => m !== module) : [...modules.selected, module];
    const previous = modules;
    setModules({ ...modules, selected });
    try {
      await api.setGameModules(game.id, selected);
    } catch (e) {
      setModules(previous);
      toast("error", errorText(e));
    }
  };

  return (
    <motion.div variants={itemVariants} className="rounded-xl border border-line bg-black/20">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between px-3.5 py-2.5 text-left">
        <span>
          <span className="block text-[10.5px] font-semibold uppercase tracking-wider text-mute">Modules to load</span>
          <span className="text-[13px]">{modules.selected.length || "None"} of {modules.available.length} selected</span>
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={springBouncy} className="text-mute">
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ opacity: { duration: 0.15 }, height: springBouncy }} className="overflow-hidden"
          >
            <p className="px-3.5 pb-2 text-[11.5px] leading-relaxed text-mute">
              Most games only need <span className="font-mono">eboot.bin</span>. Add game-specific modules only if a game needs them; Kyty emulates the system libraries itself.
            </p>
            <ul className="no-scrollbar max-h-44 overflow-y-auto px-2 pb-2">
              {modules.available.map((m) => (
                <li key={m}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[12.5px] hover:bg-white/[0.05]">
                    <input type="checkbox" checked={modules.selected.includes(m)} onChange={() => void toggle(m)} className="h-3.5 w-3.5 accent-[#7c8cff]" />
                    <span className="truncate font-mono">{m}</span>
                  </label>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function GameDetail({ game }: { game: Game }) {
  const { selectGame, launch, stop, running, logs, setView, ps4Dir, setSettingsPlatform } = useApp();
  const isRunning = running?.game_id === game.id;
  const busyElsewhere = !!running && !isRunning;
  const needsPs4 = game.platform === "ps4" && !ps4Dir;
  const logRef = useRef<HTMLDivElement>(null);
  const close = () => selectGame(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && selectGame(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectGame]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const bg = imageSrc(game.background);
  const facts: [string, string][] = [
    ["Title ID", game.title_id || "—"],
    ["Version", game.version || "—"],
    ["Firmware", game.firmware || "—"],
    ["Play time", formatPlayTime(game.play_seconds)],
    ["Last played", formatDate(game.last_played)],
    ["Settings", game.custom_settings ? "Custom (this game)" : "Global"],
  ];

  return (
    <motion.div variants={backdropVariants} initial="initial" animate="animate" exit="exit" onClick={close}
      className="absolute inset-0 z-40 grid place-items-center bg-black/60 p-6 backdrop-blur-sm">
      <motion.div variants={modalVariants} onClick={(e) => e.stopPropagation()} className="card relative flex max-h-full w-full max-w-[860px] flex-col !rounded-3xl shadow-2xl shadow-black/60">
        <div className="relative h-52 shrink-0 overflow-hidden rounded-t-3xl">
          {bg && <motion.img initial={{ scale: 1.15, opacity: 0 }} animate={{ scale: 1, opacity: 0.55 }} transition={{ duration: 0.8 }} src={bg} alt="" className="absolute inset-0 h-full w-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-panel/40 to-panel" />
          <motion.button whileTap={tap} whileHover={{ rotate: 90 }} transition={springBouncy} onClick={close} aria-label="Close" className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white/80 backdrop-blur hover:text-white">
            <IconClose width={16} height={16} />
          </motion.button>
        </div>

        {/* The header is outside every clipping/scrolling container so the icon can never be cut off while it animates. */}
        <div className="relative z-10 -mt-24 shrink-0 px-8">
          <motion.div variants={itemVariants} className="flex items-end gap-6">
            <motion.div layoutId={`cover-${game.id}`} transition={smooth} className="h-36 w-36 shrink-0 overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-black/60">
              <Cover game={game} />
            </motion.div>
            <div className="min-w-0 flex-1 pb-1">
              <h2 className="flex items-center gap-3 text-[26px] font-semibold leading-tight">
                <span className="truncate">{game.name}</span>
                <PlatformChip platform={game.platform} className="shrink-0 !text-[11px]" />
              </h2>
              <div className="mt-1 truncate font-mono text-[11.5px] text-mute" title={game.path}>{game.path}</div>
            </div>
          </motion.div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-8 pb-8 pt-5">
          <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-3">
            {isRunning ? (
              <Button variant="danger" onClick={stop} className="!h-11 !px-7"><IconStop width={14} height={14} /> Stop game</Button>
            ) : (
              <Button variant="primary" disabled={busyElsewhere || needsPs4} onClick={() => void launch(game.id)} className="!h-11 !px-8 !text-[14px]">
                <IconPlay width={16} height={16} /> Play
              </Button>
            )}
            {busyElsewhere && <span className="text-[12px] text-mute">Another game is running.</span>}
            {needsPs4 && <span className="text-[12px] text-warn">Set up the PS4 emulator first (Settings, then Run setup again).</span>}
            <Button onClick={() => { setSettingsPlatform(game.platform); selectGame(null); setView("settings"); }}><IconSettings width={15} height={15} /> Emulator settings</Button>
          </motion.div>

          <motion.dl variants={itemVariants} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {facts.map(([k, v]) => (
              <div key={k} className="rounded-xl border border-line bg-black/20 px-3.5 py-2.5">
                <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-mute">{k}</dt>
                <dd className="mt-0.5 truncate text-[13px]">{v}</dd>
              </div>
            ))}
          </motion.dl>

          {game.platform === "ps4" && <ModulesPicker game={game} />}

          <AnimatePresence>
            {isRunning && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: 10 }} animate={{ opacity: 1, height: "auto", y: 0 }} exit={{ opacity: 0, height: 0 }}
                transition={{ opacity: { duration: 0.2 }, height: springBouncy, y: springBouncy }}
              >
                <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-mute">Emulator output</div>
                <div ref={logRef} className="h-44 overflow-y-auto rounded-xl border border-line bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-ink/80">
                  {logs.length ? logs.map((l, i) => <div key={i} className="whitespace-pre-wrap break-all">{l}</div>) : <span className="text-mute">Waiting for output…</span>}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}

function FolderMenu() {
  const { original, openFolder, changeGameFolder, removeSavedGameFolder, convert, addPkg, cancelConvert, openConverter } = useApp();
  const dirs = original?.game_dirs ?? [];
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={root} className="absolute bottom-6 right-8 z-30">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ opacity: { duration: 0.14 }, y: springSnappy, scale: springBouncy }}
            style={{ transformOrigin: "bottom right" }}
            className="card absolute bottom-full right-0 mb-3 w-[500px] !rounded-2xl p-3 shadow-2xl shadow-black/60"
          >
            <div className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-mute">Game folders</div>
            <ul className="no-scrollbar flex max-h-60 flex-col gap-1.5 overflow-y-auto">
              {dirs.map((d) => (
                <li key={d} className="flex items-center gap-2 rounded-xl border border-line bg-black/20 px-3 py-2">
                  <IconFolder width={16} height={16} className="shrink-0 text-accent" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px]" title={d}>{d}</span>
                  <button type="button" onClick={() => void openFolder(d)} className="rounded-lg px-2 py-1 text-[12px] font-medium text-accent hover:bg-accent/15">Open</button>
                  <button type="button" onClick={() => void changeGameFolder(d)} className="rounded-lg px-2 py-1 text-[12px] font-medium text-mute hover:bg-white/10 hover:text-ink">Change</button>
                  <button
                    type="button" onClick={() => void removeSavedGameFolder(d)} aria-label={`Remove ${d}`} title="Remove from library (nothing is deleted from disk)"
                    className="grid h-7 w-7 place-items-center rounded-lg text-mute hover:bg-bad/15 hover:text-bad"
                  >
                    <IconTrash width={15} height={15} />
                  </button>
                </li>
              ))}
              {dirs.length === 0 && <li className="px-2 py-2 text-[13px] text-mute">No game folders yet.</li>}
            </ul>
            {convert.status === "running" && (
              <div className="mt-2.5 rounded-xl border border-accent/30 bg-accent/10 p-3">
                <div className="flex items-center gap-2 text-[12.5px] font-medium">
                  <Spinner spinning /> <span className="truncate">Converting {convert.name}…</span>
                </div>
                <div className="mt-1 truncate font-mono text-[11px] text-mute" title={convert.line}>{convert.line}</div>
                <button type="button" onClick={() => void cancelConvert()} className="mt-2 text-[12px] font-medium text-bad hover:underline">Cancel</button>
              </div>
            )}
            <div className="mt-2.5 grid grid-cols-[1fr_1fr_auto] gap-2">
              <Button onClick={() => void changeGameFolder(null)}><IconPlus width={15} height={15} /> Add folder</Button>
              <Button onClick={() => void addPkg()} disabled={convert.status === "running"}><IconPackage width={15} height={15} /> Add .pkg file</Button>
              <motion.button
                type="button" whileTap={tap} whileHover={{ scale: 1.08 }} transition={springBouncy}
                onClick={() => openConverter(true)} aria-label=".pkg converter settings" title=".pkg converter settings"
                className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-white/[0.03] text-mute hover:bg-white/[0.08] hover:text-ink"
              >
                <IconSettings width={15} height={15} />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.button
        type="button" onClick={() => setOpen(!open)} whileHover={{ scale: 1.08 }} whileTap={tap} transition={springBouncy}
        aria-label="Game folders" aria-expanded={open} title="Game folders"
        className={`grid h-12 w-12 place-items-center rounded-2xl border shadow-xl shadow-black/50 transition-colors ${open ? "border-accent/60 bg-accent/15 text-accent" : "border-line bg-panel-2 text-ink hover:border-accent/60"}`}
      >
        <IconFolder width={20} height={20} />
      </motion.button>
    </div>
  );
}

export function LibraryView() {
  const { games, gamesLoading, refreshGames, selectedGameId, setView, platformFilter, setPlatformFilter, ps4Dir } = useApp();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  // Platform tags and the filter only appear once PS4 is actually in play.
  const hasPs4 = !!ps4Dir || games.some((g) => g.platform === "ps4");
  const filter = hasPs4 ? platformFilter : "all";

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = games.filter(
      (g) => (filter === "all" || g.platform === filter) && (!q || g.name.toLowerCase().includes(q) || g.title_id.toLowerCase().includes(q)),
    );
    const by: Record<Sort, (a: Game, b: Game) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      recent: (a, b) => (b.last_played ?? 0) - (a.last_played ?? 0),
      playtime: (a, b) => b.play_seconds - a.play_seconds,
    };
    return [...list].sort(by[sort]);
  }, [games, query, sort, filter]);

  const selected = games.find((g) => g.id === selectedGameId) ?? null;

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" className="relative flex h-full flex-col">
      <motion.header variants={itemVariants} className="flex flex-wrap items-end justify-between gap-4 px-8 pb-5 pt-2">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">Library</h1>
          <p className="text-[13px] text-mute">{games.length} game{games.length === 1 ? "" : "s"} found in your game folders</p>
        </div>
        <div className="flex items-center gap-2.5">
          {hasPs4 && (
            <div className="w-56">
              <Segmented<"all" | "ps5" | "ps4">
                value={filter} onChange={setPlatformFilter}
                options={[{ value: "all", label: "All" }, { value: "ps5", label: "PS5" }, { value: "ps4", label: "PS4" }]}
              />
            </div>
          )}
          <label className="field flex h-9 w-60 items-center gap-2 px-3 text-mute focus-within:!border-accent">
            <IconSearch width={15} height={15} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search games" className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-mute" />
          </label>
          <div className="w-40">
            <Select<Sort> value={sort} onChange={setSort} options={[{ value: "name", label: "Name" }, { value: "recent", label: "Recently played" }, { value: "playtime", label: "Most played" }]} />
          </div>
          <Button onClick={() => void refreshGames()} disabled={gamesLoading} className="!px-3" ><Spinner spinning={gamesLoading} /></Button>
        </div>
      </motion.header>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-24">
        {shown.length > 0 ? (
          <motion.div variants={gridVariants} initial="initial" animate="animate" key={`${query}-${sort}-${filter}`} className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-x-5 gap-y-7 pt-2">
            {shown.map((g) => <GameCard key={g.id} game={g} showPlatform={hasPs4} />)}
          </motion.div>
        ) : (
          <motion.div variants={itemVariants} className="mx-auto mt-16 flex max-w-sm flex-col items-center gap-4 text-center">
            <motion.div animate={{ y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }} className="grid h-20 w-20 place-items-center rounded-3xl border border-line bg-panel-2 text-accent">
              <IconGamepad width={36} height={36} />
            </motion.div>
            <div className="text-[17px] font-semibold">{games.length ? "No games match your search" : "No games yet"}</div>
            <p className="text-[13px] text-mute">
              {games.length ? "Try a different name, title ID or platform filter." : "Add a folder that contains your games (each game folder holds an eboot.bin)."}
            </p>
            {!games.length && <Button variant="primary" onClick={() => setView("settings")}>Add a game folder</Button>}
          </motion.div>
        )}
      </div>

      <FolderMenu />

      <AnimatePresence>{selected && <GameDetail key={selected.id} game={selected} />}</AnimatePresence>
    </motion.div>
  );
}
