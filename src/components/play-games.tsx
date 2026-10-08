// The Play tab's arcade games (engines in src/game/): Offer Catcher, Follow-Up Flight and Notice
// Period Dash. Like Ghost Blasters, the title, pause and game-over screens are plain HTML over the
// canvas, so they stay crisp, keyboard-friendly and in the site's design system. Best scores stay on
// this device only (localStorage). No real company or person appears anywhere.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Heart, Keyboard, Pause, Play, RotateCcw, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePrefs } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { preloadArcadeArt, type Arcade, type ArcadeHud, type ArcadeOpts, type ArcadeState } from "@/game/arcade";
import { OfferCatcher } from "@/game/offer-catcher";
import { FollowUpFlight } from "@/game/follow-up-flight";
import { NoticeDash } from "@/game/notice-dash";

type Def = {
  make: (c: HTMLCanvasElement, w: HTMLElement, o: ArcadeOpts) => Arcade;
  kicker: string; title: string; blurb: string; touch: string; keys: string; over: string; lives?: boolean;
};
const GAMES = {
  catcher: {
    make: (c, w, o) => new OfferCatcher(c, w, o), kicker: "Hiring Process: Raining", title: "Offer Catcher", lives: true,
    blurb: "Catch offer letters in your inbox. Green Flag Recruiters are worth five. Red flags and Ghosters cost a life.",
    touch: "Drag anywhere to move your inbox.", keys: "← → or A D to move · P to pause", over: "Out of patience",
  },
  flight: {
    make: (c, w, o) => new FollowUpFlight(c, w, o), kicker: "Hiring Process: Unanswered", title: "Follow-Up Flight",
    blurb: "Your follow-up is a paper plane. Keep it flying through the walls of silence. Grab replies for bonus points.",
    touch: "Tap to flap.", keys: "Space, ↑ or click to flap · P to pause", over: "Follow-up lost",
  },
  dash: {
    make: (c, w, o) => new NoticeDash(c, w, o), kicker: "Hiring Process: Sprinting", title: "Notice Period Dash",
    blurb: "Run your notice period. Jump take-home tasks and endless rounds, duck the Ghosters, collect offers.",
    touch: "Tap to jump, tap again to double jump. Swipe down to duck.", keys: "Space or ↑ to jump (twice for a double) · ↓ to duck · P to pause", over: "Tripped up",
  },
} satisfies Record<string, Def>;
export type PlayGameId = keyof typeof GAMES;

const readBest = (k: string) => { try { return Number(localStorage.getItem(`ghosted.play.${k}`)) || 0; } catch { return 0; } };
const saveBest = (k: string, v: number) => { try { localStorage.setItem(`ghosted.play.${k}`, String(v)); } catch { /* storage blocked */ } };

export function PlayGame({ id }: { id: PlayGameId }) {
  const def: Def = GAMES[id];
  const prefs = usePrefs();
  const reduced = useReducedMotion();
  const calm = prefs.reduceMotion || !!reduced;
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<Arcade | null>(null);
  const [state, setState] = useState<ArcadeState>("ready");
  const [hud, setHud] = useState<ArcadeHud>({ score: 0 });
  const [result, setResult] = useState<{ score: number; detail: string; best: boolean } | null>(null);
  const [best, setBest] = useState(() => (typeof window === "undefined" ? 0 : readBest(id)));
  const [ready, setReady] = useState(false);
  // The Play view renders in the browser only (signed-in dashboard), so this can be read up front.
  const [touch] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);

  useEffect(() => { void preloadArcadeArt().then(() => setReady(true)); }, []);
  useEffect(() => {
    if (!canvas.current || !wrap.current) return;
    const g = def.make(canvas.current, wrap.current, {
      calm, onState: setState,
      onHud: (h) => setHud((p) => (p.score === h.score && p.lives === h.lives && p.combo === h.combo ? p : h)),
      onOver: (score, detail) => { const prev = readBest(id), isBest = score > 0 && score > prev; if (isBest) { saveBest(id, score); setBest(score); } setResult({ score, detail, best: isBest }); },
    });
    game.current = g;
    return () => { g.destroy(); game.current = null; };
    // The engine lives for the component's lifetime; calm mode is pushed in below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { game.current?.setCalm(calm); }, [calm]);

  const start = () => { setResult(null); game.current?.start(); wrap.current?.focus({ preventScroll: true }); };
  const togglePause = () => { const g = game.current; if (!g) return; if (state === "playing") g.pause(); else { g.resume(); wrap.current?.focus({ preventScroll: true }); } };
  // Enter (or Space on the title and game-over screens) starts a run.
  const onKey = (e: React.KeyboardEvent) => { if ((state === "ready" || state === "over") && ready && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); start(); } };

  return <div ref={wrap} tabIndex={0} role="application" onKeyDown={onKey} aria-label={`${def.title} game. Press Enter to start, P to pause.`}
    // Phones: fill the space between the game tabs and the bottom navigation (the tray and the ground
    // live at the bottom, so nothing may sit under the nav bar). Larger screens: the Ghost Blasters size.
    className="relative isolate h-[calc(100dvh-19.5rem)] min-h-[22rem] select-none lg:h-[min(72vh,40rem)] lg:min-h-[26rem] overflow-hidden rounded-xl border-2 border-foreground bg-[#16111D] text-[#F2E9D8] shadow-hard outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background">
    {/* touch-none: taps and drags steer the game instead of scrolling the page. */}
    <canvas ref={canvas} className="absolute inset-0 size-full touch-none" />

    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-3">
      {(state === "playing" || state === "paused") ? <div className="flex min-w-0 flex-wrap gap-1.5 text-[11px] font-bold sm:gap-2 sm:text-xs">
        <span className="rounded-full border-2 border-foreground bg-primary px-2.5 py-1 text-primary-foreground shadow-hard-sm sm:px-3">Score <span className="tabular-nums">{hud.score.toLocaleString("en-IN")}</span></span>
        {def.lives && hud.lives != null && <span className="flex items-center gap-0.5 rounded-full border-2 border-foreground bg-card px-2 py-1 shadow-hard-sm" aria-label={`${hud.lives} lives left`}>{[0, 1, 2].map((i) => <Heart key={i} className={cn("size-3.5", i < (hud.lives ?? 0) ? "fill-flag-red text-flag-red" : "text-muted-foreground/40")} />)}</span>}
        {(hud.combo ?? 0) >= 5 && <span className="rounded-full border-2 border-foreground bg-accent px-2.5 py-1 text-foreground shadow-hard-sm">Combo x{1 + Math.floor((hud.combo ?? 0) / 5)}</span>}
        {best > 0 && <span className="hidden rounded-full border-2 border-background/30 px-3 py-1 sm:inline">Best <span className="tabular-nums">{best.toLocaleString("en-IN")}</span></span>}
      </div> : <span />}
      {(state === "playing" || state === "paused") && <button type="button" onClick={togglePause} aria-label={state === "paused" ? "Resume" : "Pause"} className="pointer-events-auto grid size-10 shrink-0 place-items-center rounded-full border-2 border-foreground bg-card text-foreground shadow-hard-sm">{state === "paused" ? <Play className="size-4" /> : <Pause className="size-4" />}</button>}
    </div>

    <AnimatePresence>
      {state === "ready" && <motion.div key="ready" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex flex-col items-center justify-between bg-[#16111D]/45 p-5 text-center sm:p-7">
        <div>
          <p className="text-xs font-bold text-[#9F7AEA]">{def.kicker}</p>
          <h2 className="font-display text-5xl font-bold leading-none sm:text-6xl">{def.title}</h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-[#F2E9D8]/85">{def.blurb}</p>
        </div>
        <div className="flex w-full max-w-sm flex-col items-center gap-3">
          <Button size="lg" onClick={start} disabled={!ready} className="min-w-44 shadow-hard"><Play />{ready ? "Start run" : "Loading…"}</Button>
          <p className="flex flex-wrap items-center justify-center gap-1.5 text-xs text-[#F2E9D8]/80">{touch ? def.touch : <><Keyboard className="size-3.5" />{def.keys}</>}</p>
          {best > 0 && <p className="flex items-center gap-1.5 text-xs font-bold text-[#F59E0B]"><Trophy className="size-3.5" />Your best: {best.toLocaleString("en-IN")}</p>}
        </div>
      </motion.div>}

      {state === "paused" && <motion.div key="paused" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 grid place-items-center bg-[#16111D]/70 p-6 text-center backdrop-blur-sm">
        <div><p className="font-display text-4xl font-bold">Paused</p><p className="mt-1 text-sm text-[#F2E9D8]/75">HR is “circling back”. Take your time.</p>
          <Button className="mt-5" onClick={togglePause}><Play />Resume</Button></div>
      </motion.div>}

      {state === "over" && result && <motion.div key="over" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 grid place-items-center bg-[#16111D]/75 p-5 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-xl border-2 border-foreground bg-card p-5 text-center text-foreground shadow-hard sm:p-6">
          <p className="text-xs font-bold text-flag-red">{def.over}</p>
          <p className="mt-2 font-display text-5xl font-bold tabular-nums text-primary">{result.score.toLocaleString("en-IN")}</p>
          <p className="text-xs font-bold text-muted-foreground">{result.detail}</p>
          {result.best ? <p className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-accent px-3 py-1 text-xs font-bold"><Trophy className="size-3.5" />New best</p>
            : best > 0 && <p className="mt-3 text-xs text-muted-foreground">Your best: {best.toLocaleString("en-IN")}</p>}
          <Button className="mt-5 w-full" onClick={start}><RotateCcw />Play again</Button>
          {!touch && <p className="mt-2 text-[11px] text-muted-foreground">or press <kbd className="font-bold">Enter</kbd></p>}
        </div>
      </motion.div>}
    </AnimatePresence>
  </div>;
}
