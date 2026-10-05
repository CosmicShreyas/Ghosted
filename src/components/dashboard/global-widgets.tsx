// Platform-wide widgets: the right-hand rail ("At a glance" strip on phones), the red flags stats
// popup and the company popup. All real data with the API (lib/insights, the companies list and
// GET /v1/companies/:slug); mock mode uses sample data in the same shapes.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Charts } from "@/components/lazy-charts";
import { Briefcase, CalendarDays, ExternalLink, Flag, Globe, MapPin, TrendingDown, Users, Wallet } from "lucide-react";
import { CompanyMark, FlagScore, ScoreMeters } from "@/components/ghosted";
import { plainText } from "@/components/markdown";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, apiEnabled } from "@/lib/api";
import { change, useInsights, type Insights } from "@/lib/insights";
import { fromApi, isRated, logoSrc, sampleModels, useCompanyIndex, type CompanyDto, type StoryDto } from "@/lib/stories";
import { useTone } from "@/lib/session";
import { cn } from "@/lib/utils";
import type { Company } from "@/mock/data";
import { activeDot, axis, barCursor, ChartTooltip, grid, INK, lineCursor, SERIES } from "./chart-kit";
import { card, popup, popupBody, scoreTone } from "./ui-kit";

const SALARY_SCALE = 50; // LPA at the right edge of the salary bars
const STAGE_LABEL: Record<string, string> = { application: "Applied", screening: "Screen", technical: "Technical", final: "Final", offer: "Offer" };
// The full, grouped list lives in lib/industries.ts.
import { INDUSTRY_LABEL } from "@/lib/industries";
export { INDUSTRY_LABEL };

const pct = (n: number | null) => (n === null ? null : `${n > 0 ? "+" : ""}${n}%`);

// Friendly empty state for a card with nothing to show yet.
function NotYet({ copy }: { copy: string }) {
  return <p className="mt-3 rounded-lg border-2 border-dashed border-foreground/30 p-3 text-xs text-muted-foreground">{copy}</p>;
}

// ---------- company popup ----------

export function CompanyDrawer({ company, onOpenChange }: { company: Company | null; onOpenChange: (v: boolean) => void }) {
  const q = useQuery({
    queryKey: ["company", company?.id],
    queryFn: async () => api<{ company: CompanyDto; stories: StoryDto[] }>(`/v1/companies/${company!.id}`),
    enabled: apiEnabled && !!company,
  });
  const { index } = useCompanyIndex();
  if (!company) return null;
  const c = company;
  const related = apiEnabled ? (q.data?.stories ?? []).slice(0, 3).map((s) => fromApi(s, index)) : sampleModels().filter((s) => s.company.id === c.id).slice(0, 3);
  const rated = isRated(c);
  const [lo, hi] = c.salary;
  const facts = [
    c.industry && { icon: Briefcase, text: INDUSTRY_LABEL[c.industry] ?? c.industry },
    c.size && { icon: Users, text: `${c.size} people` },
    c.hqCity && { icon: MapPin, text: c.hqCity },
    c.founded && { icon: CalendarDays, text: `Since ${c.founded}` },
  ].filter(Boolean) as { icon: typeof MapPin; text: string }[];

  return <Dialog open={!!company} onOpenChange={onOpenChange}>
    <DialogContent className={popup}>
      <div className={popupBody} data-lenis-prevent>
        <DialogHeader className="pr-8 text-left"><div className="flex items-center gap-3"><CompanyMark company={c} /><div className="min-w-0"><DialogTitle className="font-display text-2xl">{c.name}</DialogTitle><DialogDescription>{c.website ? <a href={c.website} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"><Globe className="size-3.5" />{c.domain ?? c.website}<ExternalLink className="size-3" /></a> : c.summary}</DialogDescription></div></div></DialogHeader>
        {c.about && <p className="mt-4 text-sm leading-relaxed">{c.about}</p>}
        {facts.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{facts.map(({ icon: Icon, text }) => <span key={text} className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-background px-2.5 py-1 text-xs font-bold"><Icon className="size-3.5" />{text}</span>)}</div>}

        {rated ? <>
          <div className="mt-8 flex justify-center"><FlagScore score={c.score} /></div>
          <div className="mt-7"><h3 className="mb-3 font-bold">Full score breakdown</h3><ScoreMeters company={c} />{c.badges.length > 0 && <div className="mt-5 flex flex-wrap gap-2">{c.badges.map((b) => <span key={b} className="rounded-full border-2 border-foreground bg-accent px-3 py-1 text-xs font-bold">{b}</span>)}</div>}</div>
          {hi > 0 && <div className="mt-8">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><h3 className="font-bold">Reported salary range</h3><strong className="whitespace-nowrap">₹{lo}–{hi} LPA</strong></div>
            <div className="relative mt-3 h-3 rounded-full border-2 border-foreground bg-muted"><div className="absolute inset-y-0 rounded-full bg-primary" style={{ left: `${(lo / SALARY_SCALE) * 100}%`, width: `${(Math.min(hi - lo, SALARY_SCALE) / SALARY_SCALE) * 100}%` }} /></div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>₹0</span><span>₹{SALARY_SCALE} LPA</span></div>
          </div>}
        </> : <p className="mt-6 rounded-lg border-2 border-foreground bg-accent p-4 text-sm font-semibold">Newly listed: no Flag Score yet. It appears after the first story.</p>}

        <div className="mt-8 space-y-3"><h3 className="font-bold">Stories about {c.name}</h3>
          {apiEnabled && q.isPending ? <div className="skeleton h-20 rounded-lg" />
            : related.length ? related.map((s) => <div key={s.id} className="rounded-lg border-2 border-foreground bg-card p-4"><p className="text-xs font-bold uppercase text-primary">{s.outcomeLabel}{s.role ? ` · ${s.role}` : ""}</p>{s.title && <p className="mt-1 font-bold">{s.title}</p>}<p className="mt-1 line-clamp-3 text-sm">{plainText(s.body)}</p></div>)
            : <p className="rounded-lg border-2 border-dashed border-foreground/40 p-4 text-sm text-muted-foreground">No stories yet. Suspiciously quiet. Be the first.</p>}
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}

// ---------- red flags popup ----------

export function RedFlagsDialog({ open, onOpenChange, onOpenCompany, data }: { open: boolean; onOpenChange: (v: boolean) => void; onOpenCompany: (c: Company) => void; data: Insights }) {
  const tone = useTone();
  const { index } = useCompanyIndex();
  const peak = data.daily.reduce((a, b) => (b.reports > a.reports ? b : a), data.daily[0] ?? { day: "–", reports: 0 });
  const revoked = pct(change(data.revoked.thisWeek, data.revoked.lastWeek));
  const tiles = [["Ghosting reports", `+${data.ghostedThisWeek}`, "this week"], ["Worst day", peak.reports ? peak.day : "–", `${peak.reports} reports`], ["Offers revoked", revoked ?? String(data.revoked.thisWeek), revoked ? "vs last week" : "this week"]] as const;
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className={popup}>
      <div className={popupBody} data-lenis-prevent>
        <DialogHeader className="pr-8 text-left"><div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg border-2 border-foreground bg-flag-red text-primary-foreground sm:size-12"><Flag className="size-5" /></span>
          <div className="min-w-0"><DialogTitle className="font-display text-xl sm:text-2xl">Recent red flags</DialogTitle><DialogDescription>{tone === "calm" ? "What candidates reported this week." : "What candidates flagged this week. It's been a week."}</DialogDescription></div>
        </div></DialogHeader>
        <div className="mt-5 grid grid-cols-3 gap-2">{tiles.map(([l, n, s]) => <div key={l} className="min-w-0 rounded-lg border-2 border-foreground bg-background p-2 sm:p-3"><p className="text-[9px] font-bold uppercase leading-tight text-muted-foreground sm:text-[10px]">{l}</p><p className="mt-1 truncate font-display text-xl font-bold text-flag-red sm:text-2xl">{n}</p><p className="truncate text-[10px] text-muted-foreground sm:text-[11px]">{s}</p></div>)}</div>
        <div className="mt-6"><h3 className="font-bold">Ghosting reports per day</h3>
          <div className="mt-2 h-40"><Charts>{(R) => <R.ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <R.BarChart data={data.daily} margin={{ left: -24, right: 4, top: 16, bottom: 0 }}>
              <R.CartesianGrid {...grid} /><R.XAxis dataKey="day" {...axis} interval={0} /><R.YAxis {...axis} axisLine={false} allowDecimals={false} />
              <R.Tooltip cursor={barCursor} content={<ChartTooltip unit=" reports" />} />
              <R.Bar dataKey="reports" name="Reports" fill={SERIES.primary} radius={[4, 4, 0, 0]} maxBarSize={36} label={{ position: "top", fontSize: 11, fill: INK, fontWeight: 700 }} activeBar={{ fill: SERIES.primary, stroke: INK, strokeWidth: 2 }} />
            </R.BarChart>
          </R.ResponsiveContainer>}</Charts></div>
        </div>
        <div className="mt-6"><h3 className="font-bold">Most flagged companies this week</h3>
          {data.flags.topCompanies.length ? <div className="mt-3 space-y-2">{data.flags.topCompanies.map((f) => {
            const co = index.get(f.slug);
            return <button key={f.slug} type="button" disabled={!co} onClick={() => { if (co) { onOpenChange(false); onOpenCompany(co); } }} className="flex w-full items-center gap-3 rounded-lg border-2 border-foreground bg-background p-2.5 text-left transition-colors hover:bg-muted">
              <CompanyMark company={{ name: f.name, initial: f.name.charAt(0).toUpperCase(), color: f.color, logoUrl: logoSrc(f.slug, f.logoUrl) }} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm font-bold">{f.name}</span>
              <strong className="inline-flex items-center gap-1 text-flag-red"><Flag className="size-3.5" />{f.flags}</strong>
            </button>;
          })}</div> : <NotYet copy="No red flags this week. Either companies behaved, or nobody's told us yet." />}
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}

// ---------- right rail ----------

// `column`: the desktop right-hand rail. `strip`: phones/tablets, a swipeable row of the same cards.
export function RightRail({ onOpenCompany, layout = "column" }: { onOpenCompany: (c: Company) => void; layout?: "column" | "strip" }) {
  const { data } = useInsights();
  const { list } = useCompanyIndex();
  const [redFlagsOpen, setRedFlagsOpen] = useState(false);
  const strip = layout === "strip";
  const rated = list.filter(isRated);
  const watch = [...rated].sort((a, b) => a.score - b.score).slice(0, 4);
  const slowest = rated.filter((c) => (c.avgDaysWaited ?? 0) > 0).sort((a, b) => (b.avgDaysWaited ?? 0) - (a.avgDaysWaited ?? 0)).slice(0, 5).map((c) => ({ company: c.name.length > 11 ? `${c.name.slice(0, 10)}…` : c.name, days: c.avgDaysWaited ?? 0 }));
  // Days since applying, cumulative by round (the "interview maze").
  let acc = 0;
  const maze = (data?.byStage ?? []).filter((s) => s.avgDays != null).map((s) => ({ round: STAGE_LABEL[s.stage] ?? s.stage, days: (acc += s.avgDays ?? 0) }));
  const revoked = data ? pct(change(data.revoked.thisWeek, data.revoked.lastWeek)) : null;
  const box = (extra?: string) => cn(card, "p-5", strip && "flex flex-col", extra);

  return <>
    {data && <RedFlagsDialog open={redFlagsOpen} onOpenChange={setRedFlagsOpen} onOpenCompany={onOpenCompany} data={data} />}
    <aside aria-label="Highlights" className={strip
      ? "-mx-4 flex items-stretch snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6 no-scrollbar [&>*]:w-[84%] [&>*]:shrink-0 [&>*]:snap-start sm:[&>*]:w-[46%] md:[&>*]:w-[40%]"
      : "space-y-5"}>
      <div className={box()}>
        <h3 className="flex items-center gap-2 font-bold"><TrendingDown className="size-4 text-flag-red" />Companies to watch</h3>
        {watch.length ? <div className="mt-4 space-y-3">{watch.map((c) => <button key={c.id} type="button" className="flex w-full items-center gap-3 rounded-lg p-1 text-left hover:bg-muted" onClick={() => onOpenCompany(c)}><CompanyMark company={c} size="sm" /><span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.name}</span><strong className={scoreTone(c.score)}>{c.score}</strong></button>)}</div>
          : <NotYet copy="Scores appear once companies get their first stories." />}
      </div>

      {data && <button type="button" onClick={() => setRedFlagsOpen(true)} className="card-lift flex w-full flex-col rounded-xl border-2 border-foreground bg-flag-red p-5 text-left text-primary-foreground shadow-hard-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2">
        <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"><span className="font-bold">Recent red flags</span><span className="whitespace-nowrap text-xs font-bold opacity-90">See stats →</span></span>
        <span className="mt-3 block font-display text-4xl font-bold">+{data.ghostedThisWeek}</span>
        <span className="mb-4 block text-sm opacity-85">ghosting reports this week</span>
        <span className="mt-auto block border-t border-primary-foreground/40 pt-3 text-xs">{revoked ? `Offer revocations are ${revoked.startsWith("+") ? "up" : "down"} ${revoked.replace(/[+-]/, "")} vs last week.` : `${data.flags.thisWeek} red flags raised this week.`}</span>
      </button>}

      {data && <div className={box()}>
        <div className="flex items-baseline justify-between gap-2"><h3 className="font-bold">Ghosting this week</h3>{data.peakDay && <span className="text-xs font-bold text-flag-red">peaks {data.peakDay}</span>}</div>
        <p className="text-xs text-muted-foreground">New reports per day</p>
        <div className={cn("mt-3", strip ? "min-h-24 flex-1" : "h-24")}><Charts>{(R) => <R.ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
          <R.AreaChart data={data.daily} margin={{ left: 0, right: 4, top: 6, bottom: 0 }}>
            <defs><linearGradient id="ghost-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={SERIES.primary} stopOpacity={0.35} /><stop offset="100%" stopColor={SERIES.primary} stopOpacity={0.02} /></linearGradient></defs>
            <R.XAxis dataKey="day" {...axis} tick={{ ...axis.tick, fontSize: 10 }} interval={0} padding={{ left: 12, right: 12 }} />
            <R.Tooltip cursor={lineCursor} content={<ChartTooltip unit=" reports" />} />
            <R.Area type="monotone" dataKey="reports" name="Reports" stroke={SERIES.primary} strokeWidth={2} fill="url(#ghost-fill)" dot={false} activeDot={activeDot} />
          </R.AreaChart>
        </R.ResponsiveContainer>}</Charts></div>
      </div>}

      <div className={box()}>
        <h3 className="flex items-center gap-2 font-bold"><Wallet className="size-4 text-primary" />Salary pulse</h3>
        <p className="text-xs text-muted-foreground">Reported ranges, ₹ LPA</p>
        {data?.salaries.length ? <div className="-mx-2 mt-3 space-y-1">{data.salaries.map((r) => {
          const left = (Math.min(r.range[0], SALARY_SCALE) / SALARY_SCALE) * 100, width = (Math.min(r.range[1] - r.range[0], SALARY_SCALE) / SALARY_SCALE) * 100;
          return <div key={r.role} tabIndex={0} aria-label={`${r.role}: ₹${r.range[0]} to ${r.range[1]} LPA, median ₹${r.median}`} className="group cursor-default rounded-lg px-2 py-1.5 outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-foreground">
            <div className="flex justify-between gap-2 text-xs"><span className="truncate font-semibold">{r.role}</span><span className="shrink-0 text-muted-foreground group-hover:hidden group-focus-visible:hidden">median <strong className="text-foreground">₹{r.median}</strong></span><span className="hidden shrink-0 font-bold text-foreground group-hover:inline group-focus-visible:inline">₹{r.range[0]}–{r.range[1]} · median ₹{r.median}</span></div>
            <div className="relative mt-1 h-2 rounded-full bg-background transition-all group-hover:h-3 group-focus-visible:h-3">
              <div className="absolute inset-y-0 rounded-full bg-primary/70 transition-colors group-hover:bg-primary group-focus-visible:bg-primary" style={{ left: `${left}%`, width: `${width}%` }} />
              <div className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-card shadow-sm transition-all group-hover:size-4 group-focus-visible:size-4" style={{ left: `${(Math.min(r.median, SALARY_SCALE) / SALARY_SCALE) * 100}%` }} />
            </div>
          </div>;
        })}</div> : <NotYet copy="Salary ranges show up once stories include them." />}
      </div>

      <div className={box()}>
        <h3 className="font-bold">Slowest to reply</h3>
        <p className="text-xs text-muted-foreground">Average days candidates waited</p>
        {slowest.length ? <div className={cn("mt-3", strip ? "min-h-44 flex-1" : "h-44")}><Charts>{(R) => <R.ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
          <R.BarChart data={slowest} layout="vertical" margin={{ left: 0, right: 28, top: 0, bottom: 0 }} barCategoryGap={6}>
            <R.XAxis type="number" hide /><R.YAxis type="category" dataKey="company" width={78} {...axis} axisLine={false} tick={{ ...axis.tick, fill: INK, fontWeight: 600 }} />
            <R.Tooltip cursor={barCursor} content={<ChartTooltip unit=" days" />} />
            <R.Bar dataKey="days" name="Days" fill={SERIES.primary} radius={[0, 4, 4, 0]} maxBarSize={18} label={{ position: "right", fontSize: 11, fill: INK, fontWeight: 700, formatter: (v: number) => `${v}d` }} activeBar={{ fill: SERIES.primary, stroke: INK, strokeWidth: 2 }} />
          </R.BarChart>
        </R.ResponsiveContainer>}</Charts></div> : <NotYet copy="Appears once stories report how long people waited." />}
      </div>

      <div className={box()}>
        <h3 className="font-bold">Typical interview maze</h3>
        <p className="text-xs text-muted-foreground">Days since applying, by round</p>
        {maze.length >= 2 ? <div className={cn("mt-3", strip ? "min-h-48 flex-1" : "h-48")}><Charts>{(R) => <R.ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
          <R.AreaChart data={maze} margin={{ left: -24, right: 6, top: 8, bottom: 0 }}>
            <defs><linearGradient id="maze-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={SERIES.primary} stopOpacity={0.3} /><stop offset="100%" stopColor={SERIES.primary} stopOpacity={0.03} /></linearGradient></defs>
            <R.CartesianGrid {...grid} /><R.XAxis dataKey="round" {...axis} tick={{ ...axis.tick, fontSize: 10 }} interval={0} padding={{ left: 14, right: 14 }} /><R.YAxis {...axis} axisLine={false} tick={{ ...axis.tick, fontSize: 10 }} />
            <R.Tooltip cursor={lineCursor} content={<ChartTooltip unit=" days" labelFormat={(l) => `After: ${l}`} />} />
            <R.Area type="monotone" dataKey="days" name="Days" stroke={SERIES.primary} strokeWidth={2} fill="url(#maze-fill)" dot={{ r: 3, fill: SERIES.primary, strokeWidth: 0 }} activeDot={activeDot} />
          </R.AreaChart>
        </R.ResponsiveContainer>}</Charts></div> : <NotYet copy="Builds up as stories report the stage they reached." />}
      </div>
    </aside>
  </>;
}
