// "Waiting? Play Ghost Blasters": a small card for empty pages (a company with no stories yet, a
// story with no chitchats, a profile with no stories, an empty Waiting Room). Nothing loads or runs
// until someone taps Play; then the game opens in a big popup over the page.
import { lazy, Suspense, useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
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
  return <>
    <div className={cn("flex items-center gap-3 rounded-xl border-2 border-foreground bg-[#16111D] p-3 text-left text-[#F2E9D8] shadow-hard-sm sm:p-4", className)}>
      <img src="/Ghost%20Blasters/player-ship.png" alt="" width={56} height={56} loading="lazy" className="size-14 shrink-0 object-contain" />
      <div className="min-w-0 flex-1">
        <p className="font-display text-base font-bold leading-tight">{line}</p>
        <p className="mt-0.5 text-xs text-[#F2E9D8]/75">{best > 0 ? `Your best: ${best.toLocaleString("en-IN")} Experience. Beat it.` : "Blast bad hiring practices, grab offers, earn Experience."}</p>
      </div>
      <Button size="sm" className="min-h-10 shrink-0" onClick={() => setOpen(true)}><Play />Play</Button>
    </div>
    {/* The game in a big popup. Closing it ends the run (the game stops with the popup). */}
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-[min(96vw,72rem)] max-w-none gap-0 border-2 border-foreground bg-card p-3 shadow-hard sm:p-4">
        <DialogTitle className="sr-only">Ghost Blasters</DialogTitle>
        <DialogDescription className="sr-only">Arcade game. Enter starts, Space fires, P pauses, Escape closes.</DialogDescription>
        {open && <Suspense fallback={<div className="skeleton h-[min(80vh,44rem)] rounded-xl border-2 border-foreground" />}>
          <GhostBlastersGame className="h-[min(80vh,44rem)] min-h-[22rem]" />
        </Suspense>}
      </DialogContent>
    </Dialog>
  </>;
}
