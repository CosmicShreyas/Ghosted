import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useTone } from "@/lib/session";
import { loadingLines } from "@/mock/data";

const CALM_LINES = ["Loading…", "Signing you in…", "Getting things ready…"] as const;

// Full-screen splash with a bobbing ghost and a new line every 1.6 s (sassy or calm, per Settings).
// Starts on the first line (so server and client HTML match), then jumps to a random one.
export function Preloader() {
  const tone = useTone();
  const lines: readonly string[] = tone === "calm" ? CALM_LINES : loadingLines;
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(Math.floor(Math.random() * lines.length));
    const t = window.setInterval(() => setI((n) => (n + 1 + Math.floor(Math.random() * (lines.length - 1))) % lines.length), 1600);
    return () => window.clearInterval(t);
  }, [lines]);

  return <div className="grid min-h-screen place-items-center bg-background px-6" role="status" aria-live="polite" aria-busy="true">
    <div className="flex w-full max-w-lg flex-col items-center gap-4 text-center">
      <div className="grid h-24 w-24 shrink-0 place-items-center" aria-hidden="true">
        <motion.img src="/ghosted-mark.png" alt="" className="size-20 object-contain" animate={{ y: [0, -10, 0], rotate: [-4, 4, -4] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }} />
      </div>
      <div className="relative grid min-h-14 w-full place-items-center overflow-hidden px-2 sm:min-h-12">
        <AnimatePresence mode="wait">
          <motion.p key={`${tone}-${i}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }} className="col-start-1 row-start-1 max-w-full text-balance font-display text-base font-bold leading-snug sm:text-lg">{lines[i % lines.length]}</motion.p>
        </AnimatePresence>
      </div>
      <div className="h-1.5 w-40 overflow-hidden rounded-full border border-foreground bg-muted">
        <motion.div className="h-full w-1/3 rounded-full bg-primary" animate={{ x: ["-100%", "300%"] }} transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }} />
      </div>
    </div>
  </div>;
}
