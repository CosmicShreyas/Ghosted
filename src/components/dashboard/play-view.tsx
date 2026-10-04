// Dashboard → Play: Ghost Blasters, full size. The game code only loads when this view opens.
import { lazy, Suspense } from "react";
import { useTone, voice } from "@/lib/session";

const GhostBlastersGame = lazy(() => import("@/components/ghost-blasters").then((m) => ({ default: m.GhostBlastersGame })));

export function PlayView() {
  const tone = useTone();
  return <section className="space-y-4">
    <div>
      <h1 className="font-display text-3xl font-bold">Play</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{voice(tone, "Waiting on a reply? Blast the bad hiring practices while you wait. Offers from Green Flag Recruiters earn Experience.", "A short arcade break. Collect offers from Green Flag Recruiters to earn Experience.")}</p>
    </div>
    <Suspense fallback={<div className="skeleton h-[min(72vh,40rem)] min-h-[26rem] rounded-xl border-2 border-foreground" />}>
      <GhostBlastersGame />
    </Suspense>
  </section>;
}
