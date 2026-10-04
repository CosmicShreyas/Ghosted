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
    {/* Narrow cards (phones, and the narrow column on tablets): ship and text in a row, the Play
        button full width underneath. Wide enough (container query): all three in one row. */}
    <div className={cn("@container rounded-xl border-2 border-foreground bg-[#16111D] p-3 text-left text-[#F2E9D8] shadow-hard-sm sm:p-4", className)}>
      <div className="flex flex-wrap items-center gap-3 @md:flex-nowrap">
        <img src="/Ghost%20Blasters/player-ship.png" alt="" width={56} height={56} loading="lazy" className="size-12 shrink-0 object-contain @md:size-14" />
        <div className="min-w-0 flex-1 basis-40">
          <p className="font-display text-base font-bold leading-snug">{line}</p>
          <p className="mt-0.5 text-xs text-[#F2E9D8]/75">{best > 0 ? `Your best: ${best.toLocaleString("en-IN")} Experience. Beat it.` : "Blast bad hiring practices, grab offers, earn Experience."}</p>
        </div>
        <Button size="sm" className="min-h-11 w-full shrink-0 @md:w-auto" onClick={() => setOpen(true)}><Play />Play</Button>
      </div>
    </div>
    {/* The game in a big popup. Closing it ends the run (the game stops with the popup). */}
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Phones: the game fills the whole screen. Larger screens: a big framed popup. The game has
          its own close button in its top bar, so the dialog's small X is hidden. */}
      <DialogContent className="h-[100dvh] w-screen max-w-none gap-0 rounded-none border-0 bg-[#16111D] p-0 sm:h-auto sm:w-[min(96vw,72rem)] sm:rounded-xl sm:border-2 sm:border-foreground sm:bg-card sm:p-4 sm:shadow-hard [&>button.absolute]:hidden">
        <DialogTitle className="sr-only">Ghost Blasters</DialogTitle>
        <DialogDescription className="sr-only">Arcade game. Enter starts, Space fires, P pauses, Escape closes.</DialogDescription>
        {open && <Suspense fallback={<div className="skeleton h-full sm:h-[min(80vh,44rem)] sm:rounded-xl" />}>
          <GhostBlastersGame onClose={() => setOpen(false)} className="h-full min-h-0 rounded-none border-0 shadow-none sm:h-[min(80vh,44rem)] sm:min-h-[22rem] sm:rounded-xl sm:border-2 sm:shadow-hard" />
        </Suspense>}
      </DialogContent>
    </Dialog>
  </>;
}
