// Goofy's profile: the AutoMod's banner and badge, a follow button (official accounts have no bell
// and can't be reported or muted), what he's been doing, and his numbers on the right (a swipeable
// strip on phones and tablets).
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Charts } from "@/components/lazy-charts";
import {
  Archive, BadgeCheck, Bot, CalendarDays, CheckCircle2, EyeOff, Flag, Ghost, Hourglass, Loader2, PartyPopper, PauseCircle, PenLine, RefreshCw, RotateCcw, ShieldCheck,
  ShieldX, Siren, Sparkles, Trash2, TriangleAlert, UserCheck, UserPlus, Users, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiRequestError } from "@/lib/api";
import { timeAgo } from "@/lib/stories";
import { GOOFY_AVATAR, useGoofyActivity, type GoofyActivity, type GoofyStats } from "@/lib/goofy";
import type { PersonPage, usePerson } from "@/lib/people";
import { useReachEnd } from "@/lib/feed";
import { cn, formatCount } from "@/lib/utils";
import { axis, barCursor, ChartTooltip, grid } from "./chart-kit";
import { card } from "./ui-kit";

const nf = formatCount;

// Violet like his portrait, with his cream sparkles and rings scattered across.
function GoofyBanner({ className }: { className?: string }) {
  return <div className={cn("relative overflow-hidden bg-[#6a2ee0]", className)} aria-hidden="true">
    <svg className="absolute inset-0 size-full" preserveAspectRatio="xMidYMid slice" viewBox="0 0 800 160">
      <defs><radialGradient id="goofy-glow" cx="70%" cy="40%" r="70%"><stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.55" /><stop offset="100%" stopColor="#6a2ee0" stopOpacity="0" /></radialGradient></defs>
      <rect width="800" height="160" fill="url(#goofy-glow)" />
      {[[90, 40, 1], [250, 110, 0.7], [430, 30, 0.9], [610, 120, 1.1], [730, 45, 0.8], [520, 80, 0.6], [170, 130, 0.5]].map(([x, y, s], i) => <path key={i} transform={`translate(${x} ${y}) scale(${s})`} d="M0 -14 C2 -4 4 -2 14 0 C4 2 2 4 0 14 C-2 4 -4 2 -14 0 C-4 -2 -2 -4 0 -14Z" fill="none" stroke="#f6efe0" strokeWidth="2.5" strokeLinejoin="round" />)}
      {[[340, 60, 7], [680, 85, 6], [40, 100, 5], [560, 35, 4]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="none" stroke="#f6efe0" strokeWidth="2.5" />)}
      {([[300, 25], [470, 130], [780, 110], [130, 75]] as const).map(([x, y], i) => <g key={i} stroke="#f6efe0" strokeWidth="3" strokeLinecap="round"><line x1={x} y1={y} x2={x + 10} y2={y - 12} /><line x1={x + 14} y1={y + 2} x2={x + 26} y2={y - 2} /></g>)}
    </svg>
  </div>;
}

export function GoofyHeader({ page, actions }: { page: PersonPage; actions: React.ReactNode }) {
  const p = page.profile, g = page.goofy!;
  const tiles: [string, number, LucideIcon, string?][] = [
    ["Actions", g.actions, Sparkles],
    ["Removed", g.removed, Trash2, "text-flag-red"],
    ["Held for a check", g.held, Hourglass],
    ["Reports filed", g.reportsFiled, Flag],
    ["Followers", g.followers, Users],
  ];
  return <section className={cn(card, "overflow-hidden")}>
    <GoofyBanner className="h-24 border-b-2 border-foreground sm:h-32" />
    <div className="px-4 pb-5 sm:px-6">
      <div className="-mt-10 flex flex-wrap items-end justify-between gap-3 sm:-mt-12">
        <div className="relative z-10 rounded-full bg-card p-1"><img src={GOOFY_AVATAR} alt="Goofy, the AutoMod robot" className="size-20 rounded-full border-2 border-foreground object-cover sm:size-24" /></div>
        <div className="flex flex-wrap items-center gap-2 pb-1">{actions}</div>
      </div>
      <div className="mt-3 min-w-0">
        <h1 className="flex flex-wrap items-center gap-2 font-display text-2xl font-bold sm:text-3xl">{p.name}<BadgeCheck className="size-6 text-primary" aria-label="Official account" /></h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-full border-2 border-foreground bg-primary px-2 py-0.5 text-[11px] font-bold uppercase text-primary-foreground"><Bot className="size-3.5" />{p.bot?.badge ?? "AutoMod"}</span>
          <span className="inline-flex items-center gap-1"><ShieldCheck className="size-3.5" />Official account</span>
          <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" />On duty 24×7</span>
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed">{p.bot?.bio}</p>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2 min-[420px]:grid-cols-3 md:grid-cols-5">{tiles.map(([label, n, Icon, tone]) => <div key={label} className="rounded-lg border-2 border-foreground bg-background p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-muted-foreground"><Icon className={cn("size-3.5", tone)} /><span className="truncate">{label}</span></p>
        <p className={cn("mt-1 font-display text-2xl font-bold tabular-nums", tone)}>{nf(n)}</p>
      </div>)}</div>
    </div>
  </section>;
}

// Follow only: no bell, no mute, no report for the official AutoMod.
export function GoofyFollow({ page, person }: { page: PersonPage; person: ReturnType<typeof usePerson> }) {
  const [busy, setBusy] = useState(false);
  const following = page.relationship?.following ?? false;
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); }
    catch (err) { toast.error(err instanceof ApiRequestError && err.status === 401 ? "Log in to follow Goofy." : err instanceof ApiRequestError ? err.message : "Couldn't save that. Try again."); }
    finally { setBusy(false); }
  };
  if (!page.relationship && !page.profile.isMe) return <Button asChild><Link to="/auth"><UserPlus />Follow</Link></Button>;
  return following
    ? <Button variant="outline" disabled={busy} onClick={() => void run(person.unfollow, "Unfollowed Goofy. He'll keep watching anyway.")} className="group"><span className="contents group-hover:hidden">{busy ? <Loader2 className="animate-spin" /> : <UserCheck />}Following</span><span className="hidden group-hover:contents"><UserPlus className="rotate-45" />Unfollow</span></Button>
    : <Button disabled={busy} onClick={() => void run(person.follow, "Following Goofy. His weekly report will land in your notifications.")}>{busy ? <Loader2 className="animate-spin" /> : <UserPlus />}Follow</Button>;
}

const ICON: Record<string, [LucideIcon, string]> = {
  removed_story: [Trash2, "bg-flag-red text-primary-foreground"], removed_chitchat: [Trash2, "bg-flag-red text-primary-foreground"], took_down: [ShieldX, "bg-flag-red text-primary-foreground"],
  held: [Hourglass, "bg-flag-amber"], released: [CheckCircle2, "bg-flag-green text-primary-foreground"], redacted: [EyeOff, "bg-accent"], restored: [RotateCcw, "bg-flag-green text-primary-foreground"],
  reported_story: [Flag, "bg-primary text-primary-foreground"], reported_chitchat: [Flag, "bg-primary text-primary-foreground"], reported_company: [Flag, "bg-primary text-primary-foreground"],
  asked_rephrase: [PenLine, "bg-accent"], warned: [TriangleAlert, "bg-flag-amber"], paused: [PauseCircle, "bg-flag-amber"], welcomed: [PartyPopper, "bg-accent"],
  ghost_job_alert: [Ghost, "bg-primary text-primary-foreground"], dismissed_reports: [Archive, "bg-muted"], escalated: [Siren, "bg-flag-red text-primary-foreground"],
  lists_updated: [RefreshCw, "bg-muted"], learned: [Sparkles, "bg-muted"],
};

export function GoofyActivityFeed({ page }: { page: PersonPage }) {
  const feed = useGoofyActivity(page.activity, page.activityCursor);
  const sentinel = useReachEnd(feed.loadMore, feed.hasMore);
  return <section>
    <div className="mb-4"><p className="text-xs font-bold uppercase text-primary">On duty</p><h2 className="text-2xl font-bold">What Goofy's been doing</h2><p className="text-sm text-muted-foreground">Every action he takes, as it happens. Never who it was about.</p></div>
    {feed.items.length ? <ol className={cn(card, "divide-y-2 divide-foreground/10 overflow-hidden")}>{feed.items.map((a: GoofyActivity, i) => {
      const [Icon, tone] = ICON[a.action] ?? [Sparkles, "bg-muted"];
      const body = <div className="flex items-start gap-3 px-4 py-3">
        <span className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg border-2 border-foreground", tone)}><Icon className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{a.label}</p>
          {a.reason && <p className="truncate text-sm text-muted-foreground">{a.reason}</p>}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(a.createdAt)}</span>
      </div>;
      return <motion.li key={a.publicId} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }}>
        {a.storyPublicId ? <Link to="/s/$id" params={{ id: a.storyPublicId }} className="block hover:bg-muted/60">{body}</Link>
          : a.companySlug ? <Link to="/c/$slug" params={{ slug: a.companySlug }} className="block hover:bg-muted/60">{body}</Link> : body}
      </motion.li>;
    })}</ol> : <div className="rounded-xl border-2 border-dashed border-foreground/40 p-10 text-center"><p className="font-display text-xl font-bold">All quiet</p><p className="mt-2 text-sm text-muted-foreground">Nothing to moderate yet. Goofy is enjoying the peace.</p></div>}
    {feed.loadingMore && <div className="mt-3 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14 rounded-lg" />)}</div>}
    <div ref={sentinel} aria-hidden="true" />
  </section>;
}

const RULES: [LucideIcon, string][] = [
  [Trash2, "Removes vulgar posts, slurs and threats on the spot"],
  [EyeOff, "Hides people's names, phone numbers and IDs"],
  [PenLine, "Asks for accusations to be told as experiences"],
  [Hourglass, "Holds spam and abuse for a check, then decides"],
  [Flag, "Reports what needs a human, before anyone asks"],
  [PauseCircle, "Three removals in 30 days: a 3-day posting pause"],
  [Ghost, "Warns followers when a company piles up ghost jobs"],
  [RefreshCw, "Refreshes and learns his word lists every day"],
];

export function GoofyRail({ stats, layout = "column" }: { stats: GoofyStats; layout?: "column" | "strip" }) {
  const strip = layout === "strip";
  const weekly = stats.weekly.map((w) => ({ ...w, label: new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(w.week)) }));
  const maxReason = Math.max(1, ...stats.reasons.map((r) => r.count));
  const box = (extra?: string) => cn(card, "p-5", strip && "flex flex-col", extra);
  return <aside aria-label="Goofy's stats" className={strip
    ? "-mx-4 flex items-stretch snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6 no-scrollbar [&>*]:w-[84%] [&>*]:shrink-0 [&>*]:snap-start sm:[&>*]:w-[46%] md:[&>*]:w-[40%]"
    : "space-y-5"}>
    <div className={box()}>
      <h3 className="font-bold">His week, every week</h3>
      <p className="text-xs text-muted-foreground">Removed, held and reported, last 8 weeks</p>
      {/* Fixed height in the swipe strip too: stretching to the tallest card made the chart a tower. */}
      <div className="mt-3 h-40"><Charts>{(R) => <R.ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
        <R.BarChart data={weekly} margin={{ left: 0, right: 4, top: 4, bottom: 0 }}>
          <R.CartesianGrid {...grid} />
          <R.XAxis dataKey="label" {...axis} tick={{ ...axis.tick, fontSize: 9 }} interval="preserveStartEnd" />
          <R.YAxis {...axis} allowDecimals={false} width={28} />
          <R.Tooltip cursor={barCursor} content={<ChartTooltip />} />
          <R.Bar dataKey="removed" name="Removed" stackId="a" fill="var(--flag-red)" />
          <R.Bar dataKey="held" name="Held" stackId="a" fill="var(--flag-amber)" />
          <R.Bar dataKey="reported" name="Reported" stackId="a" fill="var(--chart-violet)" radius={[4, 4, 0, 0]} />
        </R.BarChart>
      </R.ResponsiveContainer>}</Charts></div>
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-semibold text-muted-foreground">{[["Removed", "var(--flag-red)"], ["Held", "var(--flag-amber)"], ["Reported", "var(--chart-violet)"]].map(([l, c]) => <span key={l} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm border border-foreground" style={{ background: c }} />{l}</span>)}</div>
    </div>

    <div className={box()}>
      <h3 className="font-bold">What he catches most</h3>
      <p className="text-xs text-muted-foreground">Reasons for removals and holds, last 8 weeks</p>
      {stats.reasons.length ? <ul className="mt-3 space-y-2.5">{stats.reasons.map((r, i) => <li key={r.reason}>
        <div className="flex justify-between gap-2 text-xs font-semibold"><span className="truncate first-letter:uppercase">{r.reason}</span><span className="tabular-nums">{r.count}</span></div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><motion.div initial={{ width: 0 }} animate={{ width: `${(r.count / maxReason) * 100}%` }} transition={{ delay: i * 0.05, duration: 0.5 }} className={cn("h-full rounded-full", i === 0 ? "bg-flag-red" : "bg-primary")} /></div>
      </li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">Nothing caught yet.</p>}
    </div>

    <div className={box()}>
      <h3 className="font-bold">How often he's right</h3>
      <p className="text-xs text-muted-foreground">His reports that held up after review</p>
      <p className="mt-2 font-display text-4xl font-bold tabular-nums">{stats.accuracy != null ? `${stats.accuracy}%` : "–"}</p>
      <p className="text-xs text-muted-foreground">{stats.reportsDecided ? `of ${nf(stats.reportsDecided)} decided reports` : "Waiting for his first reports to be decided"}</p>
      <div className="mt-auto grid grid-cols-2 gap-2 pt-4 text-center">
        <div className="rounded-lg border-2 border-foreground bg-background p-2"><p className="font-display text-xl font-bold tabular-nums">{nf(stats.released)}</p><p className="text-[11px] text-muted-foreground">released or restored</p></div>
        <div className="rounded-lg border-2 border-foreground bg-background p-2"><p className="font-display text-xl font-bold tabular-nums">{nf(stats.wordsWatched)}</p><p className="text-[11px] text-muted-foreground">words he watches</p></div>
      </div>
    </div>

    <div className={box()}>
      <h3 className="font-bold">What Goofy does</h3>
      <ul className="mt-3 space-y-2.5">{RULES.map(([Icon, text]) => <li key={text} className="flex items-start gap-2.5 text-sm"><span className="grid size-7 shrink-0 place-items-center rounded-md border-2 border-foreground bg-accent"><Icon className="size-3.5" /></span><span className="pt-0.5">{text}</span></li>)}</ul>
      <p className="mt-auto pt-4 text-xs text-muted-foreground">Welcomed {nf(stats.welcomed)} new members so far.</p>
    </div>
  </aside>;
}
