import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { ArrowRight, BookOpen, Check, Copy, EyeOff, Flame, Gift, HeartHandshake, Linkedin, MessageCircle, PenLine, Share2, ShieldCheck, TrendingUp, Twitter, UserPlus, Zap, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ghosted";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { api, apiEnabled, track } from "@/lib/api";
import { inviteLink, rememberRef } from "@/lib/invite";
import { LEVEL_LADDER, LevelBadge, LevelProgress, StreakChip, levelColor, useMyLevel, type XpKind } from "@/lib/levels";
import { pageHead } from "@/lib/meta";
import { useMe, useTone, voice } from "@/lib/session";
import { cn, formatCount } from "@/lib/utils";

// /invite: the level system (how XP, streaks and levels work), your level and invite link (signed
// in), and the landing for people who open someone's invite link (?ref=CODE). Inviting someone who
// shares a story is the biggest XP payout on Ghosted. Rules: backend/src/levels.ts.
export const Route = createFileRoute("/invite")({
  validateSearch: (s: Record<string, unknown>): { ref?: string } => (typeof s["ref"] === "string" && /^[A-Za-z2-9]{8}$/.test(s["ref"]) ? { ref: s["ref"].toUpperCase() } : {}),
  head: () => pageHead({ title: "Level up on Ghosted | Streaks, XP and invites", description: "Read, react, chitchat, share your story, follow and invite to earn XP. Keep a daily streak, climb from LV 1 to the red levels, and bring a friend for the biggest boost. Anonymous, no money, no spam.", path: "/invite" }),
  component: InvitePage,
});

// The six ways to earn, with base XP and daily caps (same as XP_RULES in backend/src/levels.ts).
// Signed in, the numbers come from the server, scaled to your level.
const WAYS: { id: XpKind; icon: LucideIcon; label: string; how: string; xp: number; cap: number }[] = [
  { id: "read", icon: BookOpen, label: "Read stories", how: "Open a story and actually read it", xp: 2, cap: 15 },
  { id: "react", icon: HeartHandshake, label: "React", how: "Relatable, eye-opening, with you, love…", xp: 4, cap: 10 },
  { id: "chitchat", icon: MessageCircle, label: "Chitchat", how: "Add what you know under a story", xp: 10, cap: 6 },
  { id: "story", icon: PenLine, label: "Share your story", how: "A quick one takes about 30 seconds", xp: 50, cap: 2 },
  { id: "follow", icon: UserPlus, label: "Follow", how: "Companies and people worth hearing from", xp: 5, cap: 6 },
  { id: "invite", icon: Gift, label: "Invite a friend", how: "30 XP when they join, 120 when they share", xp: 120, cap: 5 },
];

function InvitedHero({ code }: { code: string }) {
  const q = useQuery({ queryKey: ["invite-lookup", code], queryFn: () => api<{ valid: boolean; inviter?: { handle: string; avatarSeed: string; pastel: string; level?: number } }>(`/v1/invite/${code}`), enabled: apiEnabled, retry: false });
  useEffect(() => { rememberRef(code); track("invite_open"); }, [code]);
  const inv = q.data?.valid ? q.data.inviter : null;
  return <section className="border-b-2 border-foreground bg-accent">
    <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-14 sm:px-6 md:grid-cols-[auto_1fr]">
      <motion.div initial={{ scale: 0.6, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 240, damping: 14 }} className="relative justify-self-center">
        {inv ? <><div className="[&_img]:size-28"><Avatar seed={inv.avatarSeed} pastel={inv.pastel} size="lg" label={inv.handle} /></div>{inv.level && <LevelBadge level={inv.level} size="md" className="absolute -bottom-2 left-1/2 -translate-x-1/2" />}</> : <img src="/ghosted-mark.png" alt="" className="size-28 object-contain" />}
      </motion.div>
      <div>
        <p className="text-sm font-bold text-primary">You've been invited</p>
        <h1 className="mt-1 text-4xl font-bold leading-tight sm:text-5xl">{inv ? <>{inv.handle} thinks your story matters.</> : <>Someone thinks your story matters.</>}</h1>
        <p className="mt-3 max-w-xl text-lg text-muted-foreground">Ghosted is where candidates share how hiring really went, anonymously. Join, share your experience in about 30 seconds, and start climbing from LV 1. Your first story alone is worth 50 XP.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button size="lg" className="min-h-12" asChild><Link to="/auth" search={{ intent: "share" }}><UserPlus />Join and share<ArrowRight /></Link></Button>
          <Button size="lg" variant="outline" className="min-h-12" asChild><Link to="/">See what Ghosted is</Link></Button>
        </div>
        <p className="mt-3 flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-flag-green" />{inv ? `${inv.handle} never sees who you are.` : "Nobody sees who you are."} No name, no company email.</p>
      </div>
    </div>
  </section>;
}

// The spectrum: what the badge looks like as you climb, pale yellow to deep red.
function Ladder({ current }: { current?: number }) {
  return <div>
    <div className="h-4 rounded-full border-2 border-foreground" style={{ background: `linear-gradient(90deg, ${[1, 8, 15, 22, 29, 36, 40].map((l) => levelColor(l).bg).join(", ")})` }} aria-hidden="true" />
    <ol className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">{LEVEL_LADDER.map(([l, t], i) => <motion.li key={l} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.04 }}
      className={cn("flex flex-col items-center gap-1.5 rounded-xl border-2 p-2.5 text-center", current != null && current >= l ? "border-foreground bg-card" : "border-foreground/15")}>
      <LevelBadge level={l} size="sm" />
      <span className="text-xs font-bold leading-tight">{t}</span>
      {current != null && current >= l && <Check className="size-3.5 text-flag-green" aria-label="Reached" />}
    </motion.li>)}</ol>
  </div>;
}

function YourLevel() {
  const tone = useTone();
  const { me } = useMe();
  const { data, loading } = useMyLevel();
  const [copied, setCopied] = useState(false);
  if (loading) return <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6"><div className="skeleton h-72 rounded-xl" /></div>;
  if (!data) return null;
  const link = data.invite.code ? inviteLink(data.invite.code) : null;
  const copy = async () => { if (!link) return; try { await navigator.clipboard.writeText(link); setCopied(true); toast.success("Invite link copied."); setTimeout(() => setCopied(false), 1500); } catch { toast.error("Couldn't copy the link."); } };
  const share = async () => { if (!link) return; try { if (navigator.share) await navigator.share({ title: "Ghosted", text: "Share how your hiring went, anonymously. Takes 30 seconds.", url: link }); else await copy(); } catch { /* cancelled */ } };
  const msg = encodeURIComponent("Been ghosted after an interview? Share how it went on Ghosted, anonymously. Takes 30 seconds.");
  const inviteXp = data.ways.find((w) => w.kind === "invite")?.xp ?? 120;
  const joinXp = data.ways.find((w) => w.kind === "invite_join")?.xp ?? 30;
  const toNext = Math.max(0, data.need - data.into);
  const friends = Math.ceil(toNext / Math.max(1, inviteXp + joinXp));

  return <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
    <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
      {/* Where you are. */}
      <div className="rounded-2xl border-2 border-foreground bg-card p-5 shadow-hard sm:p-7">
        <p className="text-sm font-bold text-primary">Your level</p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <div className="relative"><div className="[&_img]:size-20"><Avatar seed={me.avatarSeed} pastel={me.pastel} size="lg" label="You" /></div><LevelBadge level={data.level} size="sm" className="absolute -bottom-2 left-1/2 -translate-x-1/2" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-3xl font-bold leading-tight">{data.title}</h2>
            <p className="text-sm text-muted-foreground">{formatCount(data.xp)} XP total · next up: <span className="font-bold text-foreground">{data.nextTitle}</span></p>
          </div>
          <StreakChip streak={data.streak} activeToday={data.activeToday} />
        </div>
        <LevelProgress className="mt-5" level={data.level} into={data.into} need={data.need} />
        <p className="mt-3 rounded-lg border-2 border-foreground bg-accent p-3 text-sm font-semibold">
          <Zap className="mr-1 inline size-4 text-primary" />{voice(tone,
            friends <= 1 ? `One friend who shares their story gets you to LV ${data.level + 1}. That's the whole cheat code.` : `${friends} friends who share their stories would carry you to LV ${data.level + 1}. Or grind it out, we respect both.`,
            friends <= 1 ? `One invited friend who shares a story is enough to reach level ${data.level + 1}.` : `About ${friends} invited friends who share stories would take you to level ${data.level + 1}.`)}
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs"><Link to="/dashboard" search={{ view: "insights" }} className="inline-flex items-center gap-1 font-bold text-primary hover:underline"><TrendingUp className="size-3.5" />See today's checklist in Insights</Link></div>
      </div>

      {/* Your invite link. */}
      <div className="rounded-2xl border-2 border-foreground bg-card p-5 shadow-hard sm:p-7">
        <p className="text-sm font-bold text-primary">Your invite link</p>
        <h2 className="mt-1 font-display text-2xl font-bold">+{joinXp} XP when they join. +{inviteXp} XP when they share.</h2>
        <p className="mt-1 text-sm text-muted-foreground">At your level. The biggest boosts on Ghosted, and they help the next candidate too.</p>
        {link ? <>
          <div className="mt-5 flex min-w-0 items-center gap-2 rounded-xl border-2 border-foreground bg-background p-1.5 sm:p-2">
            <code className="min-w-0 flex-1 truncate px-2 font-mono text-xs sm:text-sm" title={link}>{link.replace(/^https?:\/\//, "")}</code>
            <Button className="min-h-10 shrink-0 px-3" onClick={() => void copy()} aria-label="Copy invite link">{copied ? <Check /> : <Copy />}<span className="hidden min-[380px]:inline">{copied ? "Copied" : "Copy"}</span></Button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button variant="outline" className="min-h-10" onClick={() => void share()}><Share2 />Share</Button>
            <Button variant="outline" className="min-h-10" asChild><a href={`https://wa.me/?text=${msg}%20${encodeURIComponent(link)}`} target="_blank" rel="noopener noreferrer"><MessageCircle />WhatsApp</a></Button>
            <Button variant="outline" className="min-h-10" asChild><a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`} target="_blank" rel="noopener noreferrer"><Linkedin />LinkedIn</a></Button>
            <Button variant="outline" className="min-h-10" asChild><a href={`https://twitter.com/intent/tweet?text=${msg}&url=${encodeURIComponent(link)}&hashtags=GhostedReceipts`} target="_blank" rel="noopener noreferrer"><Twitter />X</a></Button>
          </div>
        </> : <p className="mt-5 rounded-lg border-2 border-dashed border-foreground/30 p-4 text-sm text-muted-foreground">Your invite link is being set up. Check back in a moment.</p>}
        <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">{([["Joined", data.invite.joined], ["Shared", data.invite.voices], ["Stories", data.invite.stories], ["Relatable", data.invite.relatable]] as const).map(([k, v]) => <div key={k} className="rounded-lg border-2 border-foreground/15 p-3"><dt className="text-xs font-semibold text-muted-foreground">{k}</dt><dd className="font-display text-2xl font-bold tabular-nums">{formatCount(v)}</dd></div>)}</dl>
      </div>
    </div>
  </section>;
}

function InvitePage() {
  const { ref } = Route.useSearch();
  const { signedIn } = useMe();
  const tone = useTone();
  const { data } = useMyLevel(signedIn);
  const ways = WAYS.map((w) => ({ ...w, xp: data?.ways.find((x) => x.kind === w.id)?.xp ?? w.xp }));

  return <div className="min-h-screen overflow-hidden"><SiteHeader /><main>
    {ref && !signedIn ? <InvitedHero code={ref} /> : <section className="border-b-2 border-foreground">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-accent px-3 py-1 text-sm font-bold"><Flame className="size-4 text-flag-red" />Levels and streaks</p>
          <h1 className="text-5xl font-bold leading-[1.02] sm:text-6xl">Show up daily.<br /><span className="text-primary">Climb to red.</span></h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">{voice(tone,
            "Every story you read, react to and add earns XP. Keep your streak alive, watch your badge go from pale yellow to deep red, and bring friends for the biggest jumps. Seniority here is earned, not hired.",
            "Earn XP by reading, reacting, chitchatting, sharing your story, following and inviting. Keep a daily streak, and your level badge changes colour as you climb.")}</p>
          {!signedIn && <div className="mt-7 flex flex-wrap gap-3"><Button size="lg" className="min-h-12" asChild><Link to="/auth"><UserPlus />Join and start at LV 1</Link></Button><Button size="lg" variant="outline" className="min-h-12" asChild><Link to="/auth" search={{ tab: "login" }}>Log in</Link></Button></div>}
        </div>
        {/* Three badges, rising: the one moment of motion on the page. */}
        <div className="mx-auto flex items-end justify-center gap-4 sm:gap-6">
          {([[2, "size-14"], [14, "size-20"], [38, "size-28"]] as const).map(([l, s], i) => <motion.div key={l} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 * i, type: "spring", stiffness: 220, damping: 18 }} className="flex flex-col items-center gap-3">
            <div className={cn("grid place-items-center rounded-full border-2 border-foreground font-display font-bold shadow-hard", s, i === 2 ? "text-3xl" : i === 1 ? "text-xl" : "text-base")} style={{ background: levelColor(l).bg, color: levelColor(l).fg }}>{l}</div>
            <LevelBadge level={l} size="sm" title />
          </motion.div>)}
        </div>
      </div>
    </section>}

    {signedIn && <YourLevel />}

    {/* Six ways to earn. */}
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <p className="text-sm font-bold text-primary">How you earn</p>
      <h2 className="mt-1 text-4xl font-bold">Six ways to climb.</h2>
      <p className="mt-2 max-w-2xl text-muted-foreground">Each pays a few times a day, so the steady beat the grinders. {signedIn ? "Numbers shown are at your level." : "Numbers shown are at LV 1."}</p>
      <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{ways.map((w) => <li key={w.id} className={cn("flex items-start gap-4 rounded-xl border-2 border-foreground p-5", w.id === "invite" ? "bg-accent shadow-hard" : "bg-card shadow-hard-sm")}>
        <span className="grid size-11 shrink-0 place-items-center rounded-full border-2 border-foreground bg-card"><w.icon className="size-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2"><span className="font-display text-lg font-bold">{w.label}</span><span className="rounded-full border-2 border-foreground bg-card px-2 py-0.5 text-sm font-bold tabular-nums">+{w.xp}</span></span>
          <span className="mt-1 block text-sm text-muted-foreground">{w.how}</span>
          <span className="mt-2 block text-xs font-semibold text-muted-foreground">Up to {w.cap} a day</span>
        </span>
      </li>)}</ol>
      <div className="mt-6 flex items-start gap-3 rounded-xl border-2 border-foreground bg-card p-4">
        <Flame className="mt-0.5 size-5 shrink-0 text-flag-red" />
        <p className="text-sm"><span className="font-bold">The streak bonus.</span> Your first XP each day (India time) adds 5 XP plus 1 for every day of your streak, up to +35. Miss a day and it starts again from one. {voice(tone, "Consistency is the whole personality.", "")}</p>
      </div>
    </section>

    {/* The ladder. */}
    <section className="border-y-2 border-foreground bg-secondary py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="text-sm font-bold text-primary">The ladder</p>
        <h2 className="mt-1 text-4xl font-bold">From fresh face to myth.</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">Your badge shows on your profile, on every story you post, and on the preview card when someone shares your page. The redder it gets, the longer you've been showing up. Each level needs more XP than the last, and actions pay a little less as you rise, so the top really means something.</p>
        <div className="mt-8"><Ladder {...(data && { current: data.level })} /></div>
      </div>
    </section>

    {/* Invites, the shortcut. */}
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="text-sm font-bold text-primary">The shortcut</p>
          <h2 className="mt-1 text-4xl font-bold">One friend's story beats a week of scrolling.</h2>
          <p className="mt-2 text-muted-foreground">{voice(tone, "Reading earns you a couple of XP. A friend who joins and shares their story earns you 150. Do the maths, then do the inviting.", "An invited friend who joins and shares a story is worth about 150 XP at LV 1, more than a week of reading.")}</p>
        </div>
        <ol className="space-y-3">{[
          [Share2, "Send your link", "WhatsApp, LinkedIn, a group chat. Anyone who's been through a hiring process."],
          [UserPlus, "They join", `+30 XP for you, straight away${signedIn ? "" : " (once you have an account)"}.`],
          [PenLine, "They share their story", "+120 XP for you, and their first story gets them 50 XP and a streak of their own."],
        ].map(([Icon, title, copy], i) => { const I = Icon as LucideIcon; return <li key={title as string} className="flex items-start gap-4 rounded-xl border-2 border-foreground bg-card p-4 shadow-hard-sm">
          <span className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-foreground bg-accent font-display font-bold">{i + 1}</span>
          <span><span className="flex items-center gap-2 font-bold"><I className="size-4 text-primary" />{title as string}</span><span className="block text-sm text-muted-foreground">{copy as string}</span></span>
        </li>; })}</ol>
      </div>
    </section>

    <section className="border-t-2 border-foreground bg-foreground py-16 text-background">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-4 grid size-12 place-items-center rounded-xl border-2 border-background/50 bg-primary text-primary-foreground"><EyeOff /></div>
        <h2 className="text-4xl font-bold">Fair play, and your privacy.</h2>
        <dl className="mt-8 grid gap-6 md:grid-cols-2">{[
          ["Can I farm XP?", "No. Each kind of action pays only a few times a day, the same story, reaction or follow never pays twice, and un-reacting and re-reacting earns nothing."],
          ["What do other people see?", "Your level badge and its title. Never your XP, your streak, or what you did to earn them."],
          ["Does the person I invite see who I am?", "Only your public handle, avatar and level, the same thing anyone sees on your stories. Never your name or email."],
          ["Is there money involved?", voice(tone, "Nope. Paying for stories is how review sites lose trust. We'd rather keep ours.", "No. Paying for referrals invites fake stories, so rewards are levels only.")],
          ["Can I invite myself?", "Invites from your own connection aren't counted, and every story still goes through Goofy's checks."],
          ["Will I get spammed about levels?", "One notification and one email per level up. You can turn the emails off in Settings → Notifications."],
        ].map(([q, a]) => <div key={q}><dt className="font-display text-lg font-bold">{q}</dt><dd className="mt-1 text-background/75">{a}</dd></div>)}</dl>
      </div>
    </section>
  </main><SiteFooter /></div>;
}
