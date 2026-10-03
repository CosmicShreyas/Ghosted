import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, Hand, Heart, HeartCrack, Mail, PenLine, RotateCcw, Search, Trophy } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ghostStages, recruiterSlaps } from "@/mock/data";

function SectionTitle({ eyebrow, title, aside }: { eyebrow: string; title: string; aside?: string }) {
  return <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-3 text-sm font-bold uppercase text-primary">{eyebrow}</p><h2 className="max-w-2xl text-4xl font-bold sm:text-5xl">{title}</h2></div>{aside && <p className="max-w-md text-muted-foreground">{aside}</p>}</div>;
}

/* ---------- Ghost-o-meter ---------- */

const MAX_DAYS = 60;

// Rough odds of a reply decaying with silence. For laughs, not for lawyers.
const replyChance = (days: number) => Math.max(2, Math.round(96 * Math.exp(-days / 13)));

export function GhostOMeter() {
  const [days, setDays] = useState(9);
  const [copied, setCopied] = useState(false);
  const stage = [...ghostStages].reverse().find((s) => days >= s.from) ?? ghostStages[0];
  const chance = replyChance(days);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(t);
  }, [copied]);

  const copy = () => {
    void navigator.clipboard?.writeText(stage.followUp);
    setCopied(true);
    track("ghostometer");
  };

  return <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
    <SectionTitle eyebrow="The Ghost-o-meter" title="How ghosted are you, exactly?" aside="Slide to how many days it's been since they said “we'll get back to you”. We'll tell you where you stand, and hand you a follow-up to send." />
    <div className="mt-10 grid gap-5 lg:grid-cols-2">
      <div className="flex flex-col rounded-xl border-2 border-foreground bg-card p-6 shadow-hard sm:p-8">
        <p className="text-xs font-bold uppercase text-muted-foreground">Step 1 · Days since their last reply</p>
        <div className="mt-3 flex items-end gap-3">
          <span className="font-display text-7xl font-bold leading-none tabular-nums sm:text-8xl">{days}</span><span className="pb-2 font-display text-2xl font-bold text-muted-foreground">{days === 1 ? "day" : "days"}</span>
          {/* Phones and tablets: one-tap nudges, easier than dragging a thin slider. */}
          <span className="ml-auto flex gap-2 pb-1 lg:hidden">
            <button type="button" onClick={() => setDays((d) => Math.max(0, d - 1))} aria-label="One day fewer" className="grid size-11 place-items-center rounded-full border-2 border-foreground bg-card font-display text-xl font-bold active:bg-muted">−</button>
            <button type="button" onClick={() => setDays((d) => Math.min(MAX_DAYS, d + 1))} aria-label="One day more" className="grid size-11 place-items-center rounded-full border-2 border-foreground bg-card font-display text-xl font-bold active:bg-muted">+</button>
          </span>
        </div>
        <input type="range" min={0} max={MAX_DAYS} value={days} onChange={(e) => { setDays(Number(e.target.value)); track("ghostometer"); }} aria-label="Days since their last reply" className="mt-6 h-3 w-full cursor-pointer accent-primary sm:mt-8 lg:h-2" />
        {/* Phones and tablets: the stages as chips that wrap (the proportional bar truncated them). */}
        <div className="mt-4 flex flex-wrap gap-2 lg:hidden">{ghostStages.map((s) => <button key={s.name} type="button" onClick={() => setDays(s.from)} aria-pressed={s === stage}
          className={cn("min-h-10 rounded-full border-2 border-foreground px-3 text-xs font-bold transition-colors", s === stage ? "bg-foreground text-background" : "bg-card text-muted-foreground active:bg-muted")}>{s.name} <span className="font-normal opacity-70">{s.from}+</span></button>)}</div>
        <div className="relative mt-3 hidden h-8 lg:block">
          {ghostStages.map((s, i) => { const next = ghostStages[i + 1]?.from ?? MAX_DAYS; const active = s === stage; return <button key={s.name} type="button" onClick={() => setDays(s.from)} style={{ left: `${(s.from / MAX_DAYS) * 100}%`, width: `${((next - s.from) / MAX_DAYS) * 100}%` }} className={cn("absolute top-0 h-full border-l-2 border-foreground px-1.5 text-left text-[11px] font-bold leading-8 transition-colors", active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}><span className="block truncate">{s.name}</span></button>; })}
        </div>
        <div className="mt-8 flex-1 rounded-lg border-2 border-foreground bg-background p-5">
          <p className="text-xs font-bold uppercase text-muted-foreground">Your status</p>
          <AnimatePresence mode="wait"><motion.div key={stage.name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}><p className={cn("mt-1 font-display text-3xl font-bold", stage.tone)}>{stage.name}</p><p className="mt-1">{stage.verdict}</p></motion.div></AnimatePresence>
        </div>
      </div>

      <div className="flex flex-col rounded-xl border-2 border-foreground bg-foreground p-6 text-background shadow-hard sm:p-8">
        <p className="text-xs font-bold uppercase opacity-70">Step 2 · Odds they reply on their own</p>
        <div className="mt-3 flex items-center gap-6">
          <div className="relative grid size-28 shrink-0 place-items-center rounded-full border-2 border-background/30 bg-[radial-gradient(circle,var(--primary)_0%,transparent_70%)]">
            <motion.img src="/ghosted-mark.png" alt="" animate={{ y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} style={{ opacity: 0.3 + (chance / 100) * 0.7 }} className="size-20 object-contain" />
          </div>
          <div className="min-w-0 flex-1"><p className="font-display text-6xl font-bold tabular-nums">{chance}%</p><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-background/20"><motion.div className="h-full rounded-full bg-primary" animate={{ width: `${chance}%` }} transition={{ type: "spring", stiffness: 160, damping: 22 }} /></div><p className="mt-2 text-xs opacity-70">The ghost fades as their interest does.</p></div>
        </div>
        <div className="mt-8 flex flex-1 flex-col rounded-lg border-2 border-background/30 p-5">
          <p className="flex items-center gap-2 text-xs font-bold uppercase opacity-70"><Mail className="size-4" />Step 3 · Send them this follow-up</p>
          <AnimatePresence mode="wait"><motion.p key={stage.followUp} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="mt-3 flex-1 font-display text-lg font-bold">“{stage.followUp}”</motion.p></AnimatePresence>
          <Button type="button" variant="outline" className="mt-5 w-full bg-background text-foreground" onClick={copy}>{copied ? <><Check />Copied. Paste it into your email</> : <><Copy />Copy this message</>}</Button>
        </div>
      </div>
    </div>
  </section>;
}

/* ---------- Hiring minefield ---------- */

const COLS = 8;
const ROWS = 5;
const MINES = 7;
const LIVES = 3;
const SAFE = COLS * ROWS - MINES;

type Cell = { mine: boolean; adj: number; open: boolean };
type Slap = (typeof recruiterSlaps)[number];
type Status = "idle" | "playing" | "won" | "lost";

const blank = (): Cell[] => Array.from({ length: COLS * ROWS }, () => ({ mine: false, adj: 0, open: false }));

const around = (i: number) => {
  const r = Math.floor(i / COLS);
  const c = i % COLS;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const nr = r + dr;
    const nc = c + dc;
    if ((dr || dc) && nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) out.push(nr * COLS + nc);
  }
  return out;
};

// Mines are placed after the first click, never on or next to it, so the first dig is always safe.
function plant(first: number): Cell[] {
  const board = blank();
  const keepClear = new Set([first, ...around(first)]);
  let placed = 0;
  while (placed < MINES) {
    const i = Math.floor(Math.random() * board.length);
    const cell = board[i];
    if (cell && !cell.mine && !keepClear.has(i)) { cell.mine = true; placed++; }
  }
  board.forEach((cell, i) => { cell.adj = around(i).filter((n) => board[n]?.mine).length; });
  return board;
}

const GAUNTLET = ["Applied", "Screening call", "Take-home", "Tech round", "Final round", "Offer"];

// Danger escalates: 1 calm, 2 careful, 3+ run.
const adjTone = ["", "text-primary", "text-flag-amber", "text-flag-red", "text-flag-red"];

export function HiringMinefield() {
  const [board, setBoard] = useState<Cell[]>(blank);
  const [status, setStatus] = useState<Status>("idle");
  const [lives, setLives] = useState(LIVES);
  const [slaps, setSlaps] = useState<Slap[]>([]);
  const [hit, setHit] = useState<Slap | null>(null);

  useEffect(() => {
    if (!hit) return;
    const t = window.setTimeout(() => setHit(null), 1700);
    return () => window.clearTimeout(t);
  }, [hit]);

  const cleared = board.filter((c) => c.open && !c.mine).length;
  const over = status === "won" || status === "lost";

  const reset = () => { setBoard(blank()); setStatus("idle"); setLives(LIVES); setSlaps([]); setHit(null); };

  const dig = (i: number) => {
    if (over || hit) return;
    const next = (status === "idle" ? plant(i) : board).map((c) => ({ ...c }));
    const cell = next[i];
    if (!cell || cell.open) return;

    if (cell.mine) {
      cell.open = true;
      // Every game starts with a genuinely random HR move and avoids repeats until the deck runs out.
      const used = new Set(slaps.map((slap) => slap.title));
      const fresh = recruiterSlaps.filter((slap) => !used.has(slap.title));
      const pool = fresh.length ? fresh : recruiterSlaps;
      const random = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
      const slap = pool[random % pool.length] ?? recruiterSlaps[0];
      const left = lives - 1;
      setLives(left);
      setSlaps([slap, ...slaps]);
      setHit(slap);
      if (left <= 0) { next.forEach((c) => { if (c.mine) c.open = true; }); setStatus("lost"); }
      else setStatus("playing");
      setBoard(next);
      return;
    }

    // One click, one tile: no classic flood-fill cascade.
    cell.open = true;
    setBoard(next);
    setStatus(next.filter((c) => c.open && !c.mine).length === SAFE ? "won" : "playing");
  };

  const message = status === "won" ? "Offer in hand! Pending “final approvals”, obviously." : status === "lost" ? "Three red flags. They've “moved forward with other candidates”." : status === "idle" ? "Tap any tile to send your application. The first step is always safe." : "Each number counts the red flags hiding next door. A green tick means every neighbour is safe.";
  // How far through the hiring process the cleared tiles have carried you.
  const reached = Math.min(GAUNTLET.length - 1, Math.floor((cleared / SAFE) * GAUNTLET.length));

  return <section id="gauntlet" className="border-y-2 border-foreground bg-accent py-24">
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <SectionTitle eyebrow="The interview gauntlet" title="Can you survive a hiring process?" aside="Every tile is a step in the process. Most are fine. Some are red flags, and a recruiter will hit you with their finest move. Clear the board to reach the offer. Three red flags and you're out, just like real life." />
      {/* The process you're fighting through, lighting up as you clear tiles. */}
      <ol className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-2" aria-label="Your progress through the hiring process">{GAUNTLET.map((s, i) => {
        const done = status === "won" || (status !== "idle" && i < reached), now = status === "playing" && i === reached;
        return <li key={s} className="flex items-center gap-2">
          <span className={cn("rounded-full border-2 border-foreground px-3 py-1 text-xs font-bold transition-colors", done ? "bg-flag-green text-primary-foreground" : now ? "bg-primary text-primary-foreground" : status === "lost" && i === reached ? "bg-flag-red text-primary-foreground" : "bg-card")}>{s}</span>
          {i < GAUNTLET.length - 1 && <span aria-hidden="true" className={cn("h-0.5 w-4 rounded-full sm:w-6", done ? "bg-flag-green" : "bg-foreground/25")} />}
        </li>;
      })}</ol>
      <div className="mt-6 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <motion.div animate={hit ? { x: [0, -12, 10, -6, 4, 0] } : { x: 0 }} transition={{ duration: 0.45 }} className="relative rounded-xl border-2 border-foreground bg-foreground p-2 shadow-hard sm:p-3">
          <div className="grid gap-1.5 sm:gap-2" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
            {board.map((c, i) => <motion.button key={i} type="button" whileHover={!c.open && !over ? { y: -3 } : {}} whileTap={!c.open && !over ? { scale: 0.9 } : {}} onClick={() => dig(i)} disabled={c.open || over} aria-label={c.open ? (c.mine ? "Recruiter trap" : `${c.adj} traps nearby`) : "Hidden tile"} className={cn("grid aspect-square place-items-center rounded-md border-2 font-sans text-xl font-bold tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:text-3xl", !c.open && "cursor-pointer border-background/20 bg-primary hover:bg-primary/85", !c.open && over && "cursor-default opacity-60", c.open && !c.mine && "border-transparent", c.open && !c.mine && (c.adj ? "bg-background" : "bg-background text-flag-green"), c.open && c.mine && "border-foreground bg-flag-red text-primary-foreground", c.open && !c.mine && adjTone[Math.min(c.adj, 4)])}>
              {c.open && (c.mine ? <motion.span initial={{ scale: 0, rotate: -50 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 500, damping: 12 }}><Hand className="size-6 sm:size-8" strokeWidth={2.5} /></motion.span> : c.adj || <Check className="size-6 sm:size-8" strokeWidth={3} />)}
            </motion.button>)}
          </div>
          <AnimatePresence>{hit && <motion.div key={slaps.length} initial={{ opacity: 0, scale: 0.6, rotate: -8 }} animate={{ opacity: 1, scale: 1, rotate: -3 }} exit={{ opacity: 0, scale: 1.08 }} transition={{ type: "spring", stiffness: 420, damping: 14 }} className="absolute inset-0 z-10 m-auto flex h-fit max-w-sm flex-col items-center rounded-xl border-2 border-foreground bg-flag-red p-6 text-center text-primary-foreground shadow-hard"><Hand className="size-10" strokeWidth={2.5} /><p className="mt-2 font-display text-4xl font-bold">SLAP!</p><p className="mt-1 text-sm font-bold uppercase opacity-90">{hit.title}</p><p className="mt-2 font-semibold">{hit.line}</p></motion.div>}</AnimatePresence>
        </motion.div>

        {/* On desktop the panel is pinned to the board's height, so the board never gets padded out. */}
        <div className="relative min-h-[28rem] lg:min-h-0">
        <aside className="absolute inset-0 flex flex-col rounded-xl border-2 border-foreground bg-card p-5 shadow-hard sm:p-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border-2 border-foreground bg-background p-3"><p className="text-[11px] font-bold uppercase text-muted-foreground">Patience left</p><div className="mt-2 flex gap-1.5" aria-label={`${lives} of ${LIVES} lives left`}>{Array.from({ length: LIVES }, (_, i) => i < lives ? <Heart key={i} className="size-6 fill-flag-red text-flag-red" /> : <HeartCrack key={i} className="size-6 text-muted-foreground" />)}</div></div>
            <div className="rounded-lg border-2 border-foreground bg-background p-3"><p className="text-[11px] font-bold uppercase text-muted-foreground">Tiles cleared</p><p className="mt-1 font-sans text-2xl font-bold tabular-nums">{cleared}<span className="text-base text-muted-foreground">/{SAFE}</span></p></div>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full border-2 border-foreground bg-muted"><motion.div className="h-full bg-flag-green" animate={{ width: `${(cleared / SAFE) * 100}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} /></div>
          <p className={cn("mt-4 flex items-start gap-2 text-sm font-semibold", status === "won" && "text-flag-green", status === "lost" && "text-flag-red")} aria-live="polite">{status === "won" && <Trophy className="size-4 shrink-0" />}{message}</p>
          <div className="mt-4 flex min-h-0 flex-1 flex-col border-t-2 border-foreground pt-4">
            <p className="flex items-center justify-between text-[11px] font-bold uppercase text-muted-foreground"><span>Slap log</span>{slaps.length > 0 && <span>{slaps.length} {slaps.length === 1 ? "slap" : "slaps"}</span>}</p>
            {slaps.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Clean record so far. Enjoy it while HR is on leave.</p> : <ul data-lenis-prevent className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1">{slaps.map((s, i) => <motion.li key={slaps.length - i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex gap-2.5 rounded-lg border-2 border-foreground bg-background p-2.5 text-sm"><Hand className="mt-0.5 size-4 shrink-0 text-flag-red" /><span><strong className="block">{s.title}</strong>{s.line}</span></motion.li>)}</ul>}
          </div>
          <Button type="button" variant={over ? "default" : "outline"} className="mt-4 w-full" onClick={reset}><RotateCcw />{over ? "Apply again (you will)" : "Start over"}</Button>
        </aside>
        </div>
      </div>
      {/* The game ends where the product starts: real candidates have mapped real minefields. */}
      <AnimatePresence>{over && <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5 flex flex-wrap items-center gap-4 rounded-xl border-2 border-foreground bg-card p-5 shadow-hard-sm">
        <p className="min-w-0 flex-1 font-display text-lg font-bold">{status === "won" ? "Nice run. Real processes don't come with numbers on the tiles, though." : "Real candidates have already stepped on these. Check the map before you apply."}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><a href="#top-search"><Search />Search a company</a></Button>
          <Button asChild><Link to="/auth" search={{ intent: "share" }}><PenLine />Share your real run</Link></Button>
        </div>
      </motion.div>}</AnimatePresence>
    </div>
  </section>;
}
