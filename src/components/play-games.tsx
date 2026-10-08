// Three quick games for Dashboard → Play, all about the hiring process:
//   Red Flag or Green Flag  swipe (or arrow keys / buttons) to judge job-post and recruiter lines
//   Corporate Translator    memory: match what they say to what they mean
//   The Counter Offer       negotiate against a hidden budget without losing the offer
// Best scores stay on this device only (localStorage). No real company or person appears anywhere.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Flag, Ghost, Handshake, Minus, Plus, RotateCcw, Timer, Trophy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { card } from "./dashboard/ui-kit";

// ---------- shared ----------

const readBest = (key: string) => { try { const v = Number(localStorage.getItem(`ghosted.play.${key}`)); return Number.isFinite(v) && v > 0 ? v : null; } catch { return null; } };
const saveBest = (key: string, v: number) => { try { localStorage.setItem(`ghosted.play.${key}`, String(v)); } catch { /* storage blocked */ } };
function useBest(key: string, better: (a: number, b: number) => boolean) {
  // The Play view only renders in the browser (signed-in dashboard), so storage can be read up front.
  const [best, setBest] = useState<number | null>(() => (typeof window === "undefined" ? null : readBest(key)));
  const offer = useCallback((v: number) => { const prev = readBest(key); if (prev == null || better(v, prev)) { saveBest(key, v); setBest(v); return true; } return false; }, [key, better]);
  return [best, offer] as const;
}
const shuffle = <T,>(a: readonly T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j]!, b[i]!]; } return b; };
const frame = cn(card, "relative flex min-h-[30rem] flex-col overflow-hidden p-4 sm:p-6");

function Intro({ icon: Icon, title, lines, cta, onStart, best }: { icon: typeof Flag; title: string; lines: string[]; cta: string; onStart: () => void; best: string | null }) {
  return <div className="m-auto flex max-w-md flex-col items-center py-6 text-center">
    <span className="grid size-16 place-items-center rounded-2xl border-2 border-foreground bg-accent shadow-hard-sm"><Icon className="size-8" /></span>
    <h2 className="mt-4 font-display text-2xl font-bold sm:text-3xl">{title}</h2>
    <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
    <Button size="lg" className="mt-6 min-w-44" onClick={onStart} autoFocus>{cta}</Button>
    {best && <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Trophy className="size-3.5 text-flag-amber" />Your best: {best}</p>}
  </div>;
}

// ---------- 1. Red Flag or Green Flag ----------

type FlagCard = { text: string; red: boolean; why: string };
const FLAG_DECK: FlagCard[] = [
  { text: "“We're like a family here.”", red: true, why: "Families don't have notice periods. It often means blurry boundaries." },
  { text: "“Competitive salary.” (no number)", red: true, why: "Competitive with what? A real range would say." },
  { text: "Salary: ₹14 to 18 LPA, listed upfront.", red: false, why: "A posted range saves everyone a wasted round." },
  { text: "3 rounds, decision within 10 days.", red: false, why: "A clear process with a deadline. Rare, and lovely." },
  { text: "“Quick take-home: build our new feature.”", red: true, why: "That's not a test, that's unpaid work." },
  { text: "Take-home capped at 2 hours, or we pay for it.", red: false, why: "They respect your time. Green." },
  { text: "“We're looking for a rockstar ninja.”", red: true, why: "Buzzwords instead of a job description." },
  { text: "“You'll hear from us by Friday, either way.”", red: false, why: "A date and a promise to reply even if it's a no." },
  { text: "“We'll get back to you.” (no date)", red: true, why: "No date, no promise. Classic ghost setup." },
  { text: "Salary depends on your current CTC.", red: true, why: "Pay should match the role, not your last offer." },
  { text: "They share the panel's names before the interview.", red: false, why: "Transparency. You can prepare properly." },
  { text: "Six rounds for a junior role.", red: true, why: "That's a marathon for an entry-level job." },
  { text: "Rejection email with one line of real feedback.", red: false, why: "Even a no can be useful. Green." },
  { text: "“Final round is with the founder at 11 pm.”", red: true, why: "If the interview is at 11 pm, guess when the work is." },
  { text: "“You'll wear many hats.”", red: true, why: "Often means three jobs, one salary." },
  { text: "Core hours 11 to 4, the rest is flexible.", red: false, why: "Clear boundaries with real flexibility." },
  { text: "They reimburse your interview travel.", red: false, why: "They pay for their own process. Green." },
  { text: "“Can you join tomorrow?”", red: true, why: "Pressure tactics. Good teams plan ahead." },
  { text: "The job post lists who you'd report to.", red: false, why: "You know your manager before you apply." },
  { text: "“We work hard and play hard.”", red: true, why: "Usually more of the first than the second." },
  { text: "They tell you what the interview will cover.", red: false, why: "A fair test, not a trivia ambush." },
  { text: "“Unlimited leave!” (nobody takes any)", red: true, why: "Unlimited on paper, zero in practice." },
  { text: "Offer letter arrives within 48 hours of the yes.", red: false, why: "Fast, written and real." },
  { text: "Same job posted for 8 months straight.", red: true, why: "Could be a ghost job, or a role nobody stays in." },
];
const FLAG_SECONDS = 45;

function FlagGame() {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<"intro" | "play" | "done">("intro");
  const [deck, setDeck] = useState<FlagCard[]>([]);
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [misses, setMisses] = useState<FlagCard[]>([]);
  const [left, setLeft] = useState(FLAG_SECONDS);
  const [last, setLast] = useState<{ ok: boolean; card: FlagCard } | null>(null);
  const [best, offerBest] = useBest("flags", (a, b) => a > b);
  const [newBest, setNewBest] = useState(false);
  const scoreRef = useRef(0);

  const start = () => { setDeck(shuffle(FLAG_DECK)); setI(0); setScore(0); scoreRef.current = 0; setStreak(0); setMisses([]); setLeft(FLAG_SECONDS); setLast(null); setNewBest(false); setPhase("play"); };
  const finish = useCallback(() => { setPhase("done"); setNewBest(offerBest(scoreRef.current)); }, [offerBest]);

  useEffect(() => {
    if (phase !== "play") return;
    const t = window.setInterval(() => setLeft((s) => { if (s <= 1) { window.clearInterval(t); finish(); return 0; } return s - 1; }), 1000);
    return () => window.clearInterval(t);
  }, [phase, finish]);

  const answer = useCallback((saysRed: boolean) => {
    if (phase !== "play") return;
    const c = deck[i]; if (!c) return;
    const ok = c.red === saysRed;
    const gain = ok ? 10 + Math.min(streak, 5) * 2 : 0; // streaks add a little
    scoreRef.current += gain; setScore(scoreRef.current);
    setStreak(ok ? streak + 1 : 0);
    if (!ok) setMisses((m) => [...m, c]);
    setLast({ ok, card: c });
    if (i + 1 >= deck.length) finish(); else setI(i + 1);
  }, [phase, deck, i, streak, finish]);

  useEffect(() => {
    if (phase !== "play") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "ArrowLeft") { e.preventDefault(); answer(true); } if (e.key === "ArrowRight") { e.preventDefault(); answer(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, answer]);

  const onDragEnd = (_: unknown, info: PanInfo) => { if (Math.abs(info.offset.x) > 90 || Math.abs(info.velocity.x) > 500) answer(info.offset.x < 0); };
  const c = deck[i];

  return <div className={frame}>
    {phase === "intro" && <Intro icon={Flag} title="Red Flag or Green Flag" best={best != null ? `${best} points` : null} onStart={start} cta="Start (45 seconds)"
      lines={["Job posts and recruiter lines, one at a time.", "Swipe left (or press ←) for a red flag, right (→) for a green flag.", "Get a few right in a row for bonus points."]} />}
    {phase === "play" && c && <>
      <div className="flex items-center justify-between gap-3 text-sm font-bold">
        <span className="inline-flex items-center gap-1.5 tabular-nums"><Timer className="size-4" />{left}s</span>
        <span className="tabular-nums">{score} points{streak >= 2 && <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs">{streak} in a row</span>}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width] duration-1000 ease-linear" style={{ width: `${(left / FLAG_SECONDS) * 100}%` }} /></div>
      <div className="relative my-6 grid flex-1 place-items-center">
        <AnimatePresence mode="popLayout">
          <motion.div key={i} drag={reduce ? false : "x"} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.9} onDragEnd={onDragEnd}
            initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: reduce ? 0 : 0.2 }}
            className="w-full max-w-md cursor-grab touch-pan-y select-none rounded-2xl border-2 border-foreground bg-background p-6 text-center shadow-hard active:cursor-grabbing sm:p-8">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Card {i + 1} of {deck.length}</p>
            <p className="mt-3 font-display text-2xl font-bold leading-snug sm:text-3xl">{c.text}</p>
          </motion.div>
        </AnimatePresence>
      </div>
      {/* What the last card was, so the explanation never looks like it's about the new one. */}
      <p className="min-h-12 text-center text-sm" aria-live="polite">{last && <>
        <span className={cn("font-semibold", last.ok ? "text-flag-green" : "text-flag-red")}>{last.ok ? "Right: " : "Not quite: "}</span>
        <span className="text-muted-foreground">{last.card.text.replace(/\.$/, "")} was a {last.card.red ? "red" : "green"} flag. </span>{last.card.why}
      </>}</p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <Button size="lg" variant="outline" className="h-14 border-flag-red text-flag-red hover:bg-flag-red/10" onClick={() => answer(true)}><ArrowLeft />Red flag</Button>
        <Button size="lg" variant="outline" className="h-14 border-flag-green text-flag-green hover:bg-flag-green/10" onClick={() => answer(false)}>Green flag<ArrowRight /></Button>
      </div>
    </>}
    {phase === "done" && <div className="m-auto w-full max-w-lg py-4 text-center">
      <p className="text-sm font-semibold text-muted-foreground">Time's up</p>
      <p className="mt-1 font-display text-5xl font-bold tabular-nums">{score}</p>
      <p className="text-sm text-muted-foreground">points{newBest && <b className="ml-2 text-primary">New best!</b>}</p>
      {misses.length > 0 && <div className="mt-5 text-left"><p className="text-sm font-bold">The ones that got you</p>
        <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">{misses.map((m) => <li key={m.text} className="rounded-lg border-2 border-foreground/15 p-3 text-sm">
          <p className="font-semibold">{m.text} <span className={m.red ? "text-flag-red" : "text-flag-green"}>{m.red ? "Red flag" : "Green flag"}</span></p><p className="mt-0.5 text-muted-foreground">{m.why}</p></li>)}</ul></div>}
      <Button className="mt-6" onClick={start}><RotateCcw />Play again</Button>
    </div>}
  </div>;
}

// ---------- 2. Corporate Translator (memory) ----------

const PAIRS: [string, string][] = [
  ["“We'll keep your resume on file.”", "No."],
  ["“We're moving fast.”", "Three weeks of silence."],
  ["“Competitive salary.”", "Below market."],
  ["“Culture fit.”", "Vibes. Unexplained."],
  ["“A quick 2-hour task.”", "Your whole weekend."],
  ["“We had many strong candidates.”", "A template rejection."],
  ["“Flexible hours.”", "Always online."],
  ["“Fast-paced.”", "Understaffed."],
  ["“Let's circle back.”", "Never."],
  ["“Exciting equity.”", "Instead of cash."],
  ["“You'll wear many hats.”", "Three jobs, one salary."],
  ["“Just a casual chat.”", "A surprise interview."],
];
type Tile = { id: number; pair: number; side: "say" | "mean"; text: string };

function MemoryGame() {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<"intro" | "play" | "done">("intro");
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [open, setOpen] = useState<number[]>([]);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [moves, setMoves] = useState(0);
  const [best, offerBest] = useBest("translator", (a, b) => a < b);
  const [newBest, setNewBest] = useState(false);
  const busy = useRef(false);

  const start = () => {
    const picked = shuffle(PAIRS.map((p, k) => [p, k] as const)).slice(0, 6);
    setTiles(shuffle(picked.flatMap(([[say, mean], k]) => [{ pair: k, side: "say" as const, text: say }, { pair: k, side: "mean" as const, text: mean }])).map((t, id) => ({ ...t, id })));
    setOpen([]); setMatched(new Set()); setMoves(0); setNewBest(false); busy.current = false; setPhase("play");
  };

  const flip = (t: Tile) => {
    if (busy.current || open.includes(t.id) || matched.has(t.pair)) return;
    const next = [...open, t.id];
    setOpen(next);
    if (next.length < 2) return;
    setMoves((m) => m + 1);
    const [a, b] = next.map((id) => tiles[id]!);
    if (a!.pair === b!.pair) {
      const m = new Set(matched); m.add(a!.pair); setMatched(m); setOpen([]);
      if (m.size === tiles.length / 2) window.setTimeout(() => { setPhase("done"); setNewBest(offerBest(moves + 1)); }, 500);
    } else { busy.current = true; window.setTimeout(() => { setOpen([]); busy.current = false; }, 900); }
  };

  return <div className={frame}>
    {phase === "intro" && <Intro icon={Ghost} title="Corporate Translator" best={best != null ? `${best} moves` : null} onStart={start} cta="Start"
      lines={["Flip two cards at a time.", "Match what recruiters say with what they really mean.", "Fewest moves wins."]} />}
    {phase === "play" && <>
      <div className="flex items-center justify-between gap-3 text-sm font-bold"><span>Match what they say to what they mean</span><span className="shrink-0 tabular-nums">{moves} {moves === 1 ? "move" : "moves"}</span></div>
      <div className="mt-4 grid flex-1 grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3">
        {tiles.map((t) => {
          const shown = open.includes(t.id) || matched.has(t.pair), done = matched.has(t.pair);
          return <button key={t.id} type="button" onClick={() => flip(t)} disabled={done} aria-label={shown ? `${t.side === "say" ? "They say" : "They mean"}: ${t.text}` : "Face-down card"}
            className={cn("relative min-h-24 rounded-xl border-2 border-foreground p-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-28 sm:p-3",
              !shown && "bg-primary text-primary-foreground hover:bg-primary/90", shown && t.side === "say" && "bg-background", shown && t.side === "mean" && "bg-accent", done && "opacity-60")}>
            <motion.span key={shown ? "front" : "back"} initial={reduce ? false : { rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ duration: 0.18 }} className="flex h-full flex-col items-center justify-center gap-1">
              {shown ? <><span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{t.side === "say" ? "They say" : "They mean"}</span><span className="text-xs font-bold leading-snug sm:text-sm">{t.text}</span></>
                : <Ghost className="size-7 opacity-90" />}
            </motion.span>
            {done && <Check className="absolute right-1.5 top-1.5 size-4 text-flag-green" strokeWidth={3} />}
          </button>;
        })}
      </div>
    </>}
    {phase === "done" && <div className="m-auto max-w-md py-6 text-center">
      <p className="text-sm font-semibold text-muted-foreground">Fluent in corporate</p>
      <p className="mt-1 font-display text-5xl font-bold tabular-nums">{moves}</p>
      <p className="text-sm text-muted-foreground">moves{newBest && <b className="ml-2 text-primary">New best!</b>}</p>
      <p className="mx-auto mt-4 max-w-sm text-sm text-muted-foreground">Six pairs is a perfect 6. The real thing is harder: company pages on Ghosted show what candidates actually experienced.</p>
      <Button className="mt-6" onClick={start}><RotateCcw />New cards</Button>
    </div>}
  </div>;
}

// ---------- 3. The Counter Offer ----------

const STRIKES = 3;
const fmt = (v: number) => `₹${v.toFixed(1)} LPA`;

function NegotiationGame() {
  const [phase, setPhase] = useState<"intro" | "play" | "won" | "lost">("intro");
  const [offer, setOffer] = useState(12);
  const [budget, setBudget] = useState(14);
  const [ask, setAsk] = useState(15);
  const [strikes, setStrikes] = useState(0);
  const [log, setLog] = useState<{ ask: number; reply: string; hot: boolean }[]>([]);
  const [best, offerBest] = useBest("counter", (a, b) => a > b);
  const [newBest, setNewBest] = useState(false);

  const start = () => {
    const o = Math.round((6 + Math.random() * 18) * 2) / 2; // a starting offer between ₹6 and ₹24 LPA
    const b = Math.round(o * (1.08 + Math.random() * 0.3) * 10) / 10; // their hidden ceiling: 8% to 38% higher
    setOffer(o); setBudget(b); setAsk(Math.round(o * 1.25 * 2) / 2); setStrikes(0); setLog([]); setNewBest(false); setPhase("play");
  };
  const step = Math.max(0.5, Math.round(offer * 0.02 * 2) / 2);
  const min = offer, max = Math.round(offer * 1.8 * 2) / 2;
  const nudge = (d: number) => setAsk((a) => Math.min(max, Math.max(min, Math.round((a + d) * 2) / 2)));

  const submit = () => {
    if (ask <= budget) {
      const pct = Math.round(((ask - offer) / offer) * 100);
      setLog((l) => [...l, { ask, reply: pct > 0 ? `Deal at ${fmt(ask)}. That's ${pct}% more than their first offer.` : `Deal at ${fmt(ask)}, their first offer.`, hot: false }]);
      setPhase("won"); setNewBest(pct > 0 && offerBest(pct));
      return;
    }
    const s = strikes + 1; setStrikes(s);
    const over = ask / budget;
    const reply = s >= STRIKES ? "“We've decided to move forward with other candidates.” The offer is gone."
      : over > 1.2 ? "“That's well outside our budget.” Way too high."
      : over > 1.08 ? "“We can't stretch that far.” Getting closer."
      : "“Hmm, that's just above our range.” So close.";
    setLog((l) => [...l, { ask, reply, hot: over <= 1.08 }]);
    if (s >= STRIKES) setPhase("lost");
  };

  const raisePct = Math.round(((ask - offer) / offer) * 100);
  return <div className={frame}>
    {phase === "intro" && <Intro icon={Handshake} title="The Counter Offer" best={best != null ? `a ${best}% raise` : null} onStart={start} cta="Get an offer"
      lines={["You've got an offer. They have a hidden budget.", "Ask for more. Their reply tells you how far off you are.", "Push past their budget 3 times and the offer is withdrawn."]} />}
    {phase !== "intro" && <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
      <div className="flex items-center justify-between text-sm font-bold">
        <span>Their offer: <span className="tabular-nums">{fmt(offer)}</span></span>
        <span className="flex items-center gap-1" aria-label={`${STRIKES - strikes} tries left`}>{Array.from({ length: STRIKES }, (_, k) => <X key={k} className={cn("size-5", k < strikes ? "text-flag-red" : "text-foreground/15")} strokeWidth={3} />)}</span>
      </div>
      <ol className="mt-4 flex-1 space-y-2 overflow-y-auto" aria-live="polite">{log.map((l, k) => <li key={k} className="space-y-1.5">
        <p className="ml-auto w-fit rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">I'd like {fmt(l.ask)}.</p>
        <p className={cn("w-fit max-w-[90%] rounded-2xl rounded-bl-sm border-2 px-3 py-2 text-sm", l.hot ? "border-flag-amber" : "border-foreground/20")}>{l.reply}</p>
      </li>)}</ol>
      {phase === "play" && <div className="mt-4 rounded-xl border-2 border-foreground bg-background p-4">
        <p className="text-center text-xs font-semibold text-muted-foreground">Your ask</p>
        <div className="mt-1 flex items-center justify-center gap-3">
          <Button size="icon" variant="outline" className="size-12" aria-label="Ask for less" onClick={() => nudge(-step)}><Minus /></Button>
          <p className="whitespace-nowrap text-center font-display text-3xl font-bold tabular-nums sm:min-w-40 sm:text-4xl">{fmt(ask)}</p>
          <Button size="icon" variant="outline" className="size-12" aria-label="Ask for more" onClick={() => nudge(step)}><Plus /></Button>
        </div>
        <input type="range" min={min} max={max} step={0.5} value={ask} onChange={(e) => setAsk(Number(e.target.value))} aria-label="Your ask in lakhs per year" className="mt-3 h-3 w-full cursor-pointer accent-primary" />
        <p className="mt-1 text-center text-xs text-muted-foreground">{raisePct}% above their offer</p>
        <Button size="lg" className="mt-3 w-full" onClick={submit}>Send counter offer</Button>
      </div>}
      {phase !== "play" && <div className="mt-4 text-center">
        {phase === "won" ? <p className="font-display text-xl font-bold text-flag-green">{newBest ? "New best negotiation!" : "Signed."}</p> : <p className="font-display text-xl font-bold text-flag-red">Ghosted. Their budget was {fmt(budget)}.</p>}
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">Real tip: anchor with real numbers. Company pages on Ghosted show the pay ranges candidates reported.</p>
        <Button className="mt-4" onClick={start}><RotateCcw />New offer</Button>
      </div>}
    </div>}
  </div>;
}

export const PLAY_GAMES = {
  flags: { label: "Red or Green Flag", Component: FlagGame },
  translator: { label: "Corporate Translator", Component: MemoryGame },
  counter: { label: "The Counter Offer", Component: NegotiationGame },
} as const;
export type PlayGameId = keyof typeof PLAY_GAMES;
export function PlayGame({ id }: { id: PlayGameId }) { const G = useMemo(() => PLAY_GAMES[id].Component, [id]); return <G />; }
