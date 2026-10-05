// Momentum cards for the home feed and the Companies view:
//   Spotlight     the companies we're collecting stories about first, with a "Share yours" button
//   BlockerCard   for accounts over a day old with no stories: "What's in the way?", one tap, once
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Building2, Check, Copy, Gift, HeartHandshake, Hourglass, Loader2, MessageCircle, MessageCircleQuestion, PenLine, Target, X } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { inviteLink, useInvite, VOICE_TIERS } from "@/lib/invite";
import { CompanyMark } from "@/components/ghosted";
import { Button } from "@/components/ui/button";
import { apiEnabled } from "@/lib/api";
import { submitFeedback } from "@/lib/feedback";
import { useMyStats } from "@/lib/my-stats";
import { useMe, useTone, voice } from "@/lib/session";
import { SPOTLIGHT, SPOTLIGHT_GOAL } from "@/lib/spotlight";
import { useCompanyIndex } from "@/lib/stories";
import { cn, formatCount } from "@/lib/utils";
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

// ---------- missions: small things that make Ghosted better, each one a step toward flair ----------

const MISSION_ICON: Record<string, typeof Check> = { share: PenLine, react: HeartHandshake, chitchat: MessageCircle, follow: Building2, ask: MessageCircleQuestion, track: Hourglass, invite: Gift };

export function MissionsCard({ onShare }: { onShare: () => void }) {
  const tone = useTone();
  const navigate = useNavigate();
  const { data } = useInvite();
  const onGo = (view: "home" | "waiting" | "companies") => { void navigate({ to: "/dashboard", search: { view } }); window.scrollTo({ top: 0 }); };
  if (!data) return null;
  const all = data.missions.length;
  if (data.completed >= all) return null; // all done: the card steps aside
  const run = (id: string) => {
    if (id === "share") return onShare();
    if (id === "track") return onGo("waiting");
    if (id === "follow") return onGo("companies");
    if (id === "invite") { void navigate({ to: "/invite" }); return; }
    onGo("home");
  };
  const nextFlair = data.completed < 3 ? { at: 3, name: "Missions ring" } : { at: 6, name: "All missions ring" };
  return <section className="rounded-xl border-2 border-foreground bg-card p-4 shadow-hard-sm sm:p-5">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div><h2 className="flex items-center gap-2 font-display text-xl font-bold"><Target className="size-5 text-primary" />Your missions</h2>
        <p className="text-sm text-muted-foreground">{voice(tone, `${nextFlair.at - data.completed} more to unlock the ${nextFlair.name} for your avatar.`, `Complete ${nextFlair.at - data.completed} more to unlock the ${nextFlair.name}.`)}</p></div>
      <p className="font-display text-2xl font-bold tabular-nums">{data.completed}<span className="text-base text-muted-foreground">/{all}</span></p>
    </div>
    <div className="relative mt-3 h-2.5 rounded-full border-2 border-foreground bg-muted"><motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${(data.completed / all) * 100}%` }} /></div>
    <ul className="mt-4 grid gap-2 sm:grid-cols-2">{data.missions.map((m) => {
      const done = m.done >= m.goal;
      const Icon = MISSION_ICON[m.id] ?? Check;
      return <li key={m.id}><button type="button" disabled={done} onClick={() => run(m.id)} className={cn("flex min-h-14 w-full items-center gap-3 rounded-lg border-2 p-2.5 text-left transition-colors", done ? "border-flag-green/40 bg-flag-green/10" : "border-foreground/15 hover:border-foreground")}>
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-full border-2", done ? "border-flag-green bg-flag-green text-primary-foreground" : "border-foreground bg-accent")}>{done ? <Check className="size-4" /> : <Icon className="size-4" />}</span>
        <span className="min-w-0 flex-1"><span className={cn("block text-sm font-bold", done && "line-through opacity-70")}>{m.label}</span><span className="block truncate text-xs text-muted-foreground">{done ? "Done" : m.goal > 1 ? `${m.done} of ${m.goal} · ${m.hint}` : m.hint}</span></span>
      </button></li>;
    })}</ul>
  </section>;
}

// ---------- invites: a small card on home; the full page is /invite ----------

export function InviteCard() {
  const { data } = useInvite();
  const [copied, setCopied] = useState(false);
  if (!data?.code) return null;
  const link = inviteLink(data.code);
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ } };
  const next = VOICE_TIERS.find((t) => data.voices < t);
  return <section className="relative overflow-hidden rounded-xl border-2 border-foreground bg-accent p-4 shadow-hard-sm sm:p-5">
    <div className="flex flex-wrap items-center gap-4">
      <span className="grid size-12 shrink-0 place-items-center rounded-xl border-2 border-foreground bg-card"><Gift className="size-6" /></span>
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-xl font-bold">{data.voices ? `You've brought ${formatCount(data.voices)} ${data.voices === 1 ? "voice" : "voices"}` : "Invite someone who's been through it"}</h2>
        <p className="text-sm text-muted-foreground">{next ? `${next - data.voices} more ${next - data.voices === 1 ? "voice" : "voices"} to reach Invite Level ${VOICE_TIERS.indexOf(next as 1 | 3 | 10) + 1}. A voice is someone who joins with your link and shares a story.` : "You're at Invite Level 3, the top level. Thank you for growing Ghosted."}</p>
      </div>
      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
        <Button className="min-h-11" onClick={() => void copy()}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy invite link"}</Button>
        <Button className="min-h-11" variant="outline" asChild><Link to="/invite">How it works</Link></Button>
      </div>
    </div>
    {data.joined > 0 && <p className="mt-3 text-xs font-semibold text-muted-foreground">{formatCount(data.joined)} joined with your link · {formatCount(data.stories)} stories · {formatCount(data.relatable)} people found them relatable</p>}
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
