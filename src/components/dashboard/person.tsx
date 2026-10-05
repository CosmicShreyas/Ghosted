// A person's page: header (who, their numbers, what they've chosen to show), actions (follow, bell,
// mute, report) and their stats rail. The rail replaces the global "At a glance" widgets with this
// person's perspective, as a column on desktop and a swipeable strip on phones/tablets.
import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Charts } from "@/components/lazy-charts";
import { Bell, BellOff, BellRing, BriefcaseBusiness, Gift, CalendarDays, Clock, HeartHandshake, Linkedin, Loader2, MapPin, MessageCircle, MoreHorizontal, PenLine, Share2, ShieldAlert, Sparkles, UserCheck, UserPlus, Users, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Banner, CompanyMark } from "@/components/ghosted";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { ApiRequestError } from "@/lib/api";
import { OUTCOME_LABEL, useCompanyIndex } from "@/lib/stories";
import type { PersonPage, PersonStats, usePerson } from "@/lib/people";
import { cn, formatCount } from "@/lib/utils";
import { activeDot, axis, barCursor, ChartTooltip, grid, INK, lineCursor, SERIES } from "./chart-kit";
import { card, popup, popupBody } from "./ui-kit";
import { LevelBadge, LevelProgress, StreakChip, titleFor } from "@/lib/levels";

const nf = formatCount;
const joined = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date(iso)) : null);

// ---------- header ----------

export function PersonHeader({ page, actions }: { page: PersonPage; actions: ReactNode }) {
  const { profile: p, stats: s } = page;
  const r = p.revealed;
  const chips = [
    r?.role && { icon: BriefcaseBusiness, text: r.role },
    r?.experience && { icon: Clock, text: r.experience },
    r?.city && { icon: MapPin, text: r.city },
  ].filter(Boolean) as { icon: typeof MapPin; text: string }[];
  const tiles: [string, number, typeof Users, string?][] = [
    ["Stories", s.stories, PenLine],
    ["Relatable", s.relatableReceived, HeartHandshake],
    ["Other reactions", s.flagsReceived, Sparkles, "text-emerald-600 dark:text-emerald-300"],
    ["Chitchats", s.chitchatsReceived, MessageCircle],
    ["Followers", s.followers, Users],
    ["Following", s.following, UserCheck],
  ];
  const level = p.level ?? null;
  return <section className={cn(card, "overflow-hidden")}>
    {/* Their banner: DiceBear shapes seeded from their avatar, in Ghosted's palette. */}
    <Banner seed={p.avatarSeed} className="h-24 border-b-2 border-foreground sm:h-32" />
    <div className="px-4 pb-5 sm:px-6">
      <div className="-mt-10 flex flex-wrap items-end justify-between gap-3 sm:-mt-12">
        {/* The avatar with its level badge beside it (the badge's colour climbs from pale yellow to red). */}
        <div className="flex min-w-0 items-end gap-2 sm:gap-3">
          <div className="rounded-full bg-card p-1"><div className="[&_img]:size-20 sm:[&_img]:size-24"><Avatar seed={p.avatarSeed} pastel={p.pastel} size="lg" label={p.name} /></div></div>
          {level && !p.bot && <div className="mb-1 flex flex-col items-start gap-0.5"><LevelBadge level={level} size="md" /><span className="pl-0.5 text-[11px] font-bold text-muted-foreground">{p.title ?? titleFor(level)}</span></div>}
        </div>
        <div className="flex flex-wrap items-center gap-2 pb-1">{actions}</div>
      </div>
      <div className="mt-3 min-w-0">
        <h1 className="break-words font-display text-2xl font-bold sm:text-3xl">{p.name}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className={cn("inline-flex items-center gap-1 rounded-full border-2 border-foreground px-2 py-0.5 text-[11px] font-bold uppercase", r ? "bg-flag-amber text-foreground" : "bg-flag-green text-primary-foreground")}>{r ? "Public profile" : "Anonymous"}</span>
          {joined(p.joinedAt) && <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" />Joined {joined(p.joinedAt)}</span>}
          <span><strong className="font-bold text-foreground">{nf(s.followers)}</strong> {s.followers === 1 ? "follower" : "followers"}</span>
          <span><strong className="font-bold text-foreground">{nf(s.following)}</strong> following</span>
        </p>
        {/* Your own page: how close you are to the next level, and your streak. */}
        {p.isMe && p.progress && level && <div className="mt-4 rounded-xl border-2 border-foreground bg-background p-3 sm:p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold">Your road to LV {level + 1}</p>
            <span className="flex items-center gap-2"><StreakChip streak={p.progress.streak} activeToday={p.progress.activeToday} /><Link to="/dashboard" search={{ view: "insights" }} className="text-xs font-bold text-primary hover:underline">How to level up</Link></span>
          </div>
          <LevelProgress level={level} into={p.progress.into} need={p.progress.need} />
        </div>}
        {(chips.length > 0 || r?.linkedin) && <div className="mt-3 flex flex-wrap gap-2">
          {chips.map(({ icon: Icon, text }) => <span key={text} className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-background px-2.5 py-1 text-xs font-bold"><Icon className="size-3.5" />{text}</span>)}
          {r?.linkedin && <a href={`https://www.linkedin.com/${r.linkedin.replace(/\/$/, "")}`} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-background px-2.5 py-1 text-xs font-bold hover:bg-muted"><Linkedin className="size-3.5" />LinkedIn</a>}
        </div>}
      </div>
      {/* Their numbers: 2 columns on small phones, 3 on larger phones and tablets, all 6 in a row on wide screens. */}
      <div className="mt-5 grid grid-cols-2 gap-2 min-[420px]:grid-cols-3 xl:grid-cols-6">{tiles.map(([label, n, Icon, tone]) => <div key={label} className="rounded-lg border-2 border-foreground bg-background p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-muted-foreground"><Icon className={cn("size-3.5", tone)} /><span className="truncate">{label}</span></p>
        <p className={cn("mt-1 font-display text-2xl font-bold tabular-nums", tone)}>{nf(n)}</p>
      </div>)}</div>
    </div>
  </section>;
}

// ---------- actions ----------

type Person = ReturnType<typeof usePerson>;

export function PersonActions({ page, person, onReport }: { page: PersonPage; person: Person; onReport: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const rel = page.relationship;
  // Sharing a page: the link's preview is a card with their level badge (backend og.ts personCard).
  const shareProfile = <Button variant="outline" size="icon" aria-label="Share profile" title="Share profile" onClick={() => void (async () => {
    const url = `${window.location.origin}/u/${page.profile.publicId}`;
    try {
      if (navigator.share && window.matchMedia("(pointer: coarse)").matches) await navigator.share({ title: `${page.profile.name} on Ghosted`, url });
      else { await navigator.clipboard.writeText(url); toast.success("Profile link copied. Its preview shows the level badge."); }
    } catch (e) { if ((e as Error).name !== "AbortError") toast.error("Couldn't copy the link."); }
  })()}><Share2 /></Button>;
  if (page.profile.isMe) return <>{shareProfile}<Button variant="outline" asChild><Link to="/dashboard" search={{ view: "settings" }}><PenLine />Edit profile</Link></Button></>;
  if (!rel) return shareProfile;
  const name = page.profile.name;
  const run = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(id);
    try { await fn(); toast.success(ok); }
    catch (err) { toast.error(err instanceof ApiRequestError && err.status === 401 ? "Log in to do that." : err instanceof ApiRequestError ? err.message : "Couldn't save that. Try again."); }
    finally { setBusy(null); }
  };
  const spin = (id: string, icon: ReactNode) => (busy === id ? <Loader2 className="animate-spin" /> : icon);

  return <>
    {rel.following
      ? <Button variant="outline" disabled={!!busy} onClick={() => void run("follow", person.unfollow, `Unfollowed ${name}.`)} className="group"><span className="contents group-hover:hidden">{spin("follow", <UserCheck />)}Following</span><span className="hidden group-hover:contents"><UserPlus className="rotate-45" />Unfollow</span></Button>
      : <Button disabled={!!busy} onClick={() => void run("follow", person.follow, `Following ${name}. Their stories will show up for you.`)}>{spin("follow", <UserPlus />)}Follow</Button>}
    {/* The bell: get a notification whenever they share a new story. */}
    <Button variant="outline" size="icon" disabled={!!busy || rel.muted} aria-pressed={rel.notify}
      aria-label={rel.notify ? `Stop story alerts from ${name}` : `Get story alerts from ${name}`} title={rel.muted ? "Unmute them to get alerts" : rel.notify ? "Story alerts on" : "Get story alerts"}
      onClick={() => void run("bell", () => person.setNotify(!rel.notify), rel.notify ? "Story alerts off." : `You'll hear about every new story from ${name}.`)}
      className={cn(rel.notify && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground")}>
      {spin("bell", rel.notify ? <BellRing /> : <Bell />)}
    </Button>
    {shareProfile}
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="More options"><MoreHorizontal /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 border-2 border-foreground shadow-hard">
        {rel.notify && <DropdownMenuItem className="gap-2.5 py-2 font-bold focus:bg-primary focus:text-primary-foreground" onSelect={() => void run("bell", () => person.setNotify(false), "Story alerts off.")}><BellOff className="size-4" />Turn off story alerts</DropdownMenuItem>}
        {rel.muted
          ? <DropdownMenuItem className="gap-2.5 py-2 font-bold focus:bg-primary focus:text-primary-foreground" onSelect={() => void run("mute", person.unmute, `${name} is back in your feed.`)}><Volume2 className="size-4" />Unmute</DropdownMenuItem>
          : <DropdownMenuItem className="gap-2.5 py-2 font-bold focus:bg-primary focus:text-primary-foreground" onSelect={() => void run("mute", person.mute, `Muted. ${name}'s stories won't appear in your feed. They won't be told.`)}><VolumeX className="size-4" />Mute (hide from my feed)</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2.5 py-2 font-bold text-flag-red focus:bg-flag-red focus:text-primary-foreground" onSelect={onReport}><ShieldAlert className="size-4" />Report {name}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </>;
}

// ---------- report ----------

const REASONS: [string, string][] = [
  ["fake_stories", "Posting fake or misleading stories"],
  ["harassment", "Harassment or bullying"],
  ["identifies_person", "Naming or exposing someone"],
  ["impersonation", "Pretending to be someone else"],
  ["spam", "Spam or advertising"],
  ["other", "Something else"],
];

export function ReportPersonDialog({ open, onOpenChange, name, onSubmit }: { open: boolean; onOpenChange: (v: boolean) => void; name: string; onSubmit: (reason: string, details: string) => Promise<string> }) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { toast.success(await onSubmit(reason, details)); onOpenChange(false); setReason(""); setDetails(""); }
    catch (err) { toast.error(err instanceof ApiRequestError ? err.message : "Couldn't send the report. Try again."); }
    finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className={popup}>
      <div className={popupBody} data-lenis-prevent>
        <DialogHeader className="pr-8 text-left"><DialogTitle className="font-display text-2xl">Report {name}</DialogTitle><DialogDescription>Moderators review every report within 24 hours. {name} won't know it was you.</DialogDescription></DialogHeader>
        <fieldset className="mt-5 space-y-2"><legend className="mb-2 text-sm font-bold">What's wrong?</legend>
          {REASONS.map(([id, label]) => <label key={id} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border-2 px-3 py-2.5 text-sm font-semibold transition-colors", reason === id ? "border-flag-red bg-flag-red/10" : "border-foreground/20 hover:border-foreground/40")}>
            <input type="radio" name="reason" value={id} checked={reason === id} onChange={() => setReason(id)} className="size-4 accent-[var(--flag-red)]" />{label}
          </label>)}
        </fieldset>
        <label className="mt-4 block text-sm font-bold" htmlFor="report-details">Anything else? <span className="font-normal text-muted-foreground">(optional)</span></label>
        <Textarea id="report-details" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} rows={3} className="mt-1.5 border-2 border-foreground" placeholder="Links to stories, what happened…" />
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" disabled={!reason || busy} onClick={() => void submit()}>{busy ? <Loader2 className="animate-spin" /> : <ShieldAlert />}Send report</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}

// ---------- stats rail (this person's perspective) ----------

const OUTCOME_TONE: Record<string, string> = { ghosted: "var(--flag-red)", ghost_job: "var(--flag-red)", offer_revoked: "var(--flag-red)", rejected: "var(--flag-amber)", offer: "var(--flag-green)" };

export function PersonRail({ stats, name, layout = "column" }: { stats: PersonStats; name: string; layout?: "column" | "strip" }) {
  const strip = layout === "strip";
  const { index: companyIndex } = useCompanyIndex();
  const weekly = stats.weekly.map((w, i) => ({ ...w, label: /^\d{4}-/.test(w.week) ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(w.week)) : `W${i + 1}` }));
  // Short axis labels so five bars fit a narrow card; the tooltip shows the full name.
  const SHORT: Record<string, string> = { ghosted: "Ghosted", rejected: "Rejected", offer: "Offer", offer_revoked: "Revoked", ghost_job: "Fake job" };
  const outcomes = stats.outcomes.map((o) => ({ ...o, label: SHORT[o.outcome] ?? OUTCOME_LABEL[o.outcome] ?? o.outcome }));
  const ratings = stats.ratings ? (Object.entries({ Hiring: stats.ratings.hiring, Communication: stats.ratings.communication, Culture: stats.ratings.culture, Pay: stats.ratings.pay, Growth: stats.ratings.growth }) as [string, number | null][]).filter(([, v]) => v != null) : []; // areas none of their stories rated are hidden
  const totalReactions = weekly.reduce((n, w) => n + w.relatable + w.flags, 0);

  const box = (extra?: string) => cn(card, "p-5", strip && "flex flex-col", extra);
  return <aside aria-label={`${name}'s stats`} className={strip
    ? "-mx-4 flex items-stretch snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6 no-scrollbar [&>*]:w-[84%] [&>*]:shrink-0 [&>*]:snap-start sm:[&>*]:w-[46%] md:[&>*]:w-[40%]"
    : "space-y-5"}>
    <div className={box()}>
      <h3 className="font-bold">Their impact</h3>
      <p className="text-xs text-muted-foreground">Reactions their stories got, last 8 weeks</p>
      <p className="mt-2 font-display text-3xl font-bold tabular-nums">{nf(totalReactions)}</p>
      <div className="mt-2 h-28 max-h-28 min-h-28 shrink-0"><Charts>{(R) => <R.ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
        <R.AreaChart data={weekly} margin={{ left: 0, right: 4, top: 6, bottom: 0 }}>
          <defs><linearGradient id="person-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={SERIES.primary} stopOpacity={0.35} /><stop offset="100%" stopColor={SERIES.primary} stopOpacity={0.02} /></linearGradient></defs>
          <R.XAxis dataKey="label" {...axis} tick={{ ...axis.tick, fontSize: 10 }} interval="preserveStartEnd" />
          <R.Tooltip cursor={lineCursor} content={<ChartTooltip />} />
          <R.Area type="monotone" dataKey="relatable" name="Relatable" stroke={SERIES.primary} strokeWidth={2} fill="url(#person-fill)" dot={false} activeDot={activeDot} />
          <R.Area type="monotone" dataKey="flags" name="Other reactions" stroke={SERIES.secondary} strokeWidth={2} fill="transparent" dot={false} activeDot={activeDot} />
        </R.AreaChart>
      </R.ResponsiveContainer>}</Charts></div>
      <div className="mt-2 flex gap-4 text-[11px] font-semibold text-muted-foreground"><span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm border border-foreground" style={{ background: SERIES.primary }} />Relatable</span><span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm border border-foreground" style={{ background: SERIES.secondary }} />Other reactions</span></div>
    </div>

    <div className={box()}>
      <h3 className="font-bold">How their stories end</h3>
      <p className="text-xs text-muted-foreground">{stats.stories} {stats.stories === 1 ? "story" : "stories"} by outcome</p>
      <div className="mt-3 h-36 max-h-36 min-h-36 shrink-0"><Charts>{(R) => <R.ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
        <R.BarChart data={outcomes} margin={{ left: -24, right: 4, top: 4, bottom: 0 }}>
          <R.CartesianGrid {...grid} />
          <R.XAxis dataKey="label" {...axis} tick={{ ...axis.tick, fontSize: 9 }} interval={0} />
          <R.YAxis {...axis} allowDecimals={false} width={40} />
          <R.Tooltip cursor={barCursor} content={<ChartTooltip unit=" stories" />} />
          <R.Bar dataKey="count" name="Stories" radius={[5, 5, 0, 0]} stroke={INK} strokeWidth={1.5} shape={(props: { x?: number; y?: number; width?: number; height?: number; payload?: { outcome: string } }) => <rect x={props.x} y={props.y} width={props.width} height={props.height} rx={5} fill={OUTCOME_TONE[props.payload?.outcome ?? ""] ?? SERIES.primary} stroke={INK} strokeWidth={1.5} />} />
        </R.BarChart>
      </R.ResponsiveContainer>}</Charts></div>
    </div>

    {ratings.length > 0 && <div className={box()}>
      <h3 className="font-bold">How they rate employers</h3>
      <p className="text-xs text-muted-foreground">Average across their stories, out of 100</p>
      <div className="mt-3 space-y-2.5">{ratings.map(([label, v]) => <div key={label}>
        <div className="flex justify-between text-xs font-semibold"><span>{label}</span><span className="tabular-nums">{v ?? "–"}</span></div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><motion.div initial={{ width: 0 }} animate={{ width: `${v ?? 0}%` }} transition={{ duration: 0.6 }} className={cn("h-full rounded-full", (v ?? 0) >= 70 ? "bg-flag-green" : (v ?? 0) >= 40 ? "bg-flag-amber" : "bg-flag-red")} /></div>
      </div>)}</div>
      {stats.avgDaysWaited != null && <p className="mt-auto pt-4 text-xs text-muted-foreground">Waited <strong className="text-foreground">{stats.avgDaysWaited} days</strong> for a reply, on average.</p>}
    </div>}

    <div className={box()}>
      <h3 className="font-bold">Companies they've reviewed</h3>
      <p className="text-xs text-muted-foreground">{stats.companies} {stats.companies === 1 ? "company" : "companies"} so far</p>
      {stats.topCompanies.length
        // The company's real logo (from the company list), falling back to its letter; each row opens the company.
        ? <ul className="mt-3 space-y-1">{stats.topCompanies.map((c) => {
            const co = companyIndex.get(c.slug);
            return <li key={c.slug}><Link to="/c/$slug" params={{ slug: c.slug }} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <CompanyMark size="sm" company={co ?? { name: c.name, initial: c.name.charAt(0).toUpperCase(), color: c.color, logoUrl: null }} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.name}</span>
              <span className="text-xs font-bold text-muted-foreground">{c.stories} {c.stories === 1 ? "story" : "stories"}</span>
            </Link></li>;
          })}</ul>
        : <p className="mt-3 text-sm text-muted-foreground">No reviews yet.</p>}
    </div>
  </aside>;
}
