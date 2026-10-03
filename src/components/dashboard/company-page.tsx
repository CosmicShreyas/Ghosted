// A company's page: who they are, the Flag Score meter, what people say (positive vs critical),
// the best and worst experiences, actions (follow, bell, share a story here, report the listing),
// and their stats rail (column on desktop, swipeable strip on phones and tablets).
import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, Bell, BellRing, Briefcase, CalendarDays, Check, ExternalLink, Flag, Globe, HeartHandshake, Loader2, MapPin, MessageCircle, MoreHorizontal, PenLine, ShieldAlert, ThumbsDown, ThumbsUp, UserCheck, UserPlus, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { CompanyMark, FlagScore, ScoreMeters } from "@/components/ghosted";
import { StoryBody } from "@/components/markdown";
import { BrandBanner } from "@/components/brand-banner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { ApiRequestError } from "@/lib/api";
import type { CompanyPage, CompanyStats, useCompanyPage } from "@/lib/companies";
import { useTone, voice } from "@/lib/session";
import { isRated, OUTCOME_LABEL, type StoryModel } from "@/lib/stories";
import { cn, formatCount } from "@/lib/utils";
import { activeDot, axis, barCursor, ChartTooltip, grid, INK, lineCursor } from "./chart-kit";
import { INDUSTRY_LABEL } from "./global-widgets";
import { card, popup, popupBody } from "./ui-kit";

const nf = formatCount;
const STAGE: Record<string, string> = { application: "Applied", screening: "Screen", technical: "Technical", final: "Final", offer: "Offer" };
const OUTCOME_TONE: Record<string, string> = { ghosted: "var(--flag-red)", ghost_job: "var(--flag-red)", offer_revoked: "var(--flag-red)", rejected: "var(--flag-amber)", offer: "var(--flag-green)" };
const SHORT: Record<string, string> = { ghosted: "Ghosted", rejected: "Rejected", offer: "Offer", offer_revoked: "Revoked", ghost_job: "Fake job" };

type Hook = ReturnType<typeof useCompanyPage>;

// ---------- header ----------

export function CompanyHeader({ page, actions }: { page: CompanyPage; actions: ReactNode }) {
  const { company: c, stats: s } = page;
  const rated = isRated(c);
  const facts = [
    c.industry && { icon: Briefcase, text: INDUSTRY_LABEL[c.industry] ?? c.industry },
    c.size && { icon: Users, text: `${c.size} people` },
    c.hqCity && { icon: MapPin, text: c.hqCity },
    c.founded && { icon: CalendarDays, text: `Since ${c.founded}` },
  ].filter(Boolean) as { icon: typeof MapPin; text: string }[];
  const tiles: [string, number, typeof Users, string?][] = [
    ["Stories", s.stories, PenLine], ["Relatable", s.relatableReceived, HeartHandshake], ["Red flags", s.flagsReceived, Flag, "text-flag-red"], ["Chitchats", s.chitchats, MessageCircle], ["Followers", s.followers, Users],
  ];
  return <section className={cn(card, "overflow-hidden")}>
    {/* The company's banner: one of Ghosted's patterns, in the colour of its own logo. */}
    <BrandBanner company={c} className="h-20 border-b-2 border-foreground sm:h-24" />
    <div className="px-4 pb-5 sm:px-6">
      {/* relative z-10: the logo overlaps the banner (whose stripes are layered) instead of hiding under it. */}
      <div className="relative z-10 -mt-9 flex flex-wrap items-end justify-between gap-3 sm:-mt-10">
        <div className="rounded-xl bg-card p-1"><CompanyMark company={c} size="lg" /></div>
        <div className="flex flex-wrap items-center gap-2 pb-1">{actions}</div>
      </div>
      <div className="mt-3 grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="min-w-0">
          <h1 className="break-words font-display text-2xl font-bold sm:text-3xl">{c.name}</h1>
          {c.website && <a href={c.website} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"><Globe className="size-3.5" />{c.domain ?? c.website}<ExternalLink className="size-3" /></a>}
          {(c.about || c.summary) && <p className="mt-3 max-w-2xl text-sm leading-relaxed">{c.about || c.summary}</p>}
          {facts.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{facts.map(({ icon: Icon, text }) => <span key={text} className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-background px-2.5 py-1 text-xs font-bold"><Icon className="size-3.5" />{text}</span>)}</div>}
        </div>
        <div className="flex justify-center md:justify-end">{rated ? <FlagScore score={c.score} /> : <div className="rounded-xl border-2 border-dashed border-foreground/40 px-5 py-4 text-center"><p className="font-display text-2xl font-bold">New</p><p className="text-xs text-muted-foreground">Score after the first story</p></div>}</div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2 min-[420px]:grid-cols-3 md:grid-cols-5">{tiles.map(([label, n, Icon, tone]) => <div key={label} className="rounded-lg border-2 border-foreground bg-background p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-muted-foreground"><Icon className={cn("size-3.5", tone)} /><span className="truncate">{label}</span></p>
        <p className={cn("mt-1 font-display text-2xl font-bold tabular-nums", tone)}>{nf(n)}</p>
      </div>)}</div>
    </div>
  </section>;
}

// ---------- actions ----------

export function CompanyActions({ page, hook, onShare, onReport }: { page: CompanyPage; hook: Hook; onShare: () => void; onReport: () => void }) {
  const tone = useTone();
  const [busy, setBusy] = useState<string | null>(null);
  const rel = page.relationship ?? { following: false, notify: false };
  const name = page.company.name;
  const run = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(id);
    try { await fn(); toast.success(ok); }
    catch (err) { toast.error(err instanceof ApiRequestError && err.status === 401 ? "Log in to do that." : err instanceof ApiRequestError ? err.message : "Couldn't save that. Try again."); }
    finally { setBusy(null); }
  };
  const spin = (id: string, icon: ReactNode) => (busy === id ? <Loader2 className="animate-spin" /> : icon);
  return <>
    {/* Short label so Share, Follow, the bell and the menu stay on one row. */}
    <Button onClick={onShare}><PenLine />Share a story</Button>
    {rel.following
      ? <Button variant="outline" disabled={!!busy} onClick={() => void run("follow", hook.unfollow, `Stopped following ${name}.`)} className="group"><span className="contents group-hover:hidden">{spin("follow", <UserCheck />)}Following</span><span className="hidden group-hover:contents"><UserPlus className="rotate-45" />Unfollow</span></Button>
      : <Button variant="outline" disabled={!!busy} onClick={() => void run("follow", hook.follow, `Following ${name}.`)}>{spin("follow", <UserPlus />)}Follow</Button>}
    <Button variant="outline" size="icon" disabled={!!busy} aria-pressed={rel.notify} aria-label={rel.notify ? `Stop story alerts for ${name}` : `Get story alerts for ${name}`} title={rel.notify ? "Story alerts on" : "Get a notification for every new story"}
      onClick={() => void run("bell", () => hook.setNotify(!rel.notify), rel.notify ? "Story alerts off." : voice(tone, `You'll hear about every new story on ${name}. They can't hide now.`, `You'll get a notification for every new story about ${name}.`))}
      className={cn(rel.notify && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground")}>{spin("bell", rel.notify ? <BellRing /> : <Bell />)}</Button>
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="More options"><MoreHorizontal /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56"><DropdownMenuItem onSelect={onReport} className="text-flag-red focus:bg-flag-red focus:text-primary-foreground"><ShieldAlert />Report this listing</DropdownMenuItem></DropdownMenuContent>
    </DropdownMenu>
  </>;
}

// ---------- the company card beside a story ----------

// Compact: banner, logo, name, score, one line about them, Follow + bell + "View company page".
export function StoryCompanyCard({ page, hook }: { page: CompanyPage; hook: Hook }) {
  const tone = useTone();
  const { company: c, stats } = page;
  const rel = page.relationship ?? { following: false, notify: false };
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(id);
    try { await fn(); toast.success(ok); }
    catch (err) { toast.error(err instanceof ApiRequestError && err.status === 401 ? "Log in to do that." : "Couldn't save that. Try again."); }
    finally { setBusy(null); }
  };
  return <section className={cn(card, "overflow-hidden")} aria-label={`About ${c.name}`}>
    <BrandBanner company={c} className="h-14 border-b-2 border-foreground" />
    <div className="px-4 pb-4">
      {/* One row: the (bigger) logo overlapping the banner, the name beside it, the score on the right.
          The row is pulled up 32 px; the name and score are pushed back down so they start on the
          banner's bottom line, leaving no empty space under the banner. */}
      {/* The logo sets the row's height; the score is pinned top-right just under the banner line
          (absolute, so it never pushes the name down away from the logo). */}
      <div className="relative z-10 -mt-8">
        <div className="w-fit rounded-xl bg-card p-1"><CompanyMark company={c} size="lg" /></div>
        <div className="absolute right-0 top-9">{isRated(c) ? <FlagScore score={c.score} compact /> : <span className="rounded-full border-2 border-foreground bg-accent px-2.5 py-0.5 text-[11px] font-bold uppercase">New</span>}</div>
      </div>
      {/* Name straight under the logo, clear of the score on the right. */}
      <div className="mt-1.5 pr-24">
        <p className="text-xs font-bold uppercase text-primary">About the company</p>
        <h3 className="font-display text-lg font-bold leading-tight">{c.name}</h3>
      </div>
      {(c.about || c.summary) && <p className="mt-2 line-clamp-5 text-sm leading-relaxed text-muted-foreground">{c.about || c.summary}</p>}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">{([["Stories", stats.stories], ["Relatable", stats.relatableReceived], ["Followers", stats.followers]] as const).map(([l, n]) => <div key={l} className="rounded-lg border-2 border-foreground/15 bg-background py-1.5"><p className="font-display text-base font-bold tabular-nums">{nf(n)}</p><p className="text-[10px] font-bold uppercase text-muted-foreground">{l}</p></div>)}</div>
      <div className="mt-3 flex gap-2">
        {rel.following
          ? <Button variant="outline" className="flex-1" disabled={!!busy} onClick={() => void run("f", hook.unfollow, `Stopped following ${c.name}.`)}>{busy === "f" ? <Loader2 className="animate-spin" /> : <UserCheck />}Following</Button>
          : <Button variant="outline" className="flex-1" disabled={!!busy} onClick={() => void run("f", hook.follow, `Following ${c.name}.`)}>{busy === "f" ? <Loader2 className="animate-spin" /> : <UserPlus />}Follow</Button>}
        <Button variant="outline" size="icon" disabled={!!busy} aria-pressed={rel.notify} aria-label={rel.notify ? "Stop story alerts" : "Get story alerts"} title={rel.notify ? "Story alerts on" : "Get a notification for every new story"}
          onClick={() => void run("b", () => hook.setNotify(!rel.notify), rel.notify ? "Story alerts off." : voice(tone, `Alerts on. ${c.name} can't hide now.`, `You'll hear about new stories on ${c.name}.`))}
          className={cn(rel.notify && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground")}>{busy === "b" ? <Loader2 className="animate-spin" /> : rel.notify ? <BellRing /> : <Bell />}</Button>
      </div>
      <Button asChild className="mt-2 w-full"><Link to="/c/$slug" params={{ slug: c.id }}>View company page<ArrowRight /></Link></Button>
    </div>
  </section>;
}

// ---------- what people say ----------

function Quote({ story, good }: { story: StoryModel; good: boolean }) {
  return <div className={cn("min-w-0 rounded-xl border-2 p-4", good ? "border-flag-green bg-flag-green/5" : "border-flag-red bg-flag-red/5")}>
    <p className={cn("flex items-center gap-1.5 text-xs font-bold uppercase", good ? "text-flag-green" : "text-flag-red")}>{good ? <ThumbsUp className="size-3.5" /> : <ThumbsDown className="size-3.5" />}{good ? "Best experience" : "Worst experience"}</p>
    {story.title && <p className="mt-2 font-bold leading-snug">{story.title}</p>}
    <StoryBody text={story.body} className="mt-1 text-sm" />
    <p className="mt-2 text-xs text-muted-foreground">{story.author.name} · {story.outcomeLabel} · {story.timeLabel}</p>
  </div>;
}

export function WhatPeopleSay({ stats }: { stats: CompanyStats }) {
  const tone = useTone();
  const { positive, mixed, critical } = stats.sentiment;
  const total = positive + mixed + critical;
  if (!total) return null;
  const pct = (n: number) => Math.round((n / total) * 100);
  const verdict = pct(positive) >= 60 ? voice(tone, "Mostly green flags. Rare, but it happens.", "Most experiences here are positive.")
    : pct(critical) >= 60 ? voice(tone, "Mostly red flags. Proceed with snacks.", "Most experiences here are negative.")
    : voice(tone, "A mixed bag. Depends who you get.", "Experiences here are mixed.");
  return <section className={cn(card, "p-5")}>
    <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 className="font-display text-xl font-bold">What people say</h2><p className="text-sm text-muted-foreground">{verdict}</p></div><p className="text-xs font-semibold text-muted-foreground">Based on {total} {total === 1 ? "story" : "stories"}</p></div>
    {/* One bar, three parts: positive / mixed / critical, by each story's average stars. */}
    <div className="mt-4 flex h-4 overflow-hidden rounded-full border-2 border-foreground">
      {[["bg-flag-green", positive], ["bg-flag-amber", mixed], ["bg-flag-red", critical]].map(([cls, n]) => (n as number) > 0 && <motion.div key={cls as string} className={cls as string} initial={{ width: 0 }} animate={{ width: `${pct(n as number)}%` }} transition={{ duration: 0.7, ease: "easeOut" }} />)}
    </div>
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold">
      <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-flag-green" />{pct(positive)}% positive</span>
      <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-flag-amber" />{pct(mixed)}% mixed</span>
      <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-flag-red" />{pct(critical)}% critical</span>
    </div>
    {(stats.bestStory || stats.worstStory) && <div className="mt-4 grid gap-3 md:grid-cols-2">
      {stats.bestStory && <Quote story={stats.bestStory} good />}
      {stats.worstStory && <Quote story={stats.worstStory} good={false} />}
    </div>}
  </section>;
}

// ---------- report ----------

const REASONS: [string, string][] = [["fake", "Not a real company"], ["wrong_website", "Wrong website or details"], ["duplicate", "Listed twice"], ["offensive", "Offensive content"], ["other", "Something else"]];

export function ReportCompanyDialog({ open, onOpenChange, name, onSubmit }: { open: boolean; onOpenChange: (v: boolean) => void; name: string; onSubmit: (reason: string, details: string) => Promise<string> }) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className={popup}><div className={popupBody} data-lenis-prevent>
      <DialogHeader className="pr-8 text-left"><DialogTitle className="font-display text-2xl">Report {name}</DialogTitle><DialogDescription>Moderators check reported listings within 24 hours.</DialogDescription></DialogHeader>
      <div className="mt-5 space-y-2">{REASONS.map(([id, label]) => <button key={id} type="button" onClick={() => setReason(id)} className={cn("flex w-full items-center justify-between rounded-lg border-2 px-3 py-2.5 text-left text-sm font-semibold transition-colors", reason === id ? "border-flag-red bg-flag-red/10" : "border-foreground/20 hover:border-foreground/40")}>{label}{reason === id && <Check className="size-4 text-flag-red" />}</button>)}</div>
      <Textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} rows={3} placeholder="Anything else? (optional)" className="mt-4 border-2 border-foreground" />
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="destructive" disabled={!reason || busy} onClick={async () => { setBusy(true); try { toast.success(await onSubmit(reason, details)); onOpenChange(false); } catch (err) { toast.error(err instanceof ApiRequestError ? err.message : "Couldn't send the report."); } finally { setBusy(false); } }}>{busy ? <Loader2 className="animate-spin" /> : <ShieldAlert />}Send report</Button>
      </div>
    </div></DialogContent>
  </Dialog>;
}

// ---------- stats rail ----------

export function CompanyRail({ page, layout = "column" }: { page: CompanyPage; layout?: "column" | "strip" }) {
  const { stats, company } = page;
  const strip = layout === "strip";
  const box = cn(card, "p-5", strip && "flex flex-col");
  const weekly = stats.weekly.map((w, i) => ({ ...w, label: /^\d{4}-/.test(w.week) ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(w.week)) : `W${i + 1}` }));
  let acc = 0;
  const maze = stats.byStage.filter((s) => s.avgDays != null).map((s) => ({ round: STAGE[s.stage] ?? s.stage, days: (acc += s.avgDays ?? 0) }));
  const outcomes = stats.outcomes.map((o) => ({ ...o, label: SHORT[o.outcome] ?? OUTCOME_LABEL[o.outcome] ?? o.outcome }));
  const empty = (copy: string) => <p className="mt-3 rounded-lg border-2 border-dashed border-foreground/30 p-3 text-xs text-muted-foreground">{copy}</p>;
  return <aside aria-label={`${company.name} stats`} className={strip
    ? "-mx-4 flex items-stretch snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6 no-scrollbar [&>*]:w-[84%] [&>*]:shrink-0 [&>*]:snap-start sm:[&>*]:w-[46%] md:[&>*]:w-[40%]"
    : "space-y-5"}>
    {isRated(company) && <div className={box}><h3 className="font-bold">Score breakdown</h3><p className="text-xs text-muted-foreground">Average ratings from every story, out of 100</p><div className="mt-4"><ScoreMeters company={company} /></div></div>}

    <div className={box}>
      <h3 className="font-bold">Stories per week</h3><p className="text-xs text-muted-foreground">Last 8 weeks, by how they went</p>
      <div className={cn("mt-3", strip ? "min-h-32 flex-1" : "h-32")}><ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
        <AreaChart data={weekly} margin={{ left: 0, right: 4, top: 6, bottom: 0 }}>
          <XAxis dataKey="label" {...axis} tick={{ ...axis.tick, fontSize: 10 }} interval="preserveStartEnd" />
          <Tooltip cursor={lineCursor} content={<ChartTooltip unit=" stories" />} />
          <Area type="monotone" dataKey="critical" name="Critical" stackId="s" stroke="var(--flag-red)" fill="var(--flag-red)" fillOpacity={0.25} strokeWidth={2} activeDot={activeDot} />
          <Area type="monotone" dataKey="mixed" name="Mixed" stackId="s" stroke="var(--flag-amber)" fill="var(--flag-amber)" fillOpacity={0.25} strokeWidth={2} activeDot={activeDot} />
          <Area type="monotone" dataKey="positive" name="Positive" stackId="s" stroke="var(--flag-green)" fill="var(--flag-green)" fillOpacity={0.25} strokeWidth={2} activeDot={activeDot} />
        </AreaChart>
      </ResponsiveContainer></div>
    </div>

    <div className={box}>
      <h3 className="font-bold">How stories end</h3><p className="text-xs text-muted-foreground">{stats.stories} {stats.stories === 1 ? "story" : "stories"} by outcome</p>
      {stats.stories ? <div className={cn("mt-3", strip ? "min-h-36 flex-1" : "h-36")}><ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
        <BarChart data={outcomes} margin={{ left: -24, right: 4, top: 4, bottom: 0 }}>
          <CartesianGrid {...grid} /><XAxis dataKey="label" {...axis} tick={{ ...axis.tick, fontSize: 9 }} interval={0} /><YAxis {...axis} allowDecimals={false} width={40} />
          <Tooltip cursor={barCursor} content={<ChartTooltip unit=" stories" />} />
          <Bar dataKey="count" name="Stories" shape={(p: { x?: number; y?: number; width?: number; height?: number; payload?: { outcome: string } }) => <rect x={p.x} y={p.y} width={p.width} height={p.height} rx={5} fill={OUTCOME_TONE[p.payload?.outcome ?? ""] ?? "var(--chart-violet)"} stroke={INK} strokeWidth={1.5} />} />
        </BarChart>
      </ResponsiveContainer></div> : empty("No stories yet. Be the first.")}
    </div>

    <div className={box}>
      <h3 className="font-bold">How long they take</h3><p className="text-xs text-muted-foreground">Days since applying, by round</p>
      {maze.length >= 2 ? <div className={cn("mt-3", strip ? "min-h-40 flex-1" : "h-40")}><ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
        <AreaChart data={maze} margin={{ left: -24, right: 6, top: 8, bottom: 0 }}>
          <defs><linearGradient id="co-maze" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-violet)" stopOpacity={0.3} /><stop offset="100%" stopColor="var(--chart-violet)" stopOpacity={0.03} /></linearGradient></defs>
          <CartesianGrid {...grid} /><XAxis dataKey="round" {...axis} tick={{ ...axis.tick, fontSize: 10 }} interval={0} padding={{ left: 12, right: 12 }} /><YAxis {...axis} axisLine={false} tick={{ ...axis.tick, fontSize: 10 }} />
          <Tooltip cursor={lineCursor} content={<ChartTooltip unit=" days" labelFormat={(l) => `After: ${l}`} />} />
          <Area type="monotone" dataKey="days" name="Days" stroke="var(--chart-violet)" strokeWidth={2} fill="url(#co-maze)" dot={{ r: 3, fill: "var(--chart-violet)", strokeWidth: 0 }} activeDot={activeDot} />
        </AreaChart>
      </ResponsiveContainer></div> : empty("Builds up as stories report how long each round took.")}
    </div>

    <div className={box}>
      <h3 className="flex items-center gap-2 font-bold"><Wallet className="size-4 text-primary" />Reported salaries</h3><p className="text-xs text-muted-foreground">₹ LPA, by role</p>
      {stats.salaries.length ? <ul className="mt-3 space-y-2.5">{stats.salaries.map((r) => <li key={r.role}>
        <div className="flex justify-between gap-2 text-xs"><span className="truncate font-semibold">{r.role}</span><span className="shrink-0 font-bold">₹{r.range[0]}–{r.range[1]}</span></div>
        <div className="relative mt-1 h-2 rounded-full bg-muted"><div className="absolute inset-y-0 rounded-full bg-primary" style={{ left: `${Math.min(r.range[0], 50) * 2}%`, width: `${Math.min(r.range[1] - r.range[0], 50) * 2}%` }} /></div>
        <p className="mt-0.5 text-[10px] text-muted-foreground">median ₹{r.median} · {r.reports} {r.reports === 1 ? "report" : "reports"}</p>
      </li>)}</ul> : empty("Appears once stories include salary ranges.")}
    </div>
  </aside>;
}
