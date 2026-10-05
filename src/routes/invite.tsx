import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { ArrowRight, Check, Copy, EyeOff, Gift, Linkedin, Lock, MessageCircle, PenLine, Share2, ShieldCheck, Sparkles, Target, Twitter, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ghosted";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { api, apiEnabled, track } from "@/lib/api";
import { FLAIR_GRADIENT, FlairRing, inviteLink, rememberRef, useInvite, VOICE_TIERS, type FlairId } from "@/lib/invite";
import { pageHead } from "@/lib/meta";
import { useMe, useTone, voice } from "@/lib/session";
import { cn, formatCount } from "@/lib/utils";

// /invite: how inviting works, your link and progress (signed in), and the landing for people who
// open someone's invite link (?ref=CODE). Rewards unlock only when the invited person shares a story.
export const Route = createFileRoute("/invite")({
  validateSearch: (s: Record<string, unknown>): { ref?: string } => (typeof s["ref"] === "string" && /^[A-Za-z2-9]{8}$/.test(s["ref"]) ? { ref: s["ref"].toUpperCase() } : {}),
  head: () => pageHead({ title: "Invite friends to Ghosted | Bring a voice, level up", description: "Invite someone who's been through a hiring process. When they share their experience, you both reach Invite Level 1, and every friend after that levels you up. Anonymous, no money, no spam.", path: "/invite" }),
  component: InvitePage,
});

// Invite levels: a bigger, brighter avatar ring at 1, 3 and 10 voices.
const LEVELS: { level: number; id: FlairId; voices: number; perk: string }[] = [
  { level: 1, id: "sunrise", voices: 1, perk: "Your first avatar ring, shown on every story and your page" },
  { level: 2, id: "gold", voices: 3, perk: "A gold ring, and “Brought 3 voices” on your page (just the count, never who)" },
  { level: 3, id: "cosmic", voices: 10, perk: "The rarest ring on Ghosted, and a personal thank-you from Goofy" },
];
const FLAIR_INFO: { id: FlairId; label: string; how: string }[] = [
  ...LEVELS.map((l) => ({ id: l.id, label: `Invite Level ${l.level}`, how: l.voices === 1 ? "Bring your first voice, or join through an invite and share" : `Bring ${l.voices} voices` })),
  { id: "violet", label: "Missions ring", how: "Complete 3 missions" },
  { id: "mint", label: "All missions ring", how: "Complete all 6 missions" },
];

// What each side gets, said plainly, right under the hero.
function WhatYouGet() {
  return <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
    <p className="text-sm font-bold text-primary">What you get</p>
    <h2 className="mt-1 text-4xl font-bold">Every friend who shares levels you up.</h2>
    <p className="mt-2 max-w-2xl text-muted-foreground">A friend counts once they publish their first story (a quick one takes about 30 seconds). Then you both get something.</p>
    <div className="mt-8 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <div className="rounded-2xl border-2 border-foreground bg-card p-5 shadow-hard sm:p-6">
        <p className="flex items-center gap-2 font-display text-xl font-bold"><Gift className="size-5 text-primary" />You, for inviting</p>
        <ol className="mt-4 space-y-3">{LEVELS.map((l) => <li key={l.level} className="flex items-center gap-4 rounded-xl border-2 border-foreground/15 p-3">
          <FlairRing flair={l.id}><span className="grid size-12 place-items-center rounded-full bg-card font-display text-lg font-bold">{l.level}</span></FlairRing>
          <span className="min-w-0 flex-1"><span className="block font-bold">Invite Level {l.level} <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-bold">{l.voices} {l.voices === 1 ? "voice" : "voices"}</span></span><span className="block text-sm text-muted-foreground">{l.perk}</span></span>
        </li>)}</ol>
        <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">{["A notification every time a friend's story goes live", "Your impact: how many people found their stories relatable", "Counts toward the “Bring a voice” mission", "Nobody, including your friend, learns who you are"].map((t) => <li key={t} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-flag-green" />{t}</li>)}</ul>
      </div>
      <div className="rounded-2xl border-2 border-foreground bg-accent p-5 shadow-hard sm:p-6">
        <p className="flex items-center gap-2 font-display text-xl font-bold"><UserPlus className="size-5" />Your friend, for joining</p>
        <div className="mt-4 flex items-center gap-4 rounded-xl border-2 border-foreground bg-card p-3">
          <FlairRing flair="sunrise"><span className="grid size-12 place-items-center rounded-full bg-card font-display text-lg font-bold">1</span></FlairRing>
          <span><span className="block font-bold">Invite Level 1, straight away</span><span className="block text-sm text-muted-foreground">The ring unlocks the moment their first story is published</span></span>
        </div>
        <ul className="mt-4 space-y-2 text-sm">{["Share in about 30 seconds: tap a few answers, no writing needed", "Anonymous from the start: no name, no company email", "Their story helps the next candidate know what to expect", "Missions to unlock more rings as they explore"].map((t) => <li key={t} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-flag-green" />{t}</li>)}</ul>
      </div>
    </div>
  </section>;
}

function InvitedHero({ code }: { code: string }) {
  const q = useQuery({ queryKey: ["invite-lookup", code], queryFn: () => api<{ valid: boolean; inviter?: { handle: string; avatarSeed: string; pastel: string } }>(`/v1/invite/${code}`), enabled: apiEnabled, retry: false });
  useEffect(() => { rememberRef(code); track("invite_open"); }, [code]);
  const inv = q.data?.valid ? q.data.inviter : null;
  return <section className="border-b-2 border-foreground bg-accent">
    <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-14 sm:px-6 md:grid-cols-[auto_1fr]">
      <motion.div initial={{ scale: 0.6, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 240, damping: 14 }} className="justify-self-center">
        {inv ? <FlairRing flair="sunrise"><div className="[&_img]:size-28"><Avatar seed={inv.avatarSeed} pastel={inv.pastel} size="lg" label={inv.handle} /></div></FlairRing> : <img src="/ghosted-mark.png" alt="" className="size-28 object-contain" />}
      </motion.div>
      <div>
        <p className="text-sm font-bold text-primary">You've been invited</p>
        <h1 className="mt-1 text-4xl font-bold leading-tight sm:text-5xl">{inv ? <>{inv.handle} thinks your story matters.</> : <>Someone thinks your story matters.</>}</h1>
        <p className="mt-3 max-w-xl text-lg text-muted-foreground">Ghosted is where candidates share how hiring really went, anonymously. Join, share your experience in about 30 seconds, and you'll both reach Invite Level 1.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button size="lg" className="min-h-12" asChild><Link to="/auth" search={{ intent: "share" }}><UserPlus />Join and share<ArrowRight /></Link></Button>
          <Button size="lg" variant="outline" className="min-h-12" asChild><Link to="/">See what Ghosted is</Link></Button>
        </div>
        <p className="mt-3 flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-flag-green" />{inv ? `${inv.handle} never sees who you are.` : "Nobody sees who you are."} No name, no company email.</p>
      </div>
    </div>
  </section>;
}

function YourInvite() {
  const tone = useTone();
  const { data, loading, setFlair } = useInvite();
  const [copied, setCopied] = useState(false);
  if (loading) return <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6"><div className="skeleton h-64 rounded-xl" /></div>;
  if (!data) return null;
  const link = data.code ? inviteLink(data.code) : null;
  const copy = async () => { if (!link) return; try { await navigator.clipboard.writeText(link); setCopied(true); toast.success("Invite link copied."); setTimeout(() => setCopied(false), 1500); } catch { toast.error("Couldn't copy the link."); } };
  const share = async () => { if (!link) return; try { if (navigator.share) await navigator.share({ title: "Ghosted", text: "Share how your hiring went, anonymously. Takes 30 seconds.", url: link }); else await copy(); } catch { /* cancelled */ } };
  const next = VOICE_TIERS.find((t) => data.voices < t) ?? null;
  const prev = [...VOICE_TIERS].reverse().find((t) => data.voices >= t) ?? 0;
  const pct = next ? ((data.voices - prev) / (next - prev)) * 100 : 100;
  const msg = encodeURIComponent("Been ghosted after an interview? Share how it went on Ghosted, anonymously. Takes 30 seconds.");

  return <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
    <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
      <div className="rounded-2xl border-2 border-foreground bg-card p-5 shadow-hard sm:p-7">
        <p className="text-sm font-bold text-primary">Your invite</p>
        <h2 className="mt-1 font-display text-3xl font-bold">{data.voices ? `${formatCount(data.voices)} ${data.voices === 1 ? "voice" : "voices"} brought in` : "Bring your first voice"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{data.voices >= 1 && <span className="mr-1 rounded-full border-2 border-foreground bg-accent px-2 py-0.5 text-xs font-bold text-foreground">Invite Level {data.voices >= 10 ? 3 : data.voices >= 3 ? 2 : 1}</span>}{next ? `${next - data.voices} more ${next - data.voices === 1 ? "voice" : "voices"} to reach Invite Level ${VOICE_TIERS.indexOf(next) + 1}.` : "You're at the top level. Thank you."}</p>
        {link ? <>
          {/* One row at every width: the link shortens with an ellipsis instead of pushing Copy onto its own line. */}
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
        <div className="mt-6">
          <div className="flex justify-between text-xs font-semibold text-muted-foreground"><span>{prev} {prev === 1 ? "voice" : "voices"}</span>{next && <span>{next} voices</span>}</div>
          <div className="relative mt-1 h-3 rounded-full border-2 border-foreground bg-muted"><motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${pct}%` }} /><span className="absolute top-1/2 size-4 -translate-y-1/2 rounded-full border-2 border-foreground bg-card" style={{ left: `calc(${pct}% - 8px)` }} /></div>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">{([["Joined", data.joined], ["Voices", data.voices], ["Stories", data.stories], ["Relatable", data.relatable]] as const).map(([k, v]) => <div key={k} className="rounded-lg border-2 border-foreground/15 p-3"><dt className="text-xs font-semibold text-muted-foreground">{k}</dt><dd className="font-display text-2xl font-bold tabular-nums">{formatCount(v)}</dd></div>)}</dl>
      </div>

      <div className="rounded-2xl border-2 border-foreground bg-card p-5 shadow-hard sm:p-7">
        <p className="text-sm font-bold text-primary">Your rings</p>
        <h2 className="mt-1 font-display text-2xl font-bold">Pick your avatar ring</h2>
        <p className="mt-1 text-sm text-muted-foreground">It shows on your stories and your page. Nothing else about you changes.</p>
        <ul className="mt-4 space-y-2">
          <li><button type="button" onClick={() => void setFlair(null).then(() => toast.success("Flair off."), () => toast.error("Couldn't save that."))} aria-pressed={!data.flair} className={cn("flex min-h-12 w-full items-center gap-3 rounded-lg border-2 px-3 text-left text-sm font-bold", !data.flair ? "border-foreground bg-muted" : "border-foreground/15 hover:border-foreground")}><span className="size-8 rounded-full border-2 border-dashed border-foreground/40" />No flair</button></li>
          {data.flairs.map((f) => <li key={f.id}><button type="button" disabled={!f.unlocked} onClick={() => void setFlair(f.id).then(() => toast.success(`${f.label} flair on.`), () => toast.error("Couldn't save that."))} aria-pressed={data.flair === f.id}
            className={cn("flex min-h-12 w-full items-center gap-3 rounded-lg border-2 px-3 text-left disabled:cursor-not-allowed", data.flair === f.id ? "border-foreground bg-accent shadow-hard-sm" : f.unlocked ? "border-foreground/15 hover:border-foreground" : "border-foreground/10 opacity-60")}>
            <span className="size-8 shrink-0 rounded-full" style={{ background: FLAIR_GRADIENT[f.id] }} />
            <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{f.label}</span><span className="block truncate text-xs text-muted-foreground">{f.how}</span></span>
            {f.unlocked ? (data.flair === f.id && <Check className="size-4" />) : <Lock className="size-4 text-muted-foreground" />}
          </button></li>)}
        </ul>
      </div>
    </div>
  </section>;
}

function InvitePage() {
  const { ref } = Route.useSearch();
  const { signedIn, me } = useMe();
  const tone = useTone();
  return <div className="min-h-screen overflow-hidden"><SiteHeader /><main>
    {ref && !signedIn ? <InvitedHero code={ref} /> : <section className="border-b-2 border-foreground">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-accent px-3 py-1 text-sm font-bold"><Gift className="size-4" />Invites</p>
          <h1 className="text-5xl font-bold leading-[1.02] sm:text-6xl">Bring a voice.<br /><span className="text-primary">Level up together.</span></h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">Know someone who's been ghosted, rejected or surprised by an offer? Invite them. When they share their experience, you both unlock Invite Level 1, and every friend after that takes you higher.</p>
          {!signedIn && <div className="mt-7 flex flex-wrap gap-3"><Button size="lg" className="min-h-12" asChild><Link to="/auth"><UserPlus />Join to get your link</Link></Button><Button size="lg" variant="outline" className="min-h-12" asChild><Link to="/auth" search={{ tab: "login" }}>Log in</Link></Button></div>}
        </div>
        {/* The level ladder, as the rings people will actually see: bigger at each level. */}
        <div className="mx-auto flex items-end justify-center gap-4 sm:gap-8">
          {LEVELS.map((l, i) => <motion.div key={l.level} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 * i, type: "spring", stiffness: 220, damping: 18 }} className="flex flex-col items-center gap-2 text-center">
            <FlairRing flair={l.id}><div className={cn(i === 0 ? "[&_img]:size-14" : i === 1 ? "[&_img]:size-20" : "[&_img]:size-28")}><Avatar seed={`${me.avatarSeed}-lvl${l.level}`} pastel={["bg-avatar-amber", "bg-avatar-sky", "bg-avatar-lilac"][i]!} size="lg" label={`Invite Level ${l.level}`} /></div></FlairRing>
            <span className="rounded-full border-2 border-foreground bg-card px-2.5 py-0.5 text-xs font-bold">Level {l.level}</span>
            <span className="text-xs text-muted-foreground">{l.voices} {l.voices === 1 ? "voice" : "voices"}</span>
          </motion.div>)}
        </div>
      </div>
    </section>}

    {signedIn && <YourInvite />}
    <WhatYouGet />

    <section className="border-y-2 border-foreground bg-secondary py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="text-sm font-bold text-primary">How it works</p>
        <h2 className="mt-1 text-4xl font-bold">Three steps, no strings.</h2>
        <ol className="mt-8 grid gap-5 md:grid-cols-3">{[
          [Share2, "Share your link", "Copy your personal invite link and send it to a friend, a group chat, or post it with #GhostedReceipts."],
          [PenLine, "They join and share", "They sign up anonymously and share their hiring experience. A quick story takes about 30 seconds."],
          [Sparkles, "You both level up", "Once their story is published, it counts as a voice. You reach Invite Level 1, and so do they. 3 voices is Level 2, 10 is Level 3."],
        ].map(([Icon, title, copy], i) => { const I = Icon as typeof Share2; return <li key={title as string} className="rounded-xl border-2 border-foreground bg-card p-6 shadow-hard-sm">
          <span className="grid size-11 place-items-center rounded-full border-2 border-foreground bg-accent font-display font-bold">{i + 1}</span>
          <I className="mt-4 size-6 text-primary" />
          <h3 className="mt-2 text-xl font-bold">{title as string}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{copy as string}</p>
        </li>; })}</ol>
      </div>
    </section>

    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <p className="text-sm font-bold text-primary">The rewards</p>
          <h2 className="mt-1 text-4xl font-bold">Flair you earn, not buy.</h2>
          <p className="mt-2 text-muted-foreground">A coloured ring around your avatar on every story and on your page. It says you helped Ghosted grow, without saying anything about who you are.</p>
          <ul className="mt-6 space-y-3">{FLAIR_INFO.map((f) => <li key={f.id} className="flex items-center gap-3 rounded-xl border-2 border-foreground/15 p-3">
            <span className="size-10 shrink-0 rounded-full" style={{ background: FLAIR_GRADIENT[f.id] }} />
            <span><span className="block font-bold">{f.label}</span><span className="block text-sm text-muted-foreground">{f.how}</span></span>
          </li>)}</ul>
        </div>
        <div>
          <p className="text-sm font-bold text-primary">Missions</p>
          <h2 className="mt-1 text-4xl font-bold">Six small things that keep Ghosted useful.</h2>
          <p className="mt-2 text-muted-foreground">Your dashboard tracks them. Three unlocks the Missions ring, all six unlocks the All missions ring.</p>
          <ol className="mt-6 grid gap-2 sm:grid-cols-2">{[[PenLine, "Share your first story"], [Sparkles, "React to 3 stories"], [MessageCircle, "Leave a chitchat"], [Users, "Follow a company"], [Target, "Track an application"], [Gift, "Bring a voice"]].map(([Icon, label]) => { const I = Icon as typeof PenLine; return <li key={label as string} className="flex items-center gap-3 rounded-lg border-2 border-foreground/15 p-3 text-sm font-bold"><span className="grid size-9 place-items-center rounded-full border-2 border-foreground bg-accent"><I className="size-4" /></span>{label as string}</li>; })}</ol>
        </div>
      </div>
    </section>

    <section className="border-t-2 border-foreground bg-foreground py-16 text-background">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-4 grid size-12 place-items-center rounded-xl border-2 border-background/50 bg-primary text-primary-foreground"><EyeOff /></div>
        <h2 className="text-4xl font-bold">Fair play, and your privacy.</h2>
        <dl className="mt-8 grid gap-6 md:grid-cols-2">{[
          ["Does the person I invite see who I am?", "Only your public handle and avatar, the same thing anyone sees on your stories. Never your name, email or anything else."],
          ["Do I see who joined with my link?", "No. You see numbers: how many joined, how many shared, and how many people found those stories relatable."],
          ["Why only when they share a story?", "Because sign-ups alone don't help the next candidate. Counting only published stories also stops fake accounts."],
          ["Is there money involved?", voice(tone, "Nope. Paying for stories is how review sites lose trust. We'd rather keep ours.", "No. Paying for referrals invites fake stories, so rewards are levels and avatar rings only.")],
          ["Can I invite myself?", "Invites from your own connection aren't counted, and every story still goes through Goofy's checks."],
          ["What if I already have an account?", "Invite links are for new members. Your existing account keeps everything it has."],
        ].map(([q, a]) => <div key={q}><dt className="font-display text-lg font-bold">{q}</dt><dd className="mt-1 text-background/75">{a}</dd></div>)}</dl>
      </div>
    </section>
  </main><SiteFooter /></div>;
}
