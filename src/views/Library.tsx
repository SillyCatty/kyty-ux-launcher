import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { imageSrc, type Game } from "../lib/api";
import { formatDate, formatPlayTime } from "../lib/fields";
import { backdropVariants, gridVariants, hoverLift, itemVariants, modalVariants, pageVariants, springBouncy, tap } from "../lib/motion";
import { useApp } from "../store/app";
import { Button, Select } from "../components/ui";
import { IconGamepad, IconPlay, IconRefresh, IconSearch, IconStop, IconClose, IconSettings } from "../components/icons";

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

function GameCard({ game }: { game: Game }) {
  const { selectGame, launch, running } = useApp();
  const isRunning = running?.game_id === game.id;
  return (
    <motion.article
      variants={itemVariants} whileHover={hoverLift} whileTap={{ scale: 0.98 }} transition={springBouncy}
      onClick={() => selectGame(game.id)}
      className="group relative cursor-pointer"
    >
      <motion.div layoutId={`cover-${game.id}`} transition={springBouncy} className="relative aspect-square overflow-hidden rounded-2xl border border-line bg-panel-2 shadow-lg shadow-black/40">
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
        <button
          aria-label={`Play ${game.name}`} disabled={!!running}
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

function GameDetail({ game }: { game: Game }) {
  const { selectGame, launch, stop, running, logs, setView } = useApp();
  const isRunning = running?.game_id === game.id;
  const busyElsewhere = !!running && !isRunning;
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
      <motion.div variants={modalVariants} onClick={(e) => e.stopPropagation()} className="card relative flex max-h-full w-full max-w-[860px] flex-col overflow-hidden !rounded-3xl shadow-2xl shadow-black/60">
        <div className="relative h-52 shrink-0 overflow-hidden">
          {bg && <motion.img initial={{ scale: 1.15, opacity: 0 }} animate={{ scale: 1, opacity: 0.55 }} transition={{ duration: 0.8 }} src={bg} alt="" className="absolute inset-0 h-full w-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-panel/40 to-panel" />
          <motion.button whileTap={tap} whileHover={{ rotate: 90 }} transition={springBouncy} onClick={close} aria-label="Close" className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white/80 backdrop-blur hover:text-white">
            <IconClose width={16} height={16} />
          </motion.button>
        </div>

        <div className="relative -mt-24 flex flex-col gap-5 overflow-y-auto px-8 pb-8">
          <motion.div variants={itemVariants} className="flex items-end gap-6">
            <motion.div layoutId={`cover-${game.id}`} transition={springBouncy} className="h-36 w-36 shrink-0 overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-black/60">
              <Cover game={game} />
            </motion.div>
            <div className="min-w-0 flex-1 pb-1">
              <h2 className="truncate text-[26px] font-semibold leading-tight">{game.name}</h2>
              <div className="mt-1 truncate font-mono text-[11.5px] text-mute" title={game.path}>{game.path}</div>
            </div>
          </motion.div>

          <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-3">
            {isRunning ? (
              <Button variant="danger" onClick={stop} className="!h-11 !px-7"><IconStop width={14} height={14} /> Stop game</Button>
            ) : (
              <Button variant="primary" disabled={busyElsewhere} onClick={() => void launch(game.id)} className="!h-11 !px-8 !text-[14px]">
                <IconPlay width={16} height={16} /> Play
              </Button>
            )}
            {busyElsewhere && <span className="text-[12px] text-mute">Another game is running.</span>}
            <Button onClick={() => { selectGame(null); setView("settings"); }}><IconSettings width={15} height={15} /> Emulator settings</Button>
          </motion.div>

          <motion.dl variants={itemVariants} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {facts.map(([k, v]) => (
              <div key={k} className="rounded-xl border border-line bg-black/20 px-3.5 py-2.5">
                <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-mute">{k}</dt>
                <dd className="mt-0.5 truncate text-[13px]">{v}</dd>
              </div>
            ))}
          </motion.dl>

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

export function LibraryView() {
  const { games, gamesLoading, refreshGames, selectedGameId, setView } = useApp();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("name");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = games.filter((g) => !q || g.name.toLowerCase().includes(q) || g.title_id.toLowerCase().includes(q));
    const by: Record<Sort, (a: Game, b: Game) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      recent: (a, b) => (b.last_played ?? 0) - (a.last_played ?? 0),
      playtime: (a, b) => b.play_seconds - a.play_seconds,
    };
    return [...list].sort(by[sort]);
  }, [games, query, sort]);

  const selected = games.find((g) => g.id === selectedGameId) ?? null;

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" className="relative flex h-full flex-col">
      <motion.header variants={itemVariants} className="flex flex-wrap items-end justify-between gap-4 px-8 pb-5 pt-2">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">Library</h1>
          <p className="text-[13px] text-mute">{games.length} game{games.length === 1 ? "" : "s"} found in your game folders</p>
        </div>
        <div className="flex items-center gap-2.5">
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

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {shown.length > 0 ? (
          <motion.div variants={gridVariants} initial="initial" animate="animate" key={`${query}-${sort}`} className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-x-5 gap-y-7 pt-2">
            {shown.map((g) => <GameCard key={g.id} game={g} />)}
          </motion.div>
        ) : (
          <motion.div variants={itemVariants} className="mx-auto mt-16 flex max-w-sm flex-col items-center gap-4 text-center">
            <motion.div animate={{ y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }} className="grid h-20 w-20 place-items-center rounded-3xl border border-line bg-panel-2 text-accent">
              <IconGamepad width={36} height={36} />
            </motion.div>
            <div className="text-[17px] font-semibold">{games.length ? "No games match your search" : "No games yet"}</div>
            <p className="text-[13px] text-mute">
              {games.length ? "Try a different name or title ID." : "Add a folder that contains your PS5 games (each game folder holds an eboot.bin)."}
            </p>
            {!games.length && <Button variant="primary" onClick={() => setView("settings")}>Add a game folder</Button>}
          </motion.div>
        )}
      </div>

      <AnimatePresence>{selected && <GameDetail key={selected.id} game={selected} />}</AnimatePresence>
    </motion.div>
  );
}
