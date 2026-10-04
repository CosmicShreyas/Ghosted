// Sidebar (desktop): "Your turn". One nudge picked for you, most useful first, then a few other
// things worth doing. It nudges toward the actions that make Ghosted better for everyone: sharing,
// reading, chitchatting, listing companies, tracking applications.
//
//   1. An application in your Waiting Room is past twice the usual wait → share what happened
//   2. You haven't shared a story yet → your first one
//   3. Otherwise → today's writing prompt, with your streak
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpenText, Building2, Flag, Flame, Ghost, Heart, Hourglass, MessageCircle, PenLine, Sparkles, type LucideIcon } from "lucide-react";
import { ShoutoutDialog } from "@/components/green-flag";
import { daysSince, useApplications, verdict } from "@/lib/applications";
import { useMyStats } from "@/lib/my-stats";
import { useDailyPrompt } from "@/lib/prompts";
import { cn } from "@/lib/utils";
import { ShareModal } from "./share-story";
import { FoundingProgress } from "@/lib/founding";
import { ListCompanyDialog } from "./list-company";
import type { View } from "./shell";

type Action = { id: "read" | "green" | "chitchat" | "list" | "track"; icon: LucideIcon; label: string; hint: string };
const ACTIONS: Action[] = [
  { id: "read", icon: BookOpenText, label: "Read today's stories", hint: "See what others went through" },
  { id: "green", icon: Flag, label: "Give a green flag", hint: "Thank a company that did it right" },
  { id: "chitchat", icon: MessageCircle, label: "Chitchat on a story", hint: "Add what you know" },
  { id: "list", icon: Building2, label: "List a company", hint: "Missing one? Add it" },
  { id: "track", icon: Hourglass, label: "Track an application", hint: "Start a wait timer" },
];

export function YourTurn({ onChange }: { onChange: (v: View) => void }) {
  const { stats } = useMyStats();
  const { list } = useApplications();
  const prompt = useDailyPrompt();
  const [share, setShare] = useState(false);
  const [listing, setListing] = useState(false);
  const [shouting, setShouting] = useState(false);

  const now = new Date();
  const ghosted = list.filter((a) => a.status === "waiting" && verdict(a, now) === "ghosted").sort((a, b) => daysSince(b.waitingSince, now) - daysSince(a.waitingSince, now))[0];
  const firstStory = stats != null && stats.stories === 0;
  const hasWaiting = list.some((a) => a.status === "waiting");
  // Hide the action the nudge already covers, and "track" once you're tracking something.
  const extras = ACTIONS.filter((a) => !(a.id === "track" && (ghosted || hasWaiting))).slice(0, 3);

  const run = (id: Action["id"]) => {
    if (id === "list") return setListing(true);
    if (id === "green") return setShouting(true);
    if (id === "track") return onChange("waiting");
    onChange("home"); // the feed: read, then chitchat under any story
  };

  return <div className="mt-6 space-y-4">
    <FoundingProgress compact />
    {/* The nudge */}
    <div className="rounded-xl border-2 border-foreground bg-accent p-3.5 shadow-hard-sm">
      {ghosted ? <>
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-flag-red"><Ghost className="size-3.5" />Day {daysSince(ghosted.waitingSince, now)} of silence</p>
        <p className="mt-1.5 text-sm font-bold leading-snug">{ghosted.company.name} has gone quiet for over twice their usual wait.</p>
        <p className="mt-1 text-xs text-muted-foreground">Telling it warns the next candidate.</p>
        <button type="button" onClick={() => onChange("waiting")} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-foreground bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition-transform hover:-translate-y-0.5"><PenLine className="size-3.5" />Share what happened</button>
      </> : firstStory ? <>
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-primary"><Sparkles className="size-3.5" />Your first story</p>
        <p className="mt-1.5 text-sm font-bold leading-snug">One honest story could save someone six rounds and a surprise take-home.</p>
        <p className="mt-1 text-xs text-muted-foreground">Anonymous. Tap a few answers and post a quick story in about 30 seconds.</p>
        <button type="button" onClick={() => setShare(true)} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-foreground bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition-transform hover:-translate-y-0.5"><PenLine className="size-3.5" />Share your story</button>
      </> : <>
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-primary"><Sparkles className="size-3.5" />Today's prompt</p>
        <p className="mt-1.5 text-sm font-bold leading-snug">{prompt}</p>
        {stats && stats.streak > 0 && <p className={cn("mt-1.5 flex items-center gap-1 text-xs font-semibold", stats.activeToday ? "text-muted-foreground" : "text-flag-red")}><Flame className="size-3.5" />{stats.activeToday ? `${stats.streak}-day streak. Nice.` : `Keep your ${stats.streak}-day streak going today`}</p>}
        <button type="button" onClick={() => setShare(true)} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-foreground bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition-transform hover:-translate-y-0.5"><PenLine className="size-3.5" />Write about it</button>
      </>}
    </div>

    {/* More to do: as many as the screen's height allows, so nothing ends up behind Goofy's card. */}
    <div>
      <p className="px-1 text-[11px] font-bold uppercase text-muted-foreground">More to do</p>
      <ul className="mt-1.5 space-y-1">{extras.map((a) => <li key={a.id}>
        <button type="button" onClick={() => run(a.id)} className="group flex w-full items-center gap-2.5 rounded-lg border-2 border-transparent px-2 py-1.5 text-left transition-colors hover:border-foreground hover:bg-muted">
          <span className="grid size-7 shrink-0 place-items-center rounded-md border-2 border-foreground bg-card transition-colors group-hover:bg-primary group-hover:text-primary-foreground"><a.icon className="size-3.5" /></span>
          <span className="min-w-0"><span className="block truncate text-xs font-bold">{a.label}</span><span className="block truncate text-[11px] text-muted-foreground">{a.hint}</span></span>
        </button>
      </li>)}</ul>
      {/* Feedback, contributing and donating all live on /feedback. */}
      <Link to="/feedback" className="mt-3 flex items-center gap-2.5 rounded-lg border-2 border-dashed border-foreground/30 px-2 py-2 text-left transition-colors hover:border-foreground hover:bg-muted">
        <span className="grid size-7 shrink-0 place-items-center rounded-md border-2 border-foreground bg-primary text-primary-foreground"><Heart className="size-3.5" /></span>
        <span className="min-w-0"><span className="block truncate text-xs font-bold">Feedback and support</span><span className="block truncate text-[11px] text-muted-foreground">Report a bug, build or donate</span></span>
      </Link>
      <Link to="/community" className="mt-2 block px-1 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Community rules</Link>
    </div>

    <ShareModal open={share} onOpenChange={setShare} />
    <ListCompanyDialog open={listing} onOpenChange={setListing} />
    <ShoutoutDialog open={shouting} onOpenChange={setShouting} />
  </div>;
}
