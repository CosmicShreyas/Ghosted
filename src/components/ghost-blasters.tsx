// Ghost Blasters, the playable component (the game itself is src/game/ghost-blasters.ts).
// Used as the dashboard's Play view, and small (`compact`) wherever someone is waiting on an empty
// page. The title, pause and game-over screens are plain HTML over the canvas, so they stay crisp,
// keyboard-friendly and in the site's design system.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Crosshair, Keyboard, Pause, Play, RotateCcw, Share2, Trophy, X } from "lucide-react";
import { toast } from "sonner";
import { shareRun } from "@/game/share-card";
import { Button } from "@/components/ui/button";
import { GhostBlasters, ENEMY_INFO, TITLE_LINES, lineFor, preloadArt, type GameState, type HudState, type RunResult } from "@/game/ghost-blasters";
import { getPrefs, setPrefs, usePrefs, type GameControls } from "@/lib/prefs";
import { useMe, useTone, voice } from "@/lib/session";
import { useQueryClient } from "@tanstack/react-query";
import { api, apiEnabled } from "@/lib/api";
import { cn } from "@/lib/utils";

const CONTROL_OPTIONS: { id: GameControls; label: string }[] = [{ id: "both", label: "Both" }, { id: "arrows", label: "Arrow keys" }, { id: "wasd", label: "WASD" }];

function Key({ children }: { children: string }) {
  return <kbd className="inline-grid min-w-7 place-items-center rounded-md border-2 border-background/70 bg-background/10 px-1.5 py-0.5 font-mono text-[11px] font-bold">{children}</kbd>;
}

// `onClose`: shown as a close button in the game's top bar (used when the game is in a popup).
export function GhostBlastersGame({ compact = false, className, onClose }: { compact?: boolean; className?: string; onClose?: () => void }) {
  const prefs = usePrefs();
  const tone = useTone();
  const reduced = useReducedMotion();
  const calm = prefs.reduceMotion || !!reduced;
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<GhostBlasters | null>(null);
  const [state, setState] = useState<GameState>("ready");
  const [hud, setHud] = useState<HudState>({ xp: 0, level: 1, offers: 0 });
  const [result, setResult] = useState<(RunResult & { best: boolean; line: string }) | null>(null);
  const toneRef = useRef(tone);
  toneRef.current = tone;
  // Title screen: a new line every few seconds (holds still in calm mode).
  const [title, setTitle] = useState(() => TITLE_LINES[tone][0]!);
  useEffect(() => {
    setTitle(lineFor(TITLE_LINES, tone));
    if (calm) return;
    const id = window.setInterval(() => setTitle(lineFor(TITLE_LINES, toneRef.current)), 3500);
    return () => window.clearInterval(id);
  }, [tone, calm]);
  const [ready, setReady] = useState(false);
  const [touch, setTouch] = useState(false);
  const [hint, setHint] = useState(false);
  useEffect(() => {
    if (state !== "playing") return;
    setHint(true);
    const t = window.setTimeout(() => setHint(false), 4000);
    return () => window.clearTimeout(t);
  }, [state === "playing"]); // eslint-disable-line react-hooks/exhaustive-deps
  const best = prefs.game.best;
  const { signedIn } = useMe();
  const qc = useQueryClient();

  useEffect(() => { setTouch(window.matchMedia("(pointer: coarse)").matches); void preloadArt().then(() => setReady(true)); }, []);

  useEffect(() => {
    if (!canvas.current || !wrap.current) return;
    const g = new GhostBlasters(canvas.current, wrap.current, {
      calm, tone, controls: prefs.game.controls,
      onState: setState,
      onHud: (h) => setHud((p) => (p.xp === h.xp && p.level === h.level && p.offers === h.offers ? p : h)),
      onOver: (r) => {
        const saved = getPrefs().game;
        const isBest = r.xp > 0 && r.xp > saved.best;
        if (isBest) setPrefs({ game: { ...saved, best: r.xp } });
        // A different line most runs: the classic one, or one of the extras for whoever got you.
        const info = ENEMY_INFO[r.killer], t = toneRef.current;
        setResult({ ...r, best: isBest, line: Math.random() < 0.35 ? voice(t, info.line.sassy, info.line.calm) : lineFor(info.outro, t) });
        void submit(r);
      },
    });
    game.current = g;
    return () => { g.destroy(); game.current = null; };
    // The engine lives for the component's lifetime; settings are pushed in below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { game.current?.setControls(prefs.game.controls); }, [prefs.game.controls]);
  useEffect(() => { game.current?.setCalm(calm); }, [calm]);
  useEffect(() => { game.current?.setTone(tone); }, [tone]);

  // Leaderboard (signed in, API on): a ticket when the run starts; the server times the run from it.
  const ticket = useRef<Promise<string | null> | null>(null);
  const signedInRef = useRef(signedIn);
  signedInRef.current = signedIn;
  const [board, setBoard] = useState<{ counted: number; newBest: boolean } | null>(null);
  const submit = async (r: RunResult) => {
    const t = await ticket.current; ticket.current = null;
    if (!t || r.xp <= 0) return;
    try {
      const res = await api<{ counted: number; newBest: boolean }>("/v1/game/score", { method: "POST", body: { ticket: t, xp: r.xp, level: r.level, offers: r.offers, seconds: r.seconds } });
      setBoard(res);
      void qc.invalidateQueries({ queryKey: ["game"] });
    } catch { /* the board is cosmetic: a failed save never interrupts the game */ }
  };
  const [sharing, setSharing] = useState(false);
  const share = async (r: RunResult) => {
    setSharing(true);
    const how = await shareRun(r).finally(() => setSharing(false));
    if (how === "downloaded") toast.success("Card saved, and the text is copied. Paste it with the image.");
    else if (how === "copied") toast.success("Score copied. Paste it anywhere.");
    else if (how === "failed") toast.error("Couldn't share that. Try again.");
    wrap.current?.focus({ preventScroll: true });
  };
  const start = () => {
    setResult(null); setBoard(null);
    ticket.current = apiEnabled && signedInRef.current ? api<{ ticket: string }>("/v1/game/start", { method: "POST" }).then((r) => r.ticket).catch(() => null) : null;
    game.current?.start(); wrap.current?.focus({ preventScroll: true }); };
  const togglePause = () => { const g = game.current; if (!g) return; if (state === "playing") g.pause(); else { g.resume(); wrap.current?.focus({ preventScroll: true }); } };
  const setControls = (c: GameControls) => setPrefs({ game: { ...prefs.game, controls: c } });
  const keysHint = prefs.game.controls === "arrows" ? "Arrow keys" : prefs.game.controls === "wasd" ? "WASD" : "Arrows or WASD";

  return <div ref={wrap} tabIndex={0} role="application" aria-label="Ghost Blasters game. Press Enter to start, Space to fire, P to pause."
    className={cn("relative isolate select-none overflow-hidden rounded-xl border-2 border-foreground bg-[#16111D] text-[#F2E9D8] shadow-hard outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      compact ? "h-[22rem] sm:h-[26rem]" : "h-[min(72vh,40rem)] min-h-[26rem]", className)}>
    {/* touch-none: taps and drags steer the game instead of scrolling the page. */}
    <canvas ref={canvas} className="absolute inset-0 size-full touch-none" />

    {/* Top bar: live numbers while you play; pause; close (in a popup). Safe-area padding keeps it
        clear of phone notches when the game fills the screen. */}
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      {(state === "playing" || state === "paused") ? <div className="flex min-w-0 flex-wrap gap-1.5 text-[11px] font-bold sm:gap-2 sm:text-xs">
        <span className="rounded-full border-2 border-foreground bg-primary px-2.5 py-1 text-primary-foreground shadow-hard-sm sm:px-3">XP <span className="tabular-nums">{hud.xp.toLocaleString("en-IN")}</span></span>
        <span className="rounded-full border-2 border-foreground bg-accent px-2.5 py-1 text-foreground shadow-hard-sm sm:px-3">Level {hud.level}</span>
        {best > 0 && <span className="hidden rounded-full border-2 border-background/30 px-3 py-1 sm:inline">Best <span className="tabular-nums">{best.toLocaleString("en-IN")}</span></span>}
      </div> : <span />}
      <div className="flex shrink-0 gap-2">
        {(state === "playing" || state === "paused") && <button type="button" onClick={togglePause} aria-label={state === "paused" ? "Resume" : "Pause"} className="pointer-events-auto grid size-10 place-items-center rounded-full border-2 border-foreground bg-card text-foreground shadow-hard-sm">{state === "paused" ? <Play className="size-4" /> : <Pause className="size-4" />}</button>}
        {onClose && <button type="button" onClick={onClose} aria-label="Close game" className="pointer-events-auto grid size-10 place-items-center rounded-full border-2 border-foreground bg-card text-foreground shadow-hard-sm"><X className="size-4" /></button>}
      </div>
    </div>

    {/* Touch screens: a short reminder of the controls at the start of each run. */}
    <AnimatePresence>{touch && state === "playing" && hint && <motion.p key="hint" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className="pointer-events-none absolute inset-x-0 bottom-4 mx-auto flex w-fit items-center gap-2 rounded-full border-2 border-foreground bg-card px-4 py-2 text-xs font-bold text-foreground shadow-hard-sm">
      <Crosshair className="size-4 text-primary" />Tap enemies to shoot · Hold and drag to fly
    </motion.p>}</AnimatePresence>

    <AnimatePresence>
      {state === "ready" && <motion.div key="ready" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={cn("absolute inset-0 flex flex-col items-center justify-between p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center sm:p-7", onClose && "pt-16 sm:pt-7")}>
        <div>
          <p className="text-xs font-bold text-[#9F7AEA]">Hiring Process: Haunted</p>
          <h2 className={cn("font-display font-bold leading-none", compact ? "text-4xl" : "text-5xl sm:text-6xl")}>Ghost Blasters</h2>
          <AnimatePresence mode="wait" initial={false}><motion.p key={title} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }} className="mt-2 min-h-5 font-display text-sm font-bold text-[#F59E0B]" aria-live="off">{title}</motion.p></AnimatePresence>
          {!compact && <p className="mx-auto mt-3 max-w-md text-sm text-[#F2E9D8]/80">{voice(tone, "Blast bad hiring practices with your résumé. Grab offers from Green Flag Recruiters. One touch from a Ghoster and it's back to applying.", "Shoot the bad hiring practices, collect offers from Green Flag Recruiters, and keep beating your best Experience.")}</p>}
        </div>
        <div className="flex w-full max-w-sm flex-col items-center gap-3">
          <Button size="lg" onClick={start} disabled={!ready} className="min-w-44 shadow-hard"><Play />{ready ? "Start run" : "Loading…"}</Button>
          {touch ? <p className="text-xs text-[#F2E9D8]/75">Tap an enemy to fire at it. Hold and drag to fly; your ship covers you while you move.</p>
            : <p className="flex flex-wrap items-center justify-center gap-1.5 text-xs text-[#F2E9D8]/80"><Keyboard className="size-3.5" />{keysHint} to fly · <Key>Space</Key> to send résumés · <Key>P</Key> to pause</p>}
          {!touch && <div role="radiogroup" aria-label="Movement keys" className="flex rounded-full border-2 border-background/40 p-0.5 text-xs font-bold">
            {CONTROL_OPTIONS.map((o) => <button key={o.id} type="button" role="radio" aria-checked={prefs.game.controls === o.id} onClick={() => setControls(o.id)}
              className={cn("rounded-full px-3 py-1.5 transition-colors", prefs.game.controls === o.id ? "bg-[#F2E9D8] text-[#16111D]" : "hover:bg-background/10")}>{o.label}</button>)}
          </div>}
          {best > 0 && <p className="flex items-center gap-1.5 text-xs font-bold text-[#F59E0B]"><Trophy className="size-3.5" />Your best: {best.toLocaleString("en-IN")} Experience</p>}
        </div>
      </motion.div>}

      {state === "paused" && <motion.div key="paused" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 grid place-items-center bg-[#16111D]/70 p-6 text-center backdrop-blur-sm">
        <div><p className="font-display text-4xl font-bold">Paused</p><p className="mt-1 text-sm text-[#F2E9D8]/75">{voice(tone, "HR is “circling back”. Take your time.", "Take a break. Your run is waiting.")}</p>
          <Button className="mt-5" onClick={togglePause}><Play />Resume</Button></div>
      </motion.div>}

      {state === "over" && result && <motion.div key="over" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 grid place-items-center bg-[#16111D]/75 p-5 backdrop-blur-sm">
        <div className="max-h-full w-full max-w-sm overflow-y-auto rounded-xl border-2 border-foreground bg-card p-4 text-center text-foreground shadow-hard sm:p-6">
          <p className="text-xs font-bold text-flag-red">Taken out by {ENEMY_INFO[result.killer].name}</p>
          <p className="mt-1 font-display text-base font-bold leading-snug sm:text-lg">“{result.line}”</p>
          <p className="mt-3 font-display text-4xl font-bold tabular-nums text-primary sm:mt-4 sm:text-5xl">{result.xp.toLocaleString("en-IN")}</p>
          <p className="text-xs font-bold text-muted-foreground">Experience · Level {result.level} · {result.offers} {result.offers === 1 ? "offer" : "offers"} · {result.seconds}s</p>
          {result.best ? <p className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-accent px-3 py-1 text-xs font-bold"><Trophy className="size-3.5" />New best Experience</p>
            : best > 0 && <p className="mt-3 text-xs text-muted-foreground">Your best: {best.toLocaleString("en-IN")}</p>}
          {board?.newBest && <p className="mt-2 text-xs font-bold text-primary">On the leaderboard with {board.counted.toLocaleString("en-IN")} Experience.</p>}
          {apiEnabled && !signedIn && result.xp > 0 && <p className="mt-2 text-xs text-muted-foreground">Sign in to put your runs on the leaderboard.</p>}
          <div className="mt-4 grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 sm:mt-5">
            <Button variant="outline" disabled={sharing || result.xp === 0} onClick={() => void share(result)}><Share2 />{sharing ? "Making card…" : "Share score"}</Button>
            <Button onClick={start}><RotateCcw />{voice(tone, "Apply again", "Play again")}</Button>
          </div>
          {!touch && <p className="mt-2 text-[11px] text-muted-foreground">or press <kbd className="font-bold">Space</kbd></p>}
        </div>
      </motion.div>}
    </AnimatePresence>
  </div>;
}