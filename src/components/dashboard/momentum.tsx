// Momentum cards for the home feed and the Companies view:
//   Spotlight     the companies we're collecting stories about first, with a "Share yours" button
//   BlockerCard   for accounts over a day old with no stories: "What's in the way?", one tap, once
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Loader2, PenLine, Target, X } from "lucide-react";
import { CompanyMark } from "@/components/ghosted";
import { Button } from "@/components/ui/button";
import { apiEnabled } from "@/lib/api";
import { submitFeedback } from "@/lib/feedback";
import { useMyStats } from "@/lib/my-stats";
import { useMe, useTone, voice } from "@/lib/session";
import { SPOTLIGHT, SPOTLIGHT_GOAL } from "@/lib/spotlight";
import { useCompanyIndex } from "@/lib/stories";
import { cn } from "@/lib/utils";
import { ShareModal, type StoryPreset } from "./share-story";

export function Spotlight({ className }: { className?: string }) {
  const tone = useTone();
  const { index } = useCompanyIndex();
  const [preset, setPreset] = useState<StoryPreset | null>(null);
  const companies = SPOTLIGHT.slice(0, 8).map((s) => index.get(s)).filter((c): c is NonNullable<typeof c> => !!c);
  if (!companies.length) return null;
  return <section className={cn("rounded-xl border-2 border-foreground bg-card p-4 shadow-hard-sm sm:p-5", className)}>
    <h2 className="flex items-center gap-2 font-display text-xl font-bold"><Target className="size-5 text-primary" />Spotlight</h2>
    <p className="text-sm text-muted-foreground">{voice(tone, "We're filling these in first. Been through one? Your story moves the bar.", "Companies we're collecting stories about first. Have you interviewed at one?")}</p>
    <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{companies.map((co) => {
      const n = Math.min(co.storyCount ?? 0, SPOTLIGHT_GOAL);
      return <li key={co.id} className="flex flex-col rounded-lg border-2 border-foreground/15 p-3">
        <div className="flex items-center gap-2.5"><CompanyMark company={co} size="sm" /><p className="min-w-0 truncate font-bold">{co.name}</p></div>
        <p className="mt-2 text-xs font-semibold text-muted-foreground">{n} of {SPOTLIGHT_GOAL} stories</p>
        <div className="relative mt-1 h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(n / SPOTLIGHT_GOAL) * 100}%` }} /></div>
        <Button size="sm" className="mt-3 min-h-10" onClick={() => setPreset({ company: co.id })}><PenLine />Share yours</Button>
      </li>;
    })}</ul>
    <ShareModal open={!!preset} onOpenChange={(v) => { if (!v) setPreset(null); }} preset={preset} />
  </section>;
}

// ---------- blocker survey ----------

const KEY = "ghosted.blockerSurvey";
const CHIPS = [
  { id: "what", label: "Not sure what to write", reply: "You don't have to write anything. Tap a few answers and post a quick story in about 30 seconds." },
  { id: "identified", label: "Worried about being identified", reply: "Stories show only your anonymous handle, and Goofy hides people's names. Employers never see who you are." },
  { id: "long", label: "Takes too long", reply: "The quick story path takes about 30 seconds: a few taps, no typing." },
  { id: "none", label: "No story to tell yet", reply: "Fair enough. Track an application in the Waiting Room and we'll nudge you if it goes quiet." },
  { id: "other", label: "Something else", reply: "Thanks for telling us. It helps us make sharing easier." },
] as const;

export function BlockerCard() {
  const tone = useTone();
  const { me } = useMe();
  const { stats } = useMyStats();
  const [state, setState] = useState<"ask" | "sending" | string>(() => { try { return localStorage.getItem(KEY) ? "gone" : "ask"; } catch { return "gone"; } });
  const oldEnough = !!me.createdAt && Date.now() - new Date(me.createdAt).getTime() > 86400_000;
  const remember = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch { /* storage blocked */ } };
  if (!apiEnabled || state === "gone" || !oldEnough || !stats || stats.stories > 0) return null;

  const answer = async (c: (typeof CHIPS)[number]) => {
    setState("sending");
    remember();
    try { await submitFeedback({ kind: "feedback", area: "stories", title: `Haven't posted yet: ${c.label}`, body: `First-story survey answer: ${c.label}.` }); } catch { /* the reply still helps */ }
    setState(c.id);
  };
  const reply = CHIPS.find((c) => c.id === state)?.reply;

  return <AnimatePresence>{<motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="relative rounded-xl border-2 border-foreground bg-accent p-4 shadow-hard-sm sm:p-5">
    <button type="button" onClick={() => { remember(); setState("gone"); }} aria-label="Dismiss" className="absolute right-2 top-2 grid size-10 place-items-center rounded-lg hover:bg-foreground/10"><X className="size-4" /></button>
    {reply ? <p className="flex items-start gap-2 pr-8 text-sm font-semibold"><Check className="mt-0.5 size-4 shrink-0 text-flag-green" />{reply}</p> : <>
      <h2 className="pr-10 font-display text-lg font-bold">{voice(tone, "Haven't posted yet? What's in the way?", "Haven't posted yet? What's stopping you?")}</h2>
      <p className="text-sm text-muted-foreground">One tap. We'll only ask once.</p>
      <div className="mt-3 flex flex-wrap gap-2">{CHIPS.map((c) => <button key={c.id} type="button" disabled={state === "sending"} onClick={() => void answer(c)} className="min-h-11 rounded-full border-2 border-foreground bg-card px-3.5 text-sm font-bold hover:bg-muted disabled:opacity-60">{c.label}</button>)}</div>
      {state === "sending" && <Loader2 className="mt-2 size-4 animate-spin" />}
    </>}
  </motion.section>}</AnimatePresence>;
}
