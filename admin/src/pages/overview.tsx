// The first screen: your desk (what needs a human, in big tabs you can click straight into), then
// how the platform's doing: two weeks of activity, what Goofy did, the team's latest moves.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { activeDot, axis, barCursor, ChartTooltip, grid, lineCursor } from "@/components/dashboard/chart-kit";
import { motion } from "motion/react";
import { Ban, Bug, Building2, Flag, Hourglass, IndianRupee, Lock, Megaphone, MessageSquareHeart, ScrollText, Smile, Sparkles, Users } from "lucide-react";
import { adminApi, SITE_URL, type AdminMe } from "../api";
import { can } from "../perms";
import { ago, inr, Panel, Peep, Bars, Segmented } from "../ui";
import type { Page } from "../app";
import { cn } from "@/lib/utils";
import { OverviewSkeleton } from "../page-skeletons";

type Overview = {
  queue: { stories: number; chitchats: number }; reports: { open: number; urgent: number }; feedback: { new: number; openBugs: number };
  members: number; storiesThisWeek: number; donations: { total: number; count: number; last30: number }; mood: { average: number | null; responses: number };
  goofy24h: Record<string, number>;
  days: string[]; trend: { signups: number[]; stories: number[]; chitchats: number[]; reports: number[] };
  recent: { id: number; admin_name: string | null; action: string; target_kind: string | null; target_ref: string | null; created_at: string }[];
  reportReasons: { reason: string; count: number }[];
  bans: { members: number; ips: number }; topCompanies: { name: string; slug: string; stories: number }[];
  platform: { readOnly: boolean; signupsOpen: boolean; postingOpen: boolean; chitchatsOpen: boolean; announcement: boolean };
};
const GOOFY_LABEL: Record<string, string> = { removed_story: "Stories removed", removed_chitchat: "Chitchats removed", held: "Held for a check", released: "Released", redacted: "Names hidden", took_down: "Taken down", restored: "Restored", reported_story: "Stories reported", reported_chitchat: "Chitchats reported", reported_company: "Companies reported", asked_rephrase: "Asked to rephrase", warned: "Warnings", paused: "Posting paused", welcomed: "Welcomed", ghost_job_alert: "Ghost-job alerts", dismissed_reports: "Stale reports closed", escalated: "Escalated to you" };
export const actionLabel = (a: string) => a.replace(/^(team|member|queue|report)_/, (m) => `${m.slice(0, -1)} `).replace(/_/g, " ");

function greet(me: AdminMe, held: number, urgent: number) {
  const first = me.name.split(" ")[0];
  const h = new Date().getHours();
  const part = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  if (me.tone === "calm") return { hi: `Good ${part}, ${first}.`, line: held + urgent ? `${held + urgent} thing${held + urgent === 1 ? "" : "s"} need a human today.` : "Nothing is waiting for you right now." };
  return { hi: `Good ${part}, ${first}.`, line: held + urgent ? `Goofy left you ${held + urgent} thing${held + urgent === 1 ? "" : "s"}. He tried his best.` : "Inbox zero. Goofy's doing all the work today." };
}

function DeskTab({ label, value, sub, icon: Icon, hot, onClick, i }: { label: string; value: number; sub: string; icon: typeof Flag; hot?: string; onClick: () => void; i: number }) {
  return <motion.button type="button" onClick={onClick} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + i * 0.06, type: "spring", stiffness: 260, damping: 24 }}
    className={cn("card-lift group flex min-w-0 flex-col rounded-xl border-2 border-foreground p-4 text-left shadow-hard-sm", value ? (hot ?? "bg-accent") : "bg-card")}>
    <span className="flex items-center gap-1.5 text-sm font-bold"><Icon className="size-4" />{label}</span>
    <span className="mt-2 font-display text-5xl font-bold leading-none tabular-nums">{value}</span>
    <span className="mt-2 text-xs font-medium opacity-75">{sub}</span>
  </motion.button>;
}

const METRICS = { stories: { label: "Stories", color: "var(--chart-violet)" }, chitchats: { label: "Chitchats", color: "var(--chart-cyan)" }, signups: { label: "New members", color: "var(--color-flag-green)" }, reports: { label: "Reports", color: "var(--color-flag-red)" } } as const;
type Metric = keyof typeof METRICS;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

function ActivityChart({ o }: { o: Overview }) {
  const [metric, setMetric] = useState<Metric>("stories");
  const m = METRICS[metric];
  const data = o.days.map((d, i) => ({ day: day(d), value: o.trend[metric][i] ?? 0 }));
  const total = data.reduce((a, b) => a + b.value, 0);
  const prev = data.slice(0, 15).reduce((a, b) => a + b.value, 0), last = data.slice(15).reduce((a, b) => a + b.value, 0);
  const change = prev ? Math.round(((last - prev) / prev) * 100) : null;
  return <Panel title="The last 30 days" icon={Sparkles} action={<div className="hidden sm:block"><Segmented label="Metric" value={metric} onChange={setMetric} options={(Object.keys(METRICS) as Metric[]).map((k) => ({ id: k, label: METRICS[k].label }))} /></div>}>
    <div className="no-scrollbar -mx-1 mb-3 overflow-x-auto px-1 sm:hidden"><Segmented label="Metric" value={metric} onChange={setMetric} options={(Object.keys(METRICS) as Metric[]).map((k) => ({ id: k, label: METRICS[k].label.replace("New members", "Members") }))} /></div>
    <div className="flex flex-wrap items-baseline gap-x-4"><p className="font-display text-4xl font-bold tabular-nums">{total.toLocaleString("en-IN")}</p><p className="text-sm text-muted-foreground">{m.label.toLowerCase()} in 30 days{change != null && <>, <b className={change >= 0 ? "text-flag-green" : "text-flag-red"}>{change >= 0 ? "+" : ""}{change}%</b> on the fortnight before</>}</p></div>
    <div className="mt-4 h-64 sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs><linearGradient id="fill-activity" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={m.color} stopOpacity={0.35} /><stop offset="100%" stopColor={m.color} stopOpacity={0.02} /></linearGradient></defs>
          <CartesianGrid {...grid} />
          <XAxis dataKey="day" {...axis} interval="preserveStartEnd" minTickGap={24} />
          <YAxis {...axis} allowDecimals={false} width={44} />
          <Tooltip cursor={lineCursor} content={<ChartTooltip />} />
          <Area type="monotone" dataKey="value" name={m.label} stroke={m.color} strokeWidth={2.5} fill="url(#fill-activity)" activeDot={{ ...activeDot, fill: m.color }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  </Panel>;
}

const REASON: Record<string, string> = { false_info: "False information", identifies_person: "Names a person", harassment: "Harassment", confidential: "Confidential info", spam: "Spam", off_topic: "Off topic", other: "Something else" };
function ReasonsChart({ reasons }: { reasons: { reason: string; count: number }[] }) {
  const data = reasons.slice(0, 6).map((r) => ({ name: REASON[r.reason] ?? r.reason, value: r.count }));
  return <Panel title="Why people report" icon={Flag}>
    <p className="text-sm text-muted-foreground">Story reports in the last 30 days, by reason.</p>
    {data.length ? <div className="mt-3 h-64 sm:h-72"><ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid {...grid} horizontal={false} vertical />
        <XAxis type="number" {...axis} allowDecimals={false} />
        <YAxis type="category" dataKey="name" {...axis} width={112} />
        <Tooltip cursor={barCursor} content={<ChartTooltip />} />
        <Bar dataKey="value" name="Reports" fill="var(--chart-violet)" stroke="var(--foreground)" strokeWidth={2} radius={[0, 6, 6, 0]} barSize={18} />
      </BarChart>
    </ResponsiveContainer></div> : <div className="grid h-56 place-items-center text-center text-sm text-muted-foreground"><span><Flag className="mx-auto mb-2 size-6" />No reports this month.</span></div>}
  </Panel>;
}

export function OverviewPage({ go, me }: { go: (p: Page) => void; me: AdminMe }) {
  const q = useQuery({ queryKey: ["admin", "overview"], queryFn: () => adminApi<Overview>("/overview"), refetchInterval: 30_000 });
  const o = q.data;
  if (!o) return <OverviewSkeleton />;
  const held = o.queue.stories + o.queue.chitchats;
  const g = greet(me, held, o.reports.urgent);
  const goofy = Object.entries(o.goofy24h).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const p = o.platform;
  const paused = [!p.signupsOpen && "sign-ups", !p.postingOpen && "new stories", !p.chitchatsOpen && "chitchats"].filter(Boolean) as string[];

  return <div className="space-y-6">
    {/* The desk */}
    <section className="rounded-2xl border-2 border-foreground bg-card p-5 shadow-hard sm:p-6">
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <Peep seed={me.avatarSeed} className="size-14 sm:size-20" />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-bold leading-tight sm:text-4xl">{g.hi}</h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">{g.line}</p>
        </div>
        {(p.readOnly || paused.length > 0 || p.announcement) && <button type="button" onClick={() => go("platform")} className={cn("flex w-full items-center justify-center gap-2 rounded-full border-2 border-foreground px-3 py-1.5 text-xs font-bold sm:w-auto", p.readOnly ? "bg-flag-red text-primary-foreground" : "bg-muted")}> 
          {p.readOnly ? <><Lock className="size-3.5" />Read-only mode is on</> : paused.length ? <><Lock className="size-3.5" />Paused: {paused.join(", ")}</> : <><Megaphone className="size-3.5" />Announcement is live</>}
        </button>}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        {can(me, "queue") && <DeskTab i={0} label="Held for review" value={held} sub={`${o.queue.stories} stories, ${o.queue.chitchats} chitchats`} icon={Hourglass} onClick={() => go("queue")} />}
        {can(me, "reports") && <DeskTab i={1} label="Urgent reports" value={o.reports.urgent} sub={`${o.reports.open} open altogether`} icon={Flag} hot="bg-flag-red text-primary-foreground" onClick={() => go("reports")} />}
        {can(me, "feedback") && <DeskTab i={2} label="Open bugs" value={o.feedback.openBugs} sub="New, planned or in progress" icon={Bug} onClick={() => go("feedback")} />}
        {can(me, "feedback") && <DeskTab i={3} label="Unread feedback" value={o.feedback.new} sub="Ideas and notes from members" icon={MessageSquareHeart} onClick={() => go("feedback")} />}
      </div>
    </section>

    {/* A month of activity, then the last two weeks per metric */}
    <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
      <ActivityChart o={o} />
      <ReasonsChart reasons={o.reportReasons} />
    </div>
    <Panel title="The last 14 days" icon={Sparkles} action={<span className="text-xs text-muted-foreground">Today is the last bar</span>}>
      <div className="grid gap-x-8 gap-y-6 pt-2 sm:grid-cols-2 xl:grid-cols-4">
        <Bars label="New members" values={o.trend.signups.slice(-14)} days={o.days.slice(-14)} tone="bg-avatar-mint" />
        <Bars label="Stories" values={o.trend.stories.slice(-14)} days={o.days.slice(-14)} />
        <Bars label="Chitchats" values={o.trend.chitchats.slice(-14)} days={o.days.slice(-14)} tone="bg-avatar-sky" />
        <Bars label="Reports" values={o.trend.reports.slice(-14)} days={o.days.slice(-14)} tone="bg-flag-red" />
      </div>
    </Panel>

    <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      {/* The numbers that matter, as one ruled list rather than a wall of cards */}
      <Panel title="Ghosted at a glance" icon={Users}>
        <dl className="divide-y-2 divide-foreground/10">
          {([
            [Users, "Members", o.members.toLocaleString("en-IN"), null],
            [ScrollText, "Stories this week", o.storiesThisWeek.toLocaleString("en-IN"), null],
            [Smile, "Mood from check-ins", o.mood.average != null ? `${o.mood.average} / 5` : "No answers yet", `${o.mood.responses} answers in 30 days`],
            ...(can(me, "donations") ? [[IndianRupee, "Donations", inr(o.donations.total), `${inr(o.donations.last30)} in the last 30 days`] as const] : []),
            ...(can(me, "members") ? [[Ban, "Banned", `${o.bans.members} members`, `${o.bans.ips} blocked connections`] as const] : []),
          ] as const).map(([Icon, k, v, sub]) => <div key={k} className="flex items-center gap-3 py-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg border-2 border-foreground bg-muted"><Icon className="size-4" /></span>
            <dt className="min-w-0 flex-1 text-sm font-semibold">{k}{sub && <span className="block text-xs font-normal text-muted-foreground">{sub}</span>}</dt>
            <dd className="font-display text-xl font-bold tabular-nums">{v}</dd>
          </div>)}
        </dl>
      </Panel>

      <Panel title="Talked about this week" icon={Building2}>
        {o.topCompanies.length ? <ol className="space-y-2">{o.topCompanies.map((c, i) => {
          const max = o.topCompanies[0]!.stories;
          return <li key={c.slug}><a href={`${SITE_URL}/c/${c.slug}`} target="_blank" rel="noopener noreferrer" className="group block">
            <span className="flex items-baseline justify-between gap-2 text-sm"><span className="truncate font-bold group-hover:underline">{i + 1}. {c.name}</span><span className="shrink-0 text-xs text-muted-foreground tabular-nums">{c.stories} {c.stories === 1 ? "story" : "stories"}</span></span>
            <span className="relative mt-1 block h-2 rounded-full bg-muted"><motion.span className="absolute inset-y-0 left-0 rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${(c.stories / max) * 100}%` }} transition={{ delay: 0.1 + i * 0.05 }} /><span className="absolute top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-foreground bg-card" style={{ left: `calc(${(c.stories / max) * 100}% - 6px)` }} /></span>
          </a></li>;
        })}</ol> : <p className="text-sm text-muted-foreground">No new stories this week yet.</p>}
      </Panel>
    </div>

    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Goofy, last 24 hours" icon={Sparkles}>
        {goofy.length ? <ul className="grid gap-2 sm:grid-cols-2">{goofy.map(([k, n]) => <li key={k} className="flex items-center justify-between rounded-lg border-2 border-foreground/10 px-3 py-2 text-sm"><span>{GOOFY_LABEL[k] ?? k}</span><span className="font-display font-bold tabular-nums">{n}</span></li>)}</ul>
          : <p className="text-sm text-muted-foreground">A quiet day. Nothing for Goofy to do.</p>}
      </Panel>

      <Panel title="Team activity" icon={ScrollText} action={can(me, "audit") ? <button type="button" onClick={() => go("audit")} className="text-xs font-bold text-primary hover:underline">Full log</button> : undefined}>
        {o.recent.length ? <ol className="relative ml-1.5 border-l-2 border-foreground/15">{o.recent.map((r) => <li key={r.id} className="relative pb-3 pl-5 last:pb-0">
          <span className="absolute -left-[7px] top-1.5 size-3 rounded-full border-2 border-foreground bg-card" />
          <p className="text-sm"><span className="font-bold">{r.admin_name ?? "System"}</span> {actionLabel(r.action)}{r.target_ref && <span className="text-muted-foreground"> {r.target_ref}</span>}</p>
          <p className="text-xs text-muted-foreground">{ago(r.created_at)}</p>
        </li>)}</ol> : <p className="text-sm text-muted-foreground">Nothing yet.</p>}
      </Panel>
    </div>
  </div>;
}
