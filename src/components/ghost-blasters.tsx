// Ghost Blasters, the playable component (the game itself is src/game/ghost-blasters.ts).
// Used as the dashboard's Play view, and small (`compact`) wherever someone is waiting on an empty
// page. The title, pause and game-over screens are plain HTML over the canvas, so they stay crisp,
// keyboard-friendly and in the site's design system.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Crosshair, Keyboard, Pause, Play, RotateCcw, Share2, Trophy } from "lucide-react";
import { toast } from "sonner";
import { shareRun } from "@/game/share-card";
import { Button } from "@/components/ui/button";
import { GhostBlasters, ENEMY_INFO, preloadArt, type GameState, type HudState, type RunResult } from "@/game/ghost-blasters";
import { getPrefs, setPrefs, usePrefs, type GameControls } from "@/lib/prefs";
import { useTone, voice } from "@/lib/session";
import { cn } from "@/lib/utils";

const CONTROL_OPTIONS: { id: GameControls; label: string }[] = [{ id: "both", label: "Both" }, { id: "arrows", label: "Arrow keys" }, { id: "wasd", label: "WASD" }];

function Key({ children }: { children: string }) {
  return <kbd className="inline-grid min-w-7 place-items-center rounded-md border-2 border-background/70 bg-background/10 px-1.5 py-0.5 font-mono text-[11px] font-bold">{children}</kbd>;
}

// Thumb stick for phones and tablets: drag anywhere in the pad, the ship follows.
function Joystick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const pad = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const move = (e: ReactPointerEvent) => {
    const r = pad.current!.getBoundingClientRect();
    const max = r.width / 2 - 18;
    let x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(x, y);
    if (len > max) { x = (x / len) * max; y = (y / len) * max; }
    setKnob({ x, y }); onMove(x / max, y / max);
  };
  const end = () => { setKnob({ x: 0, y: 0 }); onMove(0, 0); };
  return <div ref={pad} aria-hidden="true" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); move(e); }} onPointerMove={(e) => { if (e.buttons) move(e); }} onPointerUp={end} onPointerCancel={end}
    className="pointer-events-auto relative size-28 touch-none rounded-full border-2 border-background/40 bg-background/10 backdrop-blur-sm">
    <span className="absolute left-1/2 top-1/2 size-12 rounded-full border-2 border-foreground bg-primary shadow-hard-sm" style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }} />
  </div>;
}

export function GhostBlastersGame({ compact = false, className }: { compact?: boolean; className?: string }) {
  const prefs = usePrefs();
  const tone = useTone();
  const reduced = useReducedMotion();
  const calm = prefs.reduceMotion || !!reduced;
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<GhostBlasters | null>(null);
  const [state, setState] = useState<GameState>("ready");
  const [hud, setHud] = useState<HudState>({ xp: 0, level: 1, offers: 0 });
  const [result, setResult] = useState<(RunResult & { best: boolean }) | null>(null);
  const [ready, setReady] = useState(false);
  const [touch, setTouch] = useState(false);
  const best = prefs.game.best;

  useEffect(() => { setTouch(window.matchMedia("(pointer: coarse)").matches); void preloadArt().then(() => setReady(true)); }, []);

  useEffect(() => {
    if (!canvas.current || !wrap.current) return;
    const g = new GhostBlasters(canvas.current, wrap.current, {
      calm, controls: prefs.game.controls,
      onState: setState,
      onHud: (h) => setHud((p) => (p.xp === h.xp && p.level === h.level && p.offers === h.offers ? p : h)),
      onOver: (r) => {
        const saved = getPrefs().game;
        const isBest = r.xp > 0 && r.xp > saved.best;
        if (isBest) setPrefs({ game: { ...saved, best: r.xp } });
        setResult({ ...r, best: isBest });
      },
    });
    game.current = g;
    return () => { g.destroy(); game.current = null; };
    // The engine lives for the component's lifetime; settings are pushed in below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { game.current?.setControls(prefs.game.controls); }, [prefs.game.controls]);
  useEffect(() => { game.current?.setCalm(calm); }, [calm]);

  const [sharing, setSharing] = useState(false);
  const share = async (r: RunResult) => {
    setSharing(true);
    const how = await shareRun(r).finally(() => setSharing(false));
    if (how === "downloaded") toast.success("Card saved, and the text is copied. Paste it with the image.");
    else if (how === "copied") toast.success("Score copied. Paste it anywhere.");
    else if (how === "failed") toast.error("Couldn't share that. Try again.");
    wrap.current?.focus({ preventScroll: true });
  };
  const start = () => { setResult(null); game.current?.start(); wrap.current?.focus({ preventScroll: true }); };
  const togglePause = () => { const g = game.current; if (!g) return; if (state === "playing") g.pause(); else { g.resume(); wrap.current?.focus({ preventScroll: true }); } };
  const setControls = (c: GameControls) => setPrefs({ game: { ...prefs.game, controls: c } });
  const keysHint = prefs.game.controls === "arrows" ? "Arrow keys" : prefs.game.controls === "wasd" ? "WASD" : "Arrows or WASD";

  return <div ref={wrap} tabIndex={0} role="application" aria-label="Ghost Blasters game. Press Enter to start, Space to fire, P to pause."
    className={cn("relative isolate select-none overflow-hidden rounded-xl border-2 border-foreground bg-[#16111D] text-[#F2E9D8] shadow-hard outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      compact ? "h-[22rem] sm:h-[26rem]" : "h-[min(72vh,40rem)] min-h-[26rem]", className)}>
    <canvas ref={canvas} className="absolute inset-0 size-full" />

    {/* Live numbers while you play. */}
    {(state === "playing" || state === "paused") && <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
      <div className="flex flex-wrap gap-2 text-xs font-bold">
        <span className="rounded-full border-2 border-foreground bg-primary px-3 py-1 text-primary-foreground shadow-hard-sm">Experience <span className="tabular-nums">{hud.xp.toLocaleString("en-IN")}</span></span>
        <span className="rounded-full border-2 border-foreground bg-accent px-3 py-1 text-foreground shadow-hard-sm">Level {hud.level}</span>
        {best > 0 && <span className="hidden rounded-full border-2 border-background/30 px-3 py-1 sm:inline">Best <span className="tabular-nums">{best.toLocaleString("en-IN")}</span></span>}
      </div>
      <button type="button" onClick={togglePause} aria-label={state === "paused" ? "Resume" : "Pause"} className="pointer-events-auto grid size-10 place-items-center rounded-full border-2 border-foreground bg-card text-foreground shadow-hard-sm">{state === "paused" ? <Play className="size-4" /> : <Pause className="size-4" />}</button>
    </div>}

    {/* Thumb controls on touch screens. */}
    {touch && state === "playing" && <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-4">
      <Joystick onMove={(x, y) => game.current?.setStick(x, y)} />
      <button type="button" aria-label="Fire" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); game.current?.setFire(true); }} onPointerUp={() => game.current?.setFire(false)} onPointerCancel={() => game.current?.setFire(false)}
        className="pointer-events-auto grid size-20 touch-none place-items-center rounded-full border-2 border-foreground bg-flag-red text-primary-foreground shadow-hard active:translate-y-0.5 active:shadow-none"><Crosshair className="size-8" /></button>
    </div>}

    <AnimatePresence>
      {state === "ready" && <motion.div key="ready" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex flex-col items-center justify-between p-5 text-center sm:p-7">
        <div>
          <p className="text-xs font-bold text-[#9F7AEA]">Hiring Process: Haunted</p>
          <h2 className={cn("font-display font-bold leading-none", compact ? "text-4xl" : "text-5xl sm:text-6xl")}>Ghost Blasters</h2>
          {!compact && <p className="mx-auto mt-3 max-w-md text-sm text-[#F2E9D8]/80">{voice(tone, "Blast bad hiring practices with your résumé. Grab offers from Green Flag Recruiters. One touch from a Ghoster and it's back to applying.", "Shoot the bad hiring practices, collect offers from Green Flag Recruiters, and keep beating your best Experience.")}</p>}
        </div>
        <div className="flex w-full max-w-sm flex-col items-center gap-3">
          <Button size="lg" onClick={start} disabled={!ready} className="min-w-44 shadow-hard"><Play />{ready ? "Start run" : "Loading…"}</Button>
          {touch ? <p className="text-xs text-[#F2E9D8]/75">Left thumb steers, right thumb fires.</p>
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
        <div className="w-full max-w-sm rounded-xl border-2 border-foreground bg-card p-5 text-center text-foreground shadow-hard sm:p-6">
          <p className="text-xs font-bold text-flag-red">Taken out by {ENEMY_INFO[result.killer].name}</p>
          <p className="mt-1 font-display text-lg font-bold leading-snug">“{voice(tone, ENEMY_INFO[result.killer].line.sassy, ENEMY_INFO[result.killer].line.calm)}”</p>
          <p className="mt-4 font-display text-5xl font-bold tabular-nums text-primary">{result.xp.toLocaleString("en-IN")}</p>
          <p className="text-xs font-bold text-muted-foreground">Experience · Level {result.level} · {result.offers} {result.offers === 1 ? "offer" : "offers"} · {result.seconds}s</p>
          {result.best ? <p className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-accent px-3 py-1 text-xs font-bold"><Trophy className="size-3.5" />New best Experience</p>
            : best > 0 && <p className="mt-3 text-xs text-muted-foreground">Your best: {best.toLocaleString("en-IN")}</p>}
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button variant="outline" disabled={sharing || result.xp === 0} onClick={() => void share(result)}><Share2 />{sharing ? "Making card…" : "Share score"}</Button>
            <Button onClick={start}><RotateCcw />{voice(tone, "Apply again", "Play again")}</Button>
          </div>
          {!touch && <p className="mt-2 text-[11px] text-muted-foreground">or press <kbd className="font-bold">Space</kbd></p>}
        </div>
      </motion.div>}
    </AnimatePresence>
  </div>;
}