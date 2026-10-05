// The Insights view: platform-wide numbers for a chosen period (preset or custom dates) and
// filters (industry, size, city, role), each compared with the period before. The period and
// filters live in the dashboard URL, so any view can be bookmarked or shared.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { DateRange } from "react-day-picker";
import { Charts } from "@/components/lazy-charts";
import { ArrowDownRight, ArrowUpRight, CalendarDays, ChevronRight, Download, Flame, Link2, RotateCcw, Search, Timer, Turtle, X, Zap } from "lucide-react";
import { apiEnabled } from "@/lib/api";
import { change, DEFAULT_FILTERS, useInsights, type Group, type InsightFilters, type Insights, type RangePreset } from "@/lib/insights";
import { logoSrc, OUTCOME_LABEL, useCompanyIndex } from "@/lib/stories";
import { useIsTouchLayout } from "@/hooks/use-media-query";
import { CompanyMark } from "@/components/ghosted";
import { SlidingPill, usePill } from "@/components/sliding-pill";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Company } from "@/mock/data";
import { card } from "./widgets";
import { INDUSTRY_LABEL } from "./global-widgets";
import { activeDot, axis, ChartTooltip, grid, lineCursor } from "./chart-kit";
import { toast } from "sonner";
import { GhostedWrapped } from "./wrapped";

const SERIES = { ghosted: "var(--chart-violet)", offers: "var(--chart-cyan)" };
const STAGE_NAME: Record<string, string> = { application: "Application", screening: "Screening", technical: "Technical", final: "Final round", offer: "Offer" };
const OUTCOME_ORDER = ["ghosted", "ghost_job", "rejected", "offer_revoked", "offer"];
// Five distinct fills so the stacked bar reads without relying on red alone.
const OUTCOME_COLOR: Record<string, string> = { ghosted: "var(--chart-violet)", ghost_job: "var(--flag-red)", rejected: "var(--flag-amber)", offer_revoked: "var(--muted-foreground)", offer: "var(--flag-green)" };
const PRESETS: { id: RangePreset; label: string; long: string }[] = [
  { id: "7d", label: "7 days", long: "the previous 7 days" }, { id: "30d", label: "30 days", long: "the previous 30 days" },
  { id: "90d", label: "90 days", long: "the previous 90 days" }, { id: "12m", label: "12 months", long: "the previous 12 months" },
];
const SIZE_LABEL: Record<string, string> = { "1-10": "1–10 people", "11-50": "11–50 people", "51-200": "51–200 people", "201-1000": "201–1,000 people", "1001-5000": "1,001–5,000 people", "5000+": "5,000+ people" };
const DAY = 86400_000;

const fmtDay = (iso: string, withYear = false) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(withYear && { year: "numeric" }) });
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function SectionHead({ title, action }: { title: string; action?: ReactNode }) {
  return <div className="flex flex-wrap items-end justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold uppercase text-primary">The bigger picture</p><h2 className="text-2xl font-bold">{title}</h2></div>{action}</div>;
}

// A section card with a title, an optional one-line explanation and an optional control on the right.
function Panel({ title, note, icon, action, className, children }: { title: string; note?: string; icon?: ReactNode; action?: ReactNode; className?: string; children: ReactNode }) {
  return <section className={cn(card, "min-w-0 p-5", className)}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0"><h3 className="flex items-center gap-2 font-bold">{icon}{title}</h3>{note && <p className="text-xs text-muted-foreground">{note}</p>}</div>
      {action}
    </div>
    {children}
  </section>;
}

// "+12% vs previous 30 days". `goodWhenUp` picks the colour: more offers is good, more ghosting isn't.
function Delta({ now, before, goodWhenUp = false, points = false }: { now: number | null; before: number | null; goodWhenUp?: boolean; points?: boolean }) {
  if (now == null || before == null) return null;
  const d = points ? now - before : change(now, before);
  if (d == null) return null;
  if (d === 0) return <span className="rounded-full bg-muted px-1.5 text-[11px] font-bold text-muted-foreground">no change</span>;
  const good = goodWhenUp ? d > 0 : d < 0;
  const Icon = d > 0 ? ArrowUpRight : ArrowDownRight;
  return <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 text-[11px] font-bold tabular-nums", good ? "bg-flag-green/15 text-flag-green" : "bg-flag-red/15 text-flag-red")}><Icon className="size-3" />{d > 0 ? "+" : ""}{d}{points ? " pts" : "%"}</span>;
}

// ---------- controls ----------

function RangeControl({ filters, onFilters, bounds }: { filters: InsightFilters; onFilters: (f: InsightFilters) => void; bounds: { from: string; to: string } | null }) {
  const touch = useIsTouchLayout();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const earliest = new Date(today.getTime() - 730 * DAY);
  useEffect(() => {
    if (!open) return;
    setDraft(filters.range === "custom" && filters.from && filters.to ? { from: new Date(`${filters.from}T00:00:00`), to: new Date(`${filters.to}T00:00:00`) } : bounds ? { from: new Date(`${bounds.from}T00:00:00`), to: new Date(`${bounds.to}T00:00:00`) } : undefined);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const apply = () => { if (draft?.from && draft.to) { onFilters({ ...filters, range: "custom", from: iso(draft.from), to: iso(draft.to) }); setOpen(false); } };
  const days = draft?.from && draft.to ? Math.round((draft.to.getTime() - draft.from.getTime()) / DAY) + 1 : 0;
  const custom = filters.range === "custom";
  const pill = usePill(filters.range);

  const picker = <div className="space-y-3">
    <Calendar mode="range" numberOfMonths={touch ? 1 : 2} selected={draft} onSelect={setDraft} defaultMonth={draft?.from ?? new Date(today.getTime() - 30 * DAY)}
      disabled={[{ after: today }, { before: earliest }]} startMonth={earliest} endMonth={today} className="mx-auto rounded-lg [--cell-size:2.4rem] sm:[--cell-size:2.1rem]" />
    <div className="flex flex-wrap gap-1.5 px-1">{[["Last 14 days", 14], ["Last 60 days", 60], ["Last 6 months", 182], ["This year", Math.round((today.getTime() - new Date(today.getFullYear(), 0, 1).getTime()) / DAY) + 1]].map(([l, n]) =>
      <button key={l as string} type="button" onClick={() => setDraft({ from: new Date(today.getTime() - ((n as number) - 1) * DAY), to: today })} className="rounded-full border-2 border-foreground/15 px-2.5 py-1 text-xs font-semibold hover:border-foreground">{l}</button>)}</div>
    <div className="flex items-center justify-between gap-3 border-t-2 border-foreground/10 px-1 pt-3">
      <p className="text-sm text-muted-foreground">{draft?.from && draft.to ? <><span className="font-bold text-foreground">{fmtDay(iso(draft.from))} – {fmtDay(iso(draft.to), true)}</span> · {days} {days === 1 ? "day" : "days"}</> : "Pick a start and an end day"}</p>
      <Button size="sm" onClick={apply} disabled={!draft?.from || !draft.to}>Apply</Button>
    </div>
  </div>;

  const trigger = <button type="button" data-pill="custom" onClick={() => setOpen(true)} className={cn("relative inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold transition-colors", custom ? "text-primary-foreground" : "hover:bg-muted")}>
    <CalendarDays className="relative size-4" /><span className="relative">{custom && filters.from && filters.to ? `${fmtDay(filters.from)} – ${fmtDay(filters.to)}` : "Custom"}</span>
  </button>;

  return <div ref={pill.ref} className="no-scrollbar relative -mx-1 flex items-center gap-1 overflow-x-auto px-1 py-0.5" role="group" aria-label="Period">
    <SlidingPill pill={pill} className="rounded-lg border-2 border-foreground bg-primary shadow-hard-sm" />
    {PRESETS.map((p) => {
      const on = filters.range === p.id;
      return <button key={p.id} data-pill={p.id} type="button" aria-pressed={on} onClick={() => onFilters({ ...filters, range: p.id, from: undefined, to: undefined })} className={cn("relative shrink-0 rounded-lg px-3 py-1.5 text-sm font-bold transition-colors", on ? "text-primary-foreground" : "hover:bg-muted")}>
        <span className="relative">{p.label}</span>
      </button>;
    })}
    {touch ? <>
      {trigger}
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="rounded-t-2xl border-2 border-b-0 border-foreground bg-card pb-[max(1rem,env(safe-area-inset-bottom))]">
          <DrawerHeader className="text-left"><DrawerTitle>Custom period</DrawerTitle><DrawerDescription>Any stretch of up to two years.</DrawerDescription></DrawerHeader>
          <div className="px-4">{picker}</div>
        </DrawerContent>
      </Drawer>
    </> : <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-auto rounded-xl border-2 border-foreground bg-card p-3 shadow-hard">{picker}</PopoverContent>
    </Popover>}
  </div>;
}

function FilterSelect({ label, value, options, onChange, format }: { label: string; value?: string | undefined;options: { value: string; label: string; count: number }[]; onChange: (v: string | undefined) => void; format?: (v: string) => string }) {
  const known = value && !options.some((o) => o.value === value) ? [{ value, label: value, count: 0 }, ...options] : options;
  return <Select value={value ?? "all"} onValueChange={(v) => onChange(v === "all" ? undefined : v)}>
    <SelectTrigger aria-label={label} className={cn("h-9 w-auto min-w-0 max-w-[13rem] shrink-0 gap-1.5 rounded-lg border-2 text-sm font-semibold", value ? "border-foreground bg-accent text-accent-foreground" : "border-foreground/20")}>
      <SelectValue placeholder={label} />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="all">Any {label.toLowerCase()}</SelectItem>
      {known.map((o) => <SelectItem key={o.value} value={o.value}><span className="flex w-full items-center justify-between gap-4"><span>{format ? format(o.label) : o.label}</span>{o.count > 0 && <span className="text-xs text-muted-foreground tabular-nums">{o.count}</span>}</span></SelectItem>)}
    </SelectContent>
  </Select>;
}


function exportCsv(d: Insights, f: InsightFilters) {
  const p = d.period;
  const rows: (string | number | null)[][] = [["Ghosted insights", `${p.from} to ${p.to}`], ["Filters", [f.industry && `industry=${f.industry}`, f.size && `size=${f.size}`, f.city && `city=${f.city}`, f.role && `role=${f.role}`].filter(Boolean).join("; ") || "none"], []];
  rows.push(["Metric", "This period", "Previous period"]);
  for (const [k, l] of [["stories", "Stories"], ["ghostRate", "Ghosting rate %"], ["replyRate", "Reply rate %"], ["medianDays", "Median wait (days)"], ["avgDays", "Average wait (days)"], ["flags", "Red flags"], ["offers", "Offers"], ["revoked", "Offers revoked"]] as const) rows.push([l, p.current[k], p.previous[k]]);
  rows.push([], ["Outcome", "Stories"], ...d.outcomes.map((o) => [OUTCOME_LABEL[o.outcome] ?? o.outcome, o.count]));
  rows.push([], ["Period start", "Ghosted", "Offers", "All stories"], ...p.trend.map((t) => [t.start, t.ghosted, t.offers, t.total]));
  rows.push([], ["Round", "Stories that reached it", "Went silent here", "Median wait (days)"], ...p.funnel.map((s) => [STAGE_NAME[s.stage] ?? s.stage, s.reached, s.silentHere, d.byStage.find((b) => b.stage === s.stage)?.avgDays ?? null]));
  rows.push([], ["Wait", "Stories"], ...p.waitSpread.map((w) => [w.label, w.count]));
  rows.push([], ["Industry", "Stories", "Ghosting rate %"], ...p.byIndustry.map((g) => [INDUSTRY_LABEL[g.label] ?? g.label, g.stories, g.ghostRate]));
  rows.push([], ["City", "Stories", "Ghosting rate %"], ...p.byCity.map((g) => [g.label, g.stories, g.ghostRate]));
  rows.push([], ["Company", "Median wait (days)", "Stories"], ...[...p.repliers.fastest, ...p.repliers.slowest].map((r) => [r.name, r.medianDays, r.stories]));
  rows.push([], ["Day", "Silent", "All stories"], ...p.heat.map((h) => [h.date, h.silent, h.total]));
  const csv = rows.map((r) => r.map((c) => { const s = c == null ? "" : String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(",")).join("\n");
  // The leading byte-order mark makes Excel read the file as UTF-8 (₹, –, names in any script).
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `ghosted-insights-${p.from}-to-${p.to}.csv` });
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Controls({ data, filters, onFilters }: { data: Insights | null; filters: InsightFilters; onFilters: (f: InsightFilters) => void }) {
  const o = data?.period.filterOptions;
  const set = (k: "industry" | "size" | "city" | "role") => (v: string | undefined) => onFilters({ ...filters, [k]: v });
  const active = !!(filters.industry || filters.size || filters.city) || filters.range !== DEFAULT_FILTERS.range;
  return <div className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-20 -mx-4 space-y-2 border-b-2 border-foreground/10 bg-background/95 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6">
    <div className="flex items-center justify-between gap-2">
      <RangeControl filters={filters} onFilters={onFilters} bounds={data ? { from: data.period.from, to: data.period.to } : null} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="shrink-0 gap-1.5" disabled={!data}><Download className="size-4" /><span className="hidden sm:inline">Export</span></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => data && exportCsv(data, filters)}><Download className="size-4" />Download CSV</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => { void navigator.clipboard?.writeText(window.location.href).then(() => toast.success("Link copied. It opens this exact view.")); }}><Link2 className="size-4" />Copy link to this view</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <div className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-0.5">
      <FilterSelect label="Industry" value={filters.industry} options={o?.industry ?? []} onChange={set("industry")} format={(v) => INDUSTRY_LABEL[v] ?? v} />
      <FilterSelect label="Size" value={filters.size} options={o?.size ?? []} onChange={set("size")} format={(v) => SIZE_LABEL[v] ?? v} />
      <FilterSelect label="City" value={filters.city} options={o?.city ?? []} onChange={set("city")} />
      {filters.role && <span className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border-2 border-foreground bg-accent px-2.5 text-sm font-semibold text-accent-foreground"><Search className="size-3.5" />Role: {filters.role}<span className="font-normal opacity-70">(from search)</span></span>}
      {active && <button type="button" onClick={() => onFilters(DEFAULT_FILTERS)} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"><RotateCcw className="size-3.5" />Reset</button>}
    </div>
  </div>;
}

// ---------- sections ----------

// GitHub-style: one square per day, weeks as columns, darker on days with more silent endings.
function Heatmap({ heat }: { heat: Insights["period"]["heat"] }) {
  const [picked, setPicked] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const { weeks, max, months } = useMemo(() => {
    const first = heat[0] ? new Date(`${heat[0].date}T00:00:00`) : new Date();
    const pad = (first.getDay() + 6) % 7; // start the first column on a Monday
    const cells: (typeof heat[number] | null)[] = [...Array<null>(pad).fill(null), ...heat];
    const weeks: (typeof heat[number] | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    const months: { col: number; label: string }[] = [];
    weeks.forEach((w, i) => { const d = w.find((c) => c && c.date.endsWith("-01")) ?? (i === 0 ? w.find(Boolean) : null); if (d) months.push({ col: i, label: new Date(`${d.date}T00:00:00`).toLocaleDateString("en-IN", { month: "short" }) }); });
    return { weeks, max: Math.max(1, ...heat.map((h) => h.silent)), months };
  }, [heat]);
  useEffect(() => { const el = scroller.current; if (el) el.scrollLeft = el.scrollWidth; }, [weeks.length]);
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  const FILL = ["var(--muted)", "color-mix(in oklch, var(--chart-violet), transparent 72%)", "color-mix(in oklch, var(--chart-violet), transparent 48%)", "color-mix(in oklch, var(--chart-violet), transparent 22%)", "var(--chart-violet)"];
  const sel = heat.find((h) => h.date === picked);
  const busiest = heat.reduce<typeof heat[number] | null>((a, b) => (!a || b.silent > a.silent ? b : a), null);
  const big = weeks.length <= 6; // short periods get bigger squares
  const size = big ? "size-7 sm:size-8" : "size-3 sm:size-3.5";
  return <div className="mt-4">
    <div ref={scroller} data-lenis-prevent className="no-scrollbar overflow-x-auto pb-1">
      <div className="inline-flex gap-1.5">
        <div className={cn("grid shrink-0 grid-rows-7 gap-[3px] pt-5 text-[10px] text-muted-foreground", big && "gap-1")}>{["Mon", "", "Wed", "", "Fri", "", "Sun"].map((d, i) => <span key={i} className={cn("flex items-center leading-none", big ? "h-7 sm:h-8" : "h-3 sm:h-3.5")}>{d}</span>)}</div>
        <div>
          <div className="relative h-5 text-[10px] text-muted-foreground">{months.map((m) => <span key={m.col} className="absolute top-0" style={{ left: `calc(${m.col} * (${big ? "2rem" : "0.75rem"} + ${big ? "4px" : "3px"}))` }}>{m.label}</span>)}</div>
          <div className={cn("flex", big ? "gap-1" : "gap-[3px]")}>{weeks.map((w, i) => <div key={i} className={cn("grid grid-rows-7", big ? "gap-1" : "gap-[3px]")}>
            {Array.from({ length: 7 }, (_, j) => { const c = w[j]; return c
              ? <button key={j} type="button" onClick={() => setPicked(c.date === picked ? null : c.date)} aria-label={`${fmtDay(c.date, true)}: ${c.silent} silent of ${c.total}`} title={`${fmtDay(c.date, true)}: ${c.silent} silent of ${c.total}`}
                className={cn(size, "rounded-[3px] transition-transform hover:scale-125", c.date === picked && "ring-2 ring-foreground ring-offset-1 ring-offset-card")} style={{ background: FILL[level(c.silent)] }} />
              : <span key={j} className={size} />; })}
          </div>)}</div>
        </div>
      </div>
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <AnimatePresence mode="wait" initial={false}>
        <motion.p key={sel?.date ?? "none"} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          {sel ? <><span className="font-bold text-foreground">{fmtDay(sel.date, true)}</span>: {sel.silent} ended in silence, out of {sel.total} {sel.total === 1 ? "story" : "stories"}</>
            : busiest && busiest.silent > 0 ? <>Worst day: <span className="font-bold text-foreground">{fmtDay(busiest.date, true)}</span>, with {busiest.silent} silent endings. Tap a square for its day.</> : "Tap a square to see that day."}
        </motion.p>
      </AnimatePresence>
      <span className="flex items-center gap-1">Less{FILL.map((f, i) => <span key={i} className="size-2.5 rounded-[2px]" style={{ background: f }} />)}More</span>
    </div>
  </div>;
}

// Under the funnel: the takeaways, pinned to the bottom of the card so it fills its height.
function FunnelTakeaways({ funnel }: { funnel: Insights["period"]["funnel"] }) {
  const top = Math.max(1, funnel[0]?.reached ?? 0);
  const at = (s: string) => funnel.find((f) => f.stage === s)?.reached ?? 0;
  const drops = funnel.slice(1).map((s, i) => ({ from: funnel[i]!, to: s, lost: funnel[i]!.reached - s.reached }));
  const worst = drops.reduce<typeof drops[number] | null>((m, d) => (!m || d.lost > m.lost ? d : m), null);
  const silentMost = funnel.reduce((m, s) => (s.silentHere > m.silentHere ? s : m), funnel[0]!);
  const silentTotal = funnel.reduce((n, s) => n + s.silentHere, 0);
  const items = [
    { icon: ArrowDownRight, tone: "text-flag-red", label: "Biggest drop-off", value: worst && worst.lost > 0 ? `${STAGE_NAME[worst.from.stage]} to ${STAGE_NAME[worst.to.stage]?.toLowerCase()}` : "None yet", sub: worst && worst.lost > 0 ? `${Math.round((worst.lost / Math.max(1, worst.from.reached)) * 100)}% didn't make it past this step` : "Not enough stories" },
    { icon: Flame, tone: "text-primary", label: "Reached the final round", value: `${Math.round((at("final") / top) * 100)}%`, sub: `${at("final").toLocaleString("en-IN")} of ${top.toLocaleString("en-IN")} stories` },
    { icon: Zap, tone: "text-flag-green", label: "Ended with an offer", value: `${Math.round((at("offer") / top) * 100)}%`, sub: at("final") ? `${Math.round((at("offer") / Math.max(1, at("final"))) * 100)}% of final-round candidates` : "No final rounds yet" },
    { icon: Timer, tone: "text-flag-red", label: "Silence hits hardest", value: silentMost.silentHere ? `After ${STAGE_NAME[silentMost.stage]?.toLowerCase()}` : "Nowhere yet", sub: silentTotal ? `${Math.round((silentMost.silentHere / silentTotal) * 100)}% of all silent endings` : "No silent endings" },
  ];
  return <div className="mt-auto pt-5">
    <div className="grid grid-cols-2 gap-2.5 border-t-2 border-foreground/10 pt-4">{items.map((it) => <div key={it.label} className="rounded-lg bg-muted/60 p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground"><it.icon className={cn("size-3.5", it.tone)} />{it.label}</p>
      <p className="mt-1 font-display text-lg font-bold leading-tight">{it.value}</p>
      <p className="text-[11px] text-muted-foreground">{it.sub}</p>
    </div>)}</div>
  </div>;
}

function Funnel({ funnel }: { funnel: Insights["period"]["funnel"] }) {
  const top = Math.max(1, funnel[0]?.reached ?? 0);
  return <ol className="mt-4 space-y-2.5">{funnel.map((s, i) => {
    const pct = Math.round((s.reached / top) * 100);
    return <li key={s.stage}>
      <div className="flex items-baseline justify-between gap-2 text-sm"><span className="font-semibold">{STAGE_NAME[s.stage] ?? s.stage}</span><span className="tabular-nums"><span className="font-bold">{s.reached.toLocaleString("en-IN")}</span> <span className="text-xs text-muted-foreground">({pct}%)</span></span></div>
      <div className="mt-1 h-7 overflow-hidden rounded-md bg-muted">
        <motion.div className="flex h-full items-center justify-end rounded-md px-2 text-[11px] font-bold text-white" style={{ background: s.stage === "offer" ? "var(--flag-green)" : SERIES.ghosted }} initial={{ width: 0 }} animate={{ width: s.reached ? `${Math.max(pct, 3)}%` : "0%" }} transition={{ delay: i * 0.07, type: "spring", stiffness: 110, damping: 20 }} />
      </div>
      {s.silentHere > 0 && <p className="mt-0.5 text-xs text-flag-red">{s.silentHere.toLocaleString("en-IN")} went silent after this round</p>}
    </li>;
  })}</ol>;
}

// A small column chart made of divs: light on phones, no chart library needed.
function Columns({ items, highlight, unit }: { items: { label: string; value: number; sub?: string }[]; highlight?: number; unit?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return <div className="mt-4 flex h-44 items-end gap-2 sm:gap-3">{items.map((it, i) => <div key={it.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
    <span className="text-xs font-bold tabular-nums">{it.value.toLocaleString("en-IN")}{unit}</span>
    <motion.div className="w-full max-w-14 rounded-t-md border-2 border-b-0 border-foreground" style={{ background: i === highlight ? "var(--flag-red)" : SERIES.ghosted }} initial={{ height: 0 }} animate={{ height: `${Math.max((it.value / max) * 100, 2)}%` }} transition={{ delay: i * 0.05, type: "spring", stiffness: 120, damping: 20 }} />
    <span className="w-full truncate border-t-2 border-foreground pt-1 text-center text-[11px] text-muted-foreground">{it.label}</span>
    {it.sub && <span className="-mt-1 text-[10px] text-muted-foreground">{it.sub}</span>}
  </div>)}</div>;
}

function Breakdown({ industry, city }: { industry: Group[]; city: Group[] }) {
  const [tab, setTab] = useState<"industry" | "city">("industry");
  const list = tab === "industry" ? industry : city;
  const max = Math.max(1, ...list.map((g) => g.ghostRate));
  return <Panel title="Where the silence is worst" note="Ghosting rate by group. Groups under 5 stories are hidden, so nobody can be singled out."
    action={<div className="relative grid grid-cols-2 rounded-lg border-2 border-foreground p-0.5 text-xs font-bold" role="tablist">
      <motion.span aria-hidden="true" className="absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-md bg-primary" initial={false} animate={{ x: tab === "industry" ? "0%" : "100%" }} transition={{ type: "spring", stiffness: 420, damping: 34 }} />
      {(["industry", "city"] as const).map((t) => <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("relative rounded-md px-2.5 py-1 transition-colors", tab === t ? "text-primary-foreground" : "")}>
      <span className="relative">{t === "industry" ? "Industry" : "City"}</span></button>)}</div>}>
    {list.length ? <ul className="mt-4 space-y-3">{list.map((g, i) => <li key={g.key}>
      <div className="flex justify-between gap-2 text-sm"><span className="truncate">{tab === "industry" ? INDUSTRY_LABEL[g.label] ?? g.label : g.label}</span><span className="shrink-0 tabular-nums"><span className="font-bold">{g.ghostRate}%</span> <span className="text-xs text-muted-foreground">of {g.stories}</span></span></div>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted"><motion.div key={`${tab}-${g.key}`} className="h-full rounded-full" style={{ background: i === 0 ? "var(--flag-red)" : SERIES.ghosted }} initial={{ width: 0 }} animate={{ width: `${(g.ghostRate / max) * 100}%` }} transition={{ delay: i * 0.05, type: "spring", stiffness: 120, damping: 20 }} /></div>
    </li>)}</ul> : <p className="mt-4 text-sm text-muted-foreground">Not enough stories in any one {tab} yet.</p>}
  </Panel>;
}

type Ranked = Insights["period"]["repliers"]["fastest"][number];
function ReplierList({ list, tone, openCompany }: { list: Ranked[]; tone: "fast" | "slow"; openCompany?: ((c: Company) => void) | undefined }) {
  const { index } = useCompanyIndex();
  if (!list.length) return <p className="py-3 text-sm text-muted-foreground">Needs at least 3 stories with a wait from a company.</p>;
  return <ol className="divide-y-2 divide-foreground/10">{list.map((r, i) => {
    const co = index.get(r.slug);
    return <li key={r.slug}><button type="button" disabled={!co || !openCompany} onClick={() => co && openCompany?.(co)} className="flex w-full items-center gap-3 py-2.5 text-left">
      <span className="w-4 text-sm font-bold text-muted-foreground tabular-nums">{i + 1}</span>
      <CompanyMark size="sm" company={{ name: r.name, initial: r.name[0] ?? "?", color: r.color, logoUrl: logoSrc(r.slug, r.logoUrl) }} />
      <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{r.name}</span><span className="text-xs text-muted-foreground">{r.stories} stories</span></span>
      <span className={cn("rounded-full px-2 py-0.5 text-sm font-bold tabular-nums", tone === "fast" ? "bg-flag-green/15 text-flag-green" : "bg-flag-red/15 text-flag-red")}>{r.medianDays}d</span>
      {co && openCompany && <ChevronRight className="size-4 text-muted-foreground" />}
    </button></li>;
  })}</ol>;
}

function Skeleton() {
  // Shaped like the page (headline, tiles, a chart), with the feed's light wave (.skeleton).
  return <div className="space-y-4" role="status" aria-label="Loading insights">
    <div className={cn(card, "space-y-3 p-5 sm:p-6")}><div className="skeleton h-3 w-44" /><div className="skeleton h-14 w-28" /><div className="skeleton h-4 w-full rounded-full" /><div className="flex flex-wrap gap-4">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-3 w-20" />)}</div></div>
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <div key={i} className={cn(card, "space-y-2 p-4")}><div className="skeleton h-3 w-20" /><div className="skeleton h-7 w-14" /><div className="skeleton h-3 w-16 rounded-full" /></div>)}</div>
    <div className={cn(card, "p-5")}><div className="skeleton h-4 w-36" /><div className="skeleton mt-2 h-3 w-64" /><div className="mt-4 flex items-end gap-2">{[40, 70, 55, 90, 65, 80, 50, 75, 60, 85].map((h, i) => <div key={i} className="skeleton flex-1 rounded-t-md" style={{ height: `${h * 1.6}px` }} />)}</div></div>
  </div>;
}

// ---------- the view ----------

// `query` is the top bar's search: on this view it filters by role (after a pause in typing).
export function InsightsView({ openCompany, filters = DEFAULT_FILTERS, onFilters, query = "" }: { openCompany?: (c: Company) => void; filters?: InsightFilters; onFilters?: (f: InsightFilters) => void; query?: string }) {
  const [local, setLocal] = useState(filters);
  useEffect(() => setLocal(filters), [JSON.stringify(filters)]); // eslint-disable-line react-hooks/exhaustive-deps
  const update = (f: InsightFilters) => { const { role: _, ...rest } = f; setLocal(rest); onFilters?.(rest); };
  const [role, setRole] = useState<string | undefined>();
  useEffect(() => { const t = setTimeout(() => { const v = query.trim(); setRole(v.length >= 2 ? v.slice(0, 60) : undefined); }, 400); return () => clearTimeout(t); }, [query]);
  const active = useMemo(() => ({ ...local, role }), [local, role]);
  const { data, loading, refreshing, error } = useInsights(active);
  const { index } = useCompanyIndex();

  const head = <SectionHead title="Insights" action={!apiEnabled && <span className="rounded-full border-2 border-foreground bg-accent px-3 py-1 text-xs font-bold">Preview: sample data</span>} />;
  if (loading) return <div className="space-y-4">{head}<Controls data={null} filters={active} onFilters={update} /><Skeleton /></div>;
  if (!data) return <div className="space-y-4">{head}<Controls data={null} filters={active} onFilters={update} /><EmptyState title="Couldn't load insights" copy={error ?? "Check your connection and try again."} /></div>;

  const p = data.period;
  const cur = p.current, prev = p.previous;
  const vs = local.range === "custom" ? "the period before" : PRESETS.find((x) => x.id === local.range)!.long;
  const filtered = !!(local.industry || local.size || local.city || role);
  const total = cur.stories;
  const pct = (n: number) => Math.round((n / Math.max(1, total)) * 100);
  const outcomes = OUTCOME_ORDER.map((k) => ({ key: k, label: OUTCOME_LABEL[k] ?? k, count: data.outcomes.find((o) => o.outcome === k)?.count ?? 0 })).filter((o) => o.count > 0);
  const rounds = data.byStage.filter((s) => s.avgDays != null).map((s) => ({ round: STAGE_NAME[s.stage] ?? s.stage, days: s.avgDays! }));
  const slowest = Math.max(1, ...rounds.map((r) => r.days));
  const salaryMax = Math.max(1, ...data.salaries.map((s) => s.range[1]));
  const worstWeekday = p.weekdays.reduce((a, b) => (b.silent > a.silent ? b : a), p.weekdays[0]!);
  const trendLabel = (s: string) => p.bucket === "month" ? new Date(`${s}T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "2-digit" }) : fmtDay(s);
  const tiles: { label: string; value: string; delta?: ReactNode; note?: string }[] = [
    { label: "Stories shared", value: total.toLocaleString("en-IN"), delta: <Delta now={cur.stories} before={prev.stories} goodWhenUp /> },
    { label: "Got any reply", value: cur.replyRate != null ? `${cur.replyRate}%` : "–", delta: <Delta now={cur.replyRate} before={prev.replyRate} goodWhenUp points /> },
    { label: "Median wait", value: cur.medianDays != null ? `${cur.medianDays}d` : "–", delta: <Delta now={cur.medianDays} before={prev.medianDays} /> },
    { label: "Average wait", value: cur.avgDays != null ? `${cur.avgDays}d` : "–", delta: <Delta now={cur.avgDays} before={prev.avgDays} /> },
    { label: "Red flags raised", value: cur.flags.toLocaleString("en-IN"), delta: <Delta now={cur.flags} before={prev.flags} /> },
    { label: "Offers made", value: cur.offers.toLocaleString("en-IN"), delta: <Delta now={cur.offers} before={prev.offers} goodWhenUp /> },
    { label: "Offers revoked", value: cur.revoked.toLocaleString("en-IN"), delta: <Delta now={cur.revoked} before={prev.revoked} /> },
    { label: "Quietest weekday", value: worstWeekday.silent ? worstWeekday.day : "–", note: worstWeekday.silent ? `${Math.round((worstWeekday.silent / Math.max(1, worstWeekday.total)) * 100)}% of its stories went silent` : "no silence yet" },
  ];

  return <div className="space-y-4 sm:space-y-5">
    {head}
    <GhostedWrapped />
    <Controls data={data} filters={active} onFilters={update} />

    <div className={cn("space-y-4 transition-opacity sm:space-y-5", refreshing && "opacity-60")}>
      <p className="text-sm text-muted-foreground"><span className="font-bold text-foreground">{fmtDay(p.from, true)} – {fmtDay(p.to, true)}</span>{filtered && " · filtered"} · compared with {vs}</p>

      {total === 0 ? <EmptyState title="No stories in this period" copy={filtered ? "Nothing matches these filters here. Try a longer period or fewer filters." : "Try a longer period."} action={<Button variant="outline" onClick={() => update(DEFAULT_FILTERS)}><RotateCcw className="size-4" />Reset to 90 days</Button>} /> : <>

      {/* The headline: how often stories end in silence, and how the rest split. */}
      <section className={cn(card, "p-5 sm:p-6")}>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <p className="text-sm font-semibold text-muted-foreground">Stories that ended in silence</p>
            <div className="flex items-end gap-3">
              <p className="font-display text-6xl font-bold leading-none tracking-tight sm:text-7xl">{cur.ghostRate ?? 0}<span className="text-3xl sm:text-4xl">%</span></p>
              <span className="mb-1.5 flex flex-col items-start gap-0.5">
                <Delta now={cur.ghostRate} before={prev.ghostRate} points />
                {p.significance && cur.ghostRate !== prev.ghostRate && <span className="text-[11px] text-muted-foreground">{p.significance.ghostRate ? "a real change" : "within normal ups and downs"}</span>}
              </span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">out of <span className="font-bold text-foreground">{total.toLocaleString("en-IN")}</span> stories shared</p>
        </div>
        <div className="mt-5 flex h-4 overflow-hidden rounded-full border-2 border-foreground" role="img" aria-label={outcomes.map((o) => `${o.label} ${pct(o.count)}%`).join(", ")}>
          {outcomes.map((o, i) => <motion.div key={o.key} className="h-full border-foreground [&:not(:last-child)]:border-r-2" style={{ background: OUTCOME_COLOR[o.key] }} initial={{ width: 0 }} animate={{ width: `${(o.count / Math.max(1, total)) * 100}%` }} transition={{ delay: i * 0.06, type: "spring", stiffness: 110, damping: 20 }} />)}
        </div>
        <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:flex sm:flex-wrap sm:gap-x-6">
          {outcomes.map((o) => <li key={o.key} className="flex items-center gap-2 text-sm sm:gap-1.5">
            <span className="size-3 shrink-0 rounded-sm border border-foreground" style={{ background: OUTCOME_COLOR[o.key] }} />
            <span className="min-w-0 truncate">{o.label}</span>
            <span className="ml-auto font-bold tabular-nums">{pct(o.count)}%</span>
          </li>)}
        </ul>
      </section>

      {/* Eight small numbers: two per row on phones, four from tablets up. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        {tiles.map((t) => <div key={t.label} className={cn(card, "flex flex-col p-4")}>
          <p className="text-xs font-semibold text-muted-foreground">{t.label}</p>
          <p className="mt-1 font-display text-2xl font-bold sm:text-3xl">{t.value}</p>
          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1 text-xs text-muted-foreground">{t.delta}{t.note ?? <span>vs before</span>}</div>
        </div>)}
      </div>

      <Panel title="Silence calendar" note="Each square is a day. Darker means more stories that ended with no reply.">
        <Heatmap heat={p.heat} />
      </Panel>

      <div className="grid gap-4 sm:gap-5 xl:grid-cols-5">
        <Panel className="xl:col-span-3" title={`Ghosted vs offers, ${p.bucket === "day" ? "day by day" : p.bucket === "week" ? "week by week" : "month by month"}`}>
          <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: SERIES.ghosted }} />Ghosted</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded border-t-2 border-dashed" style={{ borderColor: SERIES.offers }} />Offers</span>
            {p.direction && <span className="ml-auto font-semibold">Ghosting {p.direction.ghosted === "flat" ? "holding steady" : p.direction.ghosted}, offers {p.direction.offers === "flat" ? "holding steady" : p.direction.offers}</span>}
          </div>
          <div className="mt-3 h-56 sm:h-64"><Charts>{(R) => <R.ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <R.LineChart data={p.trend} margin={{ left: 0, right: 8, top: 8 }}>
              <R.CartesianGrid {...grid} />
              <R.XAxis dataKey="start" {...axis} tickFormatter={trendLabel} minTickGap={24} />
              <R.YAxis {...axis} axisLine={false} width={32} allowDecimals={false} />
              <R.Tooltip cursor={lineCursor} content={<ChartTooltip unit="" labelFormat={(l) => (p.bucket === "day" ? fmtDay(String(l), true) : p.bucket === "week" ? `Week of ${fmtDay(String(l))}` : trendLabel(String(l)))} />} />
              <R.Line type="monotone" dataKey="ghosted" name="Ghosted" stroke={SERIES.ghosted} strokeWidth={2.5} dot={false} activeDot={activeDot} />
              <R.Line type="monotone" dataKey="offers" name="Offers" stroke={SERIES.offers} strokeWidth={2.5} strokeDasharray="6 4" dot={false} activeDot={activeDot} />
            </R.LineChart>
          </R.ResponsiveContainer>}</Charts></div>
        </Panel>

        <Panel className="xl:col-span-2" title="Wait after each round" note="Median days before hearing back">
          {rounds.length ? <ul className="mt-4 space-y-3.5">{rounds.map((r, i) => <li key={r.round}>
            <div className="flex justify-between text-sm"><span>{r.round}</span><span className="font-bold tabular-nums">{r.days} days</span></div>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted"><motion.div className="h-full rounded-full" style={{ background: r.days === slowest ? "var(--flag-red)" : SERIES.ghosted }} initial={{ width: 0 }} animate={{ width: `${(r.days / slowest) * 100}%` }} transition={{ delay: i * 0.06, type: "spring", stiffness: 120, damping: 20 }} /></div>
          </li>)}</ul> : <p className="mt-4 text-sm text-muted-foreground">No waits reported in this period.</p>}
        </Panel>
      </div>

      <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
        <Panel className="flex flex-col" title="How far people got" note="Stories that reached each round, and where they went silent">
          <Funnel funnel={p.funnel} />
          <FunnelTakeaways funnel={p.funnel} />
        </Panel>
        <div className="grid gap-4 sm:gap-5">
          <Panel title="How long people waited" icon={<Timer className="size-4 text-primary" />} note={cur.medianDays != null ? `Half of all replies took ${cur.medianDays} days or less` : "Days until any reply"}>
            <Columns items={p.waitSpread.map((w) => ({ label: w.label.replace(" days", "d"), value: w.count }))} highlight={p.waitSpread.length - 1} />
          </Panel>
          <Panel title="Silence by weekday" note="Share of stories shared on each day that ended with no reply">
            <Columns items={p.weekdays.map((w) => ({ label: w.day, value: w.total ? Math.round((w.silent / w.total) * 100) : 0 }))} unit="%" highlight={p.weekdays.indexOf(worstWeekday)} />
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
        <Breakdown industry={p.byIndustry} city={p.byCity} />
        <Panel title="Who replies, and who doesn't" note="Median wait per company, with at least 3 stories">
          <div className="mt-3 grid gap-x-6 sm:grid-cols-2 md:grid-cols-1 2xl:grid-cols-2">
            <div><p className="flex items-center gap-1.5 text-xs font-bold text-flag-green"><Zap className="size-3.5" />Fastest</p><ReplierList list={p.repliers.fastest} tone="fast" openCompany={openCompany} /></div>
            {p.repliers.slowest.length > 0 && <div><p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-flag-red sm:mt-0 md:mt-3 2xl:mt-0"><Turtle className="size-3.5" />Slowest</p><ReplierList list={p.repliers.slowest} tone="slow" openCompany={openCompany} /></div>}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
        <Panel title="Most flagged" icon={<Flame className="size-4 text-flag-red" />} note="Red flags raised on their stories in this period">
          {p.topFlagged.length ? <ol className="mt-3 divide-y-2 divide-foreground/10">{p.topFlagged.map((f, i) => {
            const co = index.get(f.slug);
            return <li key={f.slug}>
              <button type="button" disabled={!co || !openCompany} onClick={() => co && openCompany?.(co)} className="flex w-full items-center gap-3 py-2.5 text-left">
                <span className="w-4 text-sm font-bold text-muted-foreground tabular-nums">{i + 1}</span>
                <CompanyMark size="sm" company={{ name: f.name, initial: f.name[0] ?? "?", color: f.color, logoUrl: logoSrc(f.slug, f.logoUrl) }} />
                <span className="min-w-0 flex-1 truncate font-semibold">{f.name}</span>
                <span className="font-bold text-flag-red tabular-nums">{f.flags}</span>
                {co && openCompany && <ChevronRight className="size-4 text-muted-foreground" />}
              </button>
            </li>;
          })}</ol> : <p className="mt-4 text-sm text-muted-foreground">No red flags in this period.</p>}
        </Panel>

        <Panel title="Salary pulse" note="Offered ranges in lakhs per year, median marked">
          {data.salaries.length ? <ul className="mt-4 space-y-4">{data.salaries.map((s) => <li key={s.role}>
            <div className="flex justify-between gap-2 text-sm"><span className="truncate">{s.role} <span className="text-xs text-muted-foreground">· {s.reports}</span></span><span className="shrink-0 font-bold tabular-nums">{s.range[0]}–{s.range[1]} L</span></div>
            <div className="relative mt-1.5 h-2.5 rounded-full bg-muted">
              <div className="absolute inset-y-0 rounded-full" style={{ left: `${(s.range[0] / salaryMax) * 100}%`, right: `${100 - (s.range[1] / salaryMax) * 100}%`, background: SERIES.offers }} />
              <div className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-card shadow-sm" style={{ left: `${(s.median / salaryMax) * 100}%` }} title={`Median ${s.median} L`} />
            </div>
          </li>)}</ul> : <p className="mt-4 text-sm text-muted-foreground">Not enough offers shared yet.</p>}
        </Panel>
      </div>
      </>}
    </div>
  </div>;
}

function EmptyState({ title, copy, action }: { title: string; copy: string; action?: ReactNode }) {
  return <div className="rounded-xl border-2 border-dashed border-foreground/40 p-10 text-center"><p className="font-display text-xl font-bold">{title}</p><p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{copy}</p>{action && <div className="mt-5">{action}</div>}</div>;
}
