// "Waiting? Play Ghost Blasters": a small card for empty pages (a company with no stories yet, a
// story with no chitchats, a profile with no stories, an empty Waiting Room). Nothing loads or runs
// until someone taps Play; then the compact game opens right here.
import { lazy, Suspense, useState } from "react";
import { Gamepad2, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePrefs } from "@/lib/prefs";
import { useTone, voice } from "@/lib/session";
import { cn } from "@/lib/utils";

const GhostBlastersGame = lazy(() => import("@/components/ghost-blasters").then((m) => ({ default: m.GhostBlastersGame })));

// `line`: one string, or { sassy, calm } to follow the tone setting.
export function GameBreak({ line: lines, className }: { line: string | { sassy: string; calm: string }; className?: string }) {
  const tone = useTone();
  const line = typeof lines === "string" ? lines : voice(tone, lines.sassy, lines.calm);
  const [open, setOpen] = useState(false);
  const best = usePrefs().game.best;
  if (open) return <div className={cn("text-left", className)}>
    <div className="mb-2 flex items-center justify-between gap-2">
      <p className="flex items-center gap-2 text-sm font-bold"><Gamepad2 className="size-4 text-primary" />Ghost Blasters</p>
      <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-10 items-center gap-1 rounded-full px-3 text-xs font-bold hover:bg-muted"><X className="size-3.5" />Close</button>
    </div>
    <Suspense fallback={<div className="skeleton h-[22rem] rounded-xl border-2 border-foreground sm:h-[26rem]" />}><GhostBlastersGame compact /></Suspense>
  </div>;
  return <div className={cn("flex items-center gap-3 rounded-xl border-2 border-foreground bg-[#16111D] p-3 text-left text-[#F2E9D8] shadow-hard-sm sm:p-4", className)}>
    <img src="/Ghost%20Blasters/player-ship.png" alt="" width={56} height={56} loading="lazy" className="size-14 shrink-0 object-contain" />
    <div className="min-w-0 flex-1">
      <p className="font-display text-base font-bold leading-tight">{line}</p>
      <p className="mt-0.5 text-xs text-[#F2E9D8]/75">{best > 0 ? `Your best: ${best.toLocaleString("en-IN")} Experience. Beat it.` : "Blast bad hiring practices, grab offers, earn Experience."}</p>
    </div>
    <Button size="sm" className="min-h-10 shrink-0" onClick={() => setOpen(true)}><Play />Play</Button>
  </div>;
}
