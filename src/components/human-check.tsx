import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { RotateCcw, ShieldCheck, Trees } from "lucide-react";
import { api, apiEnabled } from "@/lib/api";
import { collectSignals, startSignals } from "@/lib/signals";
import { hexToWords, searchRange } from "@/lib/sha256";
import { useTone } from "@/lib/session";
import { cn } from "@/lib/utils";

// Ghosted Shield, the browser half (server half: backend/src/captcha.ts).
//  1. Solves a signed proof-of-work puzzle in the background (~1 s).
//  2. At submit time, attaches a privacy-safe summary of how the page was used (lib/signals.ts).
//  3. If the server finds it robotic, escalates: a harder puzzle plus "hide the ghost" drag to a
//     server-chosen spot, whose trajectory is checked too.

type Challenge = { level: "normal" | "hard"; salt: string; challenge: string; maxNumber: number; target: number; iat: number; expires: number; signature: string };
export type ShieldStatus = "checking" | "done" | "error" | "drag";
type Point = [number, number, number];

startSignals();

const LINES = [
  "Checking you're not a recruiter…",
  "Making sure you're not a spy sent by HR…",
  "Scanning for LinkedIn thought-leadership…",
  "Confirming you've never said “circle back”…",
  "Checking you don't own a ring light…",
  "Verifying you've been ghosted at least once…",
  "Looking for “per my last email” energy…",
  "Checking you've never scheduled a 7 am sync…",
  "Making sure you're not a bot. Or a talent partner…",
  "Scanning for “we're a family here” vibes…",
  "Confirming you've never asked for someone's current CTC…",
  "Checking you've never sent a 17-page take-home…",
  "Measuring how human your mouse wiggles are…",
  "Checking you've never said “quick 5-minute call”…",
];
const DONE_LINES = [
  "Not a recruiter. Verified.",
  "Certified human. Probably ghosted.",
  "No HR energy detected.",
  "Human confirmed. Zero corporate jargon found.",
  "Verified. You've definitely been left on read.",
  "All clear. Not a single “synergy” in sight.",
];

const b64url = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// Solves the puzzle with a small pool of Web Workers, each searching its own slice, off the main
// thread so the page never freezes. Falls back to chunked main-thread solving without Workers.
// Main-thread search in small chunks, yielding between them so the page stays responsive.
async function solveInline(ch: Challenge, cancelled: () => boolean): Promise<number | null> {
  const total = ch.maxNumber + 1;
  const target = hexToWords(ch.challenge);
  for (let start = 0; start < total; start += 25_000) {
    if (cancelled()) return null;
    const found = searchRange(ch.salt, target, start, Math.min(total, start + 25_000));
    if (found !== null) return found;
    await new Promise((r) => setTimeout(r, 0)); // let the page breathe between chunks
  }
  return null;
}

// Workers first; if they can't start, error out, or go quiet (some browsers, extensions and
// privacy modes block or freeze module workers), finish on the main thread instead of spinning.
// Once workers have failed in this browser, later checks go straight to the main thread instead of
// waiting for them to fail again.
let workersBroken = false;
async function solve(ch: Challenge, cancelled: () => boolean): Promise<number | null> {
  if (typeof Worker === "undefined" || workersBroken) return solveInline(ch, cancelled);
  try { return await solveWithWorkers(ch, cancelled); }
  catch { workersBroken = true; return cancelled() ? null : solveInline(ch, cancelled); }
}

// The pool is started once (warmPool runs as soon as a form with a check mounts) and reused, since
// spinning up module workers is the slow part on phones, not the hashing. Two workers: the normal
// puzzle is ~75k hashes on average, so more cores add start-up cost without saving time.
let pool: Worker[] | null = null;
let jobId = 0;
function warmPool() {
  if (pool || workersBroken || typeof Worker === "undefined") return pool;
  try {
    const count = Math.max(1, Math.min(2, navigator.hardwareConcurrency || 2));
    pool = Array.from({ length: count }, () => new Worker(new URL("../lib/pow-worker.ts", import.meta.url), { type: "module" }));
  } catch { workersBroken = true; pool = null; }
  return pool;
}
function dropPool() { pool?.forEach((w) => w.terminate()); pool = null; }

async function solveWithWorkers(ch: Challenge, cancelled: () => boolean): Promise<number | null> {
  const workers = warmPool();
  if (!workers) throw new Error("no workers");
  const id = ++jobId;
  const total = ch.maxNumber + 1;
  const size = Math.ceil(total / workers.length);
  return new Promise<number | null>((resolve, reject) => {
    let finished = 0;
    const cleanup = () => { window.clearInterval(poll); window.clearTimeout(timeout); workers.forEach((w) => { w.onmessage = null; w.onerror = null; w.onmessageerror = null; }); };
    const poll = window.setInterval(() => { if (cancelled()) { cleanup(); resolve(null); } }, 200);
    // Workers normally answer in well under a second; silence this long means they're stuck.
    const timeout = window.setTimeout(() => { cleanup(); dropPool(); reject(new Error("timeout")); }, 6_000);
    const fail = () => { cleanup(); dropPool(); reject(new Error("worker failed")); };
    workers.forEach((w, i) => {
      w.onmessage = (e: MessageEvent<{ id: number; found: number | null }>) => {
        if (e.data.id !== id) return; // an answer to an older puzzle
        if (e.data.found !== null) { cleanup(); return resolve(e.data.found); }
        if (++finished === workers.length) { cleanup(); resolve(null); }
      };
      w.onerror = fail;
      w.onmessageerror = fail;
      w.postMessage({ id, salt: ch.salt, challenge: ch.challenge, start: i * size, end: Math.min(total, (i + 1) * size) });
    });
  });
}

export function useHumanCheck() {
  const [status, setStatus] = useState<ShieldStatus>("checking");
  const [level, setLevel] = useState<"normal" | "hard">("normal");
  const [run, setRun] = useState(0);
  const [target, setTarget] = useState(0.7);
  const solved = useRef<{ ch: Challenge; number: number } | null>(null);
  const gesture = useRef<{ pts: Point[]; end: number } | null>(null);
  const runRef = useRef(0);
  const autoRetried = useRef(false);

  useEffect(() => {
    const id = ++runRef.current;
    const cancelled = () => runRef.current !== id;
    let expiry: number | undefined;
    solved.current = null;
    gesture.current = null;
    setStatus(level === "hard" ? "drag" : "checking");
    (async () => {
      try {
        const started = Date.now();
        let ch: Challenge = { level, salt: "", challenge: "", maxNumber: 0, target: 0.72, iat: Date.now(), expires: Date.now() / 1000 + 240, signature: "" };
        let number = 0;
        if (apiEnabled) {
          warmPool(); // workers boot while the puzzle is on its way
          ch = await api<Challenge>(`/v1/captcha${level === "hard" ? "?level=hard" : ""}`, { timeoutMs: 12_000 });
          // The server may force the hard level (e.g. this network has strikes), whatever we asked for.
          if (ch.level === "hard") { setTarget(ch.target); setStatus("drag"); }
          const n = await solve(ch, cancelled);
          if (n === null) throw new Error("unsolved");
          number = n;
        } else if (level === "hard") setTarget(ch.target);
        // Keep the animation on screen for a beat so the tick feels earned.
        await new Promise((r) => setTimeout(r, Math.max(0, 500 - (Date.now() - started))));
        if (cancelled()) return;
        solved.current = { ch, number };
        autoRetried.current = false;
        // Hard mode also needs the drag; the tick appears once both are done.
        if (ch.level === "normal" || gesture.current) setStatus("done");
        expiry = window.setTimeout(() => setRun((r) => r + 1), Math.max(10_000, ch.expires * 1000 - Date.now() - 30_000));
      } catch {
        if (cancelled()) return;
        // One quiet automatic retry (a blip in the network or a one-off stall) before asking for a tap.
        if (autoRetried.current) setStatus("error");
        else { autoRetried.current = true; setRun((r) => r + 1); }
      }
    })();
    return () => { runRef.current++; if (expiry) window.clearTimeout(expiry); };
  }, [run, level]);

  return {
    status,
    level,
    target,
    // Builds the single-use token at the moment of submitting, so the behaviour summary is current.
    getToken: useCallback((): string | undefined => {
      const s = solved.current;
      if (!s || (s.ch.level === "hard" && !gesture.current)) return undefined;
      if (!apiEnabled) return "demo";
      const { ch, number } = s;
      return b64url(JSON.stringify({ salt: ch.salt, number, challenge: ch.challenge, maxNumber: ch.maxNumber, target: ch.target, iat: ch.iat, expires: ch.expires, signature: ch.signature, signals: collectSignals(), ...(gesture.current && { gesture: gesture.current }) }));
    }, []),
    // Tokens are single-use: call after every submit attempt.
    reset: useCallback(() => setRun((r) => r + 1), []),
    // Server asked for more proof: harder puzzle + the drag challenge.
    escalate: useCallback(() => { setLevel("hard"); setRun((r) => r + 1); }, []),
    completeDrag: useCallback((g: { pts: Point[]; end: number }) => {
      gesture.current = g;
      setStatus(solved.current ? "done" : "checking");
    }, []),
    retry: useCallback(() => setRun((r) => r + 1), []),
  };
}

type Shield = ReturnType<typeof useHumanCheck>;

const DRAG_INTROS = ["Drag the ghost into the bushes before the recruiter sees it.", "Quick! Hide the ghost before HR schedules another round.", "A recruiter is approaching. Get the ghost into the bushes."];
const DRAG_WINS = ["Hidden. The recruiter walked right past.", "Safe. HR is now emailing the bushes.", "Nailed it. The recruiter is “circling back” to nobody."];
const DRAG_OVERSHOOT = ["Too far! You ran straight into the recruiter.", "Overshot. The recruiter wants to “hop on a quick call”.", "Too far! Now you're in round 6."];
const DRAG_SHORT = ["Almost! All the way into the bushes.", "Not quite. The recruiter can still see your LinkedIn.", "A little further. Your résumé is still showing."];

// "Hide the ghost from the recruiter": drag into a server-chosen spot. The path is sent for checking.
function DragChallenge({ target, onDone }: { target: number; onDone: (g: { pts: Point[]; end: number }) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const pts = useRef<Point[]>([]);
  const t0 = useRef(0);
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [hint, setHint] = useState(() => DRAG_INTROS[Math.floor(Math.random() * DRAG_INTROS.length)]!);

  const pos = (e: ReactPointerEvent) => {
    const r = track.current!.getBoundingClientRect();
    return { fx: Math.min(1, Math.max(0, (e.clientX - r.left - 20) / (r.width - 40))), y: e.clientY - r.top };
  };
  const down = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    t0.current = performance.now();
    pts.current = [];
    setDragging(true);
  };
  const move = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragging) return;
    const { fx, y } = pos(e);
    setX(fx);
    if (pts.current.length < 120) pts.current.push([+fx.toFixed(3), Math.round(y), Math.round(performance.now() - t0.current)]);
  };
  const up = () => {
    setDragging(false);
    const pick = (xs: readonly string[]) => xs[Math.floor(Math.random() * xs.length)]!;
    if (Math.abs(x - target) <= 0.05 && pts.current.length >= 8) { onDone({ pts: pts.current, end: +x.toFixed(3) }); setHint(pick(DRAG_WINS)); }
    else { setX(0); setHint(pick(x > target ? DRAG_OVERSHOOT : DRAG_SHORT)); }
  };

  return <div className="space-y-2">
    <p className="text-sm font-bold">{hint}</p>
    <div ref={track} className="relative h-14 touch-none select-none rounded-xl border-2 border-foreground bg-muted">
      <span className="absolute inset-y-0 right-3 flex items-center text-[10px] font-bold uppercase text-muted-foreground">Recruiter →</span>
      <div className="absolute top-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-dashed border-flag-green bg-flag-green/15" style={{ left: `calc(20px + ${target} * (100% - 40px))` }} aria-hidden="true"><Trees className="size-5 text-flag-green" /></div>
      <motion.button type="button" aria-label="Drag the ghost to the hiding spot" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} animate={{ left: `calc(20px + ${x} * (100% - 40px))` }} transition={dragging ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 22 }} className="absolute top-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 cursor-grab place-items-center rounded-full border-2 border-foreground bg-card shadow-hard-sm active:cursor-grabbing">
        <img src="/ghosted-mark.png" alt="" className="pointer-events-none size-8 object-contain" draggable={false} />
      </motion.button>
    </div>
  </div>;
}

const CALM_LINES = ["Verifying you're human…", "Running a quick security check…", "Checking your browser…"];
const CALM_DONE = ["Verified. You're human.", "Security check complete."];

export function HumanCheck({ shield }: { shield: Shield }) {
  const { status, target } = shield;
  const tone = useTone();
  const lines = tone === "calm" ? CALM_LINES : LINES;
  const doneLines = tone === "calm" ? CALM_DONE : DONE_LINES;
  const [line, setLine] = useState(0);
  const [doneLine, setDoneLine] = useState(0);
  const [dragged, setDragged] = useState(false);
  useEffect(() => {
    if (status !== "checking" && status !== "drag") return;
    setLine(Math.floor(Math.random() * lines.length));
    const t = window.setInterval(() => setLine((n) => (n + 1) % lines.length), 1000);
    return () => window.clearInterval(t);
  }, [status, lines]);
  useEffect(() => { if (status === "done") setDoneLine(Math.floor(Math.random() * doneLines.length)); if (status === "drag") setDragged(false); }, [status, doneLines]);

  const working = status === "checking" || (status === "drag" && dragged);
  return <div className={cn("space-y-3 rounded-lg border-2 border-foreground bg-card px-3 py-2.5 transition-colors", status === "done" && "bg-flag-green/10")}>
    <div className="flex items-center gap-3" role="status" aria-live="polite">
      <div className="relative grid size-7 shrink-0 place-items-center">
        <AnimatePresence mode="wait" initial={false}>
          {(working || status === "drag") && <motion.span key="spin" exit={{ opacity: 0, scale: 0.5 }} className="size-6 animate-spin rounded-full border-[3px] border-muted border-t-primary" />}
          {status === "done" && <motion.svg key="tick" viewBox="0 0 24 24" className="size-7" initial={{ scale: 0.4, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 500, damping: 15 }} aria-hidden="true">
            <circle cx="12" cy="12" r="11" className="fill-flag-green" />
            <motion.path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: 0.1 }} />
          </motion.svg>}
          {status === "error" && <motion.button key="retry" type="button" onClick={shield.retry} initial={{ scale: 0.6 }} animate={{ scale: 1 }} className="grid size-7 place-items-center rounded-full border-2 border-foreground bg-flag-amber" aria-label="Run the human check again"><RotateCcw className="size-3.5" /></motion.button>}
        </AnimatePresence>
      </div>
      <div className="min-w-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p key={status === "done" || status === "error" ? status : `c${line}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }} className="truncate text-sm font-bold">
            {status === "done" ? doneLines[doneLine % doneLines.length] : status === "error" ? "Check failed. Tap to try again." : lines[line % lines.length]}
          </motion.p>
        </AnimatePresence>
        <p className="text-[11px] text-muted-foreground">{status === "done" ? "You're good to go." : status === "drag" ? "Extra check: you moved a little like a bot." : "Private: no tracking, no puzzles to click."}</p>
      </div>
      <span className="hidden items-center gap-1 text-[10px] font-bold uppercase text-muted-foreground sm:flex"><ShieldCheck className="size-3.5" />Ghosted Shield</span>
    </div>
    {status === "drag" && !dragged && <DragChallenge target={target} onDone={(g) => { setDragged(true); shield.completeDrag(g); }} />}
  </div>;
}
