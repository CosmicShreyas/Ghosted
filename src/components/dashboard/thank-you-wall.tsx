// The thank-you wall: everyone who backed Ghosted and chose to show their name, drifting past in
// rows like a living wall. Hovering a row (or focusing someone with the keyboard) pauses it;
// clicking a person opens their profile. With Reduce motion on, it's a still grid instead.
import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Heart, Loader2 } from "lucide-react";
import { Avatar } from "@/components/ghosted";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { usePrefs } from "@/lib/prefs";
import { useThankYouWall, type WallEntry } from "@/lib/feedback";
import { useTone, voice } from "@/lib/session";
import { cn } from "@/lib/utils";

function Person({ w, onOpen }: { w: WallEntry; onOpen: () => void }) {
  return <Link to="/u/$id" params={{ id: w.author.publicId }} onClick={onOpen}
    className="group/p flex w-64 shrink-0 items-start gap-3 rounded-xl border-2 border-foreground bg-card p-3 shadow-hard-sm transition-transform hover:-translate-y-1 focus-visible:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
    <Avatar seed={w.author.avatarSeed} pastel={w.author.pastel} size="sm" label={w.author.name} />
    <span className="min-w-0 flex-1">
      <span className="flex items-center gap-1.5"><span className="truncate text-sm font-bold group-hover/p:text-primary">{w.author.name}</span>{(w.times ?? 1) > 1 && <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-flag-red/15 px-1.5 text-[10px] font-bold text-flag-red"><Heart className="size-2.5 fill-current" />{w.times}×</span>}</span>
      <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{w.message ? `“${w.message}”` : "Backed Ghosted"}</span>
    </span>
  </Link>;
}

// One drifting row: the people repeated until the row is wider than any screen, then doubled so
// the -50% loop is seamless. Speed scales with length so every row drifts at the same pace.
function Row({ people, reverse, onOpen }: { people: WallEntry[]; reverse: boolean; onOpen: () => void }) {
  let items = people;
  while (items.length < 8) items = [...items, ...people];
  const loop = [...items, ...items];
  return <div className="overflow-hidden py-2 [mask-image:linear-gradient(90deg,transparent,#000_6%,#000_94%,transparent)]">
    {/* Longhand properties on purpose: the `animation` shorthand would also reset play-state inline,
        and then hover (pause-on-hover) or keyboard focus could never pause the row. */}
    <div className={cn("pause-on-hover flex w-max gap-4 has-[:focus-visible]:[animation-play-state:paused]")}
      style={{ animationName: "marquee-left", animationDuration: `${items.length * 4.5}s`, animationTimingFunction: "linear", animationIterationCount: "infinite", animationDirection: reverse ? "reverse" : "normal" }}>
      {loop.map((w, i) => <Person key={`${w.author.publicId}-${i}`} w={w} onOpen={onOpen} />)}
    </div>
  </div>;
}

export function ThankYouWall({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const tone = useTone();
  const { reduceMotion } = usePrefs();
  const { wall, loading } = useThankYouWall(open);
  const still = reduceMotion || (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  // Three rows (fewer only if there are fewer people), dealt round-robin so each row mixes newer
  // and older names; short rows repeat themselves to fill the width.
  const rowCount = Math.min(3, wall.length);
  const rows = Array.from({ length: rowCount }, (_, r) => wall.filter((_, i) => i % rowCount === r));
  const close = () => onOpenChange(false);

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[88dvh] w-[calc(100vw-2rem)] max-w-5xl flex-col gap-0 overflow-hidden rounded-xl border-2 border-foreground bg-background p-0 shadow-hard">
      <div className="border-b-2 border-foreground bg-primary px-5 py-5 text-primary-foreground sm:px-7">
        <DialogTitle className="flex items-center gap-2 font-display text-2xl sm:text-3xl"><Heart className="size-6 fill-current" />The thank-you wall</DialogTitle>
        <DialogDescription className="mt-1 text-primary-foreground/85">{wall.length ? `${wall.length.toLocaleString("en-IN")} ${wall.length === 1 ? "person keeps" : "people keep"} Ghosted free for every candidate. Hover to pause, tap someone to see their page.` : "The people who keep Ghosted free for every candidate."}</DialogDescription>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-4" data-lenis-prevent>
        {loading ? <div className="grid place-items-center py-16"><Loader2 className="size-6 animate-spin text-primary" /></div>
          : !wall.length ? <div className="px-6 py-14 text-center"><p className="font-display text-xl font-bold">{voice(tone, "Nobody here yet. Be the legend who goes first.", "No names yet. Yours could be the first.")}</p><p className="mt-2 text-sm text-muted-foreground">Donate and tick “show my name” to appear here.</p></div>
          : still ? <div className="grid gap-3 px-5 sm:grid-cols-2 lg:grid-cols-3">{wall.map((w) => <Person key={w.author.publicId} w={w} onOpen={close} />)}</div>
          : <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">{rows.map((r, i) => <Row key={i} people={r} reverse={i % 2 === 1} onOpen={close} />)}</motion.div>}
      </div>
      <p className="border-t-2 border-foreground/15 px-5 py-3 text-center text-xs text-muted-foreground">Only people who chose to show their name appear here. Everyone else is thanked anonymously.</p>
    </DialogContent>
  </Dialog>;
}
