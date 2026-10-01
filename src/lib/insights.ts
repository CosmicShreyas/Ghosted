// Platform-wide numbers for the dashboard's right-hand widgets and the Insights view. With the API
// they're computed from real stories (GET /v1/stats/insights); in mock mode they're
// built from generated sample stories, in the same shape, so every widget has one source.
// The Insights page picks a period and filters; the widgets call it with none (last 90 days).
import { useMemo } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiEnabled } from "@/lib/api";
import { useLive } from "@/lib/live";
import { ghostingThisWeek, insightWeekly, salaryPulse, companies as sampleCompanies } from "@/mock/data";

type CoRef = { slug: string; name: string; color: string; logoUrl: string | null };
export type Summary = { stories: number; ghosted: number; ghostRate: number | null; replyRate: number | null; avgDays: number | null; medianDays: number | null; offers: number; revoked: number; flags: number };
export type Group = { key: string; label: string; stories: number; ghosted: number; ghostRate: number };
export type Option = { value: string; label: string; count: number };
export type Period = {
  from: string; to: string; bucket: "day" | "week" | "month";
  current: Summary; previous: Summary;
  // From the API only: whether a change beats chance (z-test) and which way the trend points (Theil–Sen).
  significance?: { ghostRate: boolean; replyRate: boolean };
  direction?: { ghosted: "rising" | "falling" | "flat"; offers: "rising" | "falling" | "flat" };
  trend: { start: string; ghosted: number; offers: number; total: number }[];
  heat: { date: string; silent: number; total: number }[];
  funnel: { stage: string; reached: number; silentHere: number }[];
  waitSpread: { label: string; count: number }[];
  weekdays: { day: string; silent: number; total: number }[];
  byIndustry: Group[]; byCity: Group[];
  repliers: { fastest: (CoRef & { medianDays: number; stories: number })[]; slowest: (CoRef & { medianDays: number; stories: number })[] };
  topFlagged: (CoRef & { flags: number })[];
  filterOptions: { industry: Option[]; size: Option[]; city: Option[] };
};

export type Insights = {
  storiesThisWeek: number;
  ghostedThisWeek: number;
  flags: { thisWeek: number; lastWeek: number; topCompanies: (CoRef & { flags: number })[] };
  revoked: { thisWeek: number; lastWeek: number };
  daily: { day: string; reports: number }[];
  peakDay: string | null;
  weekly: { week: string; ghosted: number; offers: number }[];
  outcomes: { outcome: string; count: number }[];
  byStage: { stage: string; avgDays: number | null; stories: number }[];
  salaries: { role: string; range: [number, number]; median: number; reports: number }[];
  totals: { stories: number; avgDaysWaited: number | null };
  period: Period;
};

export type RangePreset = "7d" | "30d" | "90d" | "12m";
export type InsightFilters = { range: RangePreset | "custom"; from?: string | undefined; to?: string | undefined; industry?: string | undefined; size?: string | undefined; city?: string | undefined; role?: string | undefined };
export const DEFAULT_FILTERS: InsightFilters = { range: "90d" };
export const PRESET_DAYS: Record<RangePreset, number> = { "7d": 7, "30d": 30, "90d": 90, "12m": 365 };

// The dashboard URL keeps the period and filters (?view=insights&range=30d&industry=fintech).
export type InsightSearch = Partial<Record<"range" | "from" | "to" | "industry" | "size" | "city" | "role", string>>;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export function insightSearch(s: Record<string, unknown>): InsightSearch {
  const out: InsightSearch = {};
  const str = (k: string, re: RegExp) => { const v = s[k]; return typeof v === "string" && re.test(v) ? v : undefined; };
  const range = str("range", /^(7d|30d|90d|12m|custom)$/), from = str("from", DATE), to = str("to", DATE);
  if (range) out.range = range;
  if (from && to) { out.from = from; out.to = to; }
  const industry = str("industry", /^[a-z_]{2,30}$/), size = str("size", /^(1-10|11-50|51-200|201-1000|1001-5000|5000\+)$/);
  const city = str("city", /^.{2,60}$/), role = str("role", /^.{2,60}$/);
  if (industry) out.industry = industry;
  if (size) out.size = size;
  if (city) out.city = city;
  if (role) out.role = role;
  return out;
}
export const filtersFromSearch = (s: InsightSearch): InsightFilters => ({
  range: s.from && s.to ? "custom" : s.range && s.range in PRESET_DAYS ? (s.range as RangePreset) : "90d",
  ...(s.from && s.to && { from: s.from, to: s.to }),
  ...(s.industry && { industry: s.industry }), ...(s.size && { size: s.size }), ...(s.city && { city: s.city }), ...(s.role && { role: s.role }),
});
export const searchFromFilters = (f: InsightFilters): InsightSearch => ({
  ...(f.range === "custom" && f.from && f.to ? { from: f.from, to: f.to } : f.range !== "90d" && f.range !== "custom" ? { range: f.range } : {}),
  ...(f.industry && { industry: f.industry }), ...(f.size && { size: f.size }), ...(f.city && { city: f.city }), ...(f.role && { role: f.role }),
});

const toQuery = (f: InsightFilters) => {
  const p = new URLSearchParams();
  if (f.range === "custom" && f.from && f.to) { p.set("from", f.from); p.set("to", f.to); } else if (f.range !== "custom") p.set("range", f.range);
  for (const k of ["industry", "size", "city", "role"] as const) if (f[k]) p.set(k, f[k]!);
  return p.toString();
};

// ---------- sample data (preview) ----------
// About 2,400 stories spread over two years from a seeded generator, so the numbers are stable
// between reloads and react to the period and filters exactly like the real endpoint.

const DAY = 86400_000;
const OUTCOMES = ["ghosted", "rejected", "offer", "offer_revoked", "ghost_job"] as const;
const STAGES = ["application", "screening", "technical", "final", "offer"];
const INDUSTRIES = ["software", "fintech", "ecommerce", "edtech", "it_services", "healthtech", "consulting", "gaming"];
const CITIES = ["Bengaluru", "Mumbai", "Gurugram", "Hyderabad", "Pune", "Chennai", "Noida"];
const SIZES = ["11-50", "51-200", "201-1000", "1001-5000", "5000+"];
const ROLES = ["Backend Engineer", "Product Designer", "Data Analyst", "Product Manager", "Frontend Engineer", "QA Engineer"];
type SampleStory = { t: number; outcome: string; stage: string; role: string; days: number | null; sal: [number, number] | null; co: number; flags: number };
const COS = sampleCompanies.map((c, i) => ({ ...c, industry: INDUSTRIES[i % INDUSTRIES.length]!, city: CITIES[(i * 3) % CITIES.length]!, size: SIZES[(i * 2) % SIZES.length]! }));

let cache: { day: number; list: SampleStory[] } | null = null;
function sampleStories(): SampleStory[] {
  const today = Math.floor(Date.now() / DAY);
  if (cache?.day === today) return cache.list;
  let s = 20240917;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const list: SampleStory[] = [];
  const end = (today + 1) * DAY;
  for (let i = 0; i < 2400; i++) {
    // More recent stories than old ones (the platform is growing), weekday-heavy.
    const t = end - Math.floor(rnd() ** 1.6 * 730 * DAY);
    const co = Math.floor(rnd() * COS.length);
    const bad = 1 - (COS[co]!.score / 100); // low Flag Score, more ghosting
    const r = rnd();
    const outcome = r < 0.18 + bad * 0.45 ? "ghosted" : r < 0.3 + bad * 0.5 ? "ghost_job" : r < 0.62 ? "rejected" : r < 0.7 ? "offer_revoked" : "offer";
    const stage = outcome === "offer" ? "offer" : STAGES[Math.min(3, Math.floor(rnd() * 4.3))]!;
    const role = ROLES[Math.floor(rnd() * ROLES.length)]!;
    const days = rnd() < 0.85 ? Math.max(0, Math.round(2 + rnd() * 10 + bad * 30 * rnd() + (stage === "final" ? 8 : 0))) : null;
    const base = 8 + ROLES.indexOf(role) * 3;
    const sal: [number, number] | null = rnd() < 0.55 ? [base + Math.round(rnd() * 6), base + 10 + Math.round(rnd() * 16)] : null;
    list.push({ t, outcome, stage, role, days, sal, co, flags: Math.floor(rnd() * (outcome === "offer" ? 1 : 4 + bad * 10)) });
  }
  cache = { day: today, list };
  return list;
}

function sample(f: InsightFilters): Insights {
  const now = Date.now();
  const endOfToday = (Math.floor(now / DAY) + 1) * DAY;
  let from: number, to: number;
  if (f.range === "custom" && f.from && f.to) { from = Date.parse(f.from); to = Math.min(endOfToday, Date.parse(f.to) + DAY); }
  else { to = endOfToday; from = to - PRESET_DAYS[f.range === "custom" ? "90d" : f.range] * DAY; }
  const len = to - from, prevFrom = from - len;
  const all = sampleStories();
  const coOf = (x: SampleStory) => COS[x.co]!;
  const matches = (x: SampleStory, skip?: string) => {
    const c = coOf(x);
    return (skip === "industry" || !f.industry || c.industry === f.industry) && (skip === "size" || !f.size || c.size === f.size)
      && (skip === "city" || !f.city || c.city.toLowerCase() === f.city.toLowerCase()) && (!f.role || x.role.toLowerCase().includes(f.role.toLowerCase()));
  };
  const inPeriod = all.filter((x) => x.t >= from && x.t < to);
  const stories = inPeriod.filter((x) => matches(x));
  const previous = all.filter((x) => x.t >= prevFrom && x.t < from && matches(x));
  const silent = (x: SampleStory) => x.outcome === "ghosted" || x.outcome === "ghost_job";
  const median = (a: number[]) => { const s = [...a].sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)]! : null; };
  const summary = (l: SampleStory[]): Summary => {
    const w = l.map((x) => x.days).filter((d): d is number => d != null);
    const g = l.filter((x) => x.outcome === "ghosted").length;
    return { stories: l.length, ghosted: g, ghostRate: l.length ? Math.round((g / l.length) * 100) : null, replyRate: l.length ? Math.round(((l.length - l.filter(silent).length) / l.length) * 100) : null,
      avgDays: w.length ? Math.round(w.reduce((a, b) => a + b, 0) / w.length) : null, medianDays: median(w), offers: l.filter((x) => x.outcome === "offer").length, revoked: l.filter((x) => x.outcome === "offer_revoked").length, flags: l.reduce((n, x) => n + x.flags, 0) };
  };
  const ref = (i: number): CoRef => ({ slug: COS[i]!.id, name: COS[i]!.name, color: COS[i]!.color, logoUrl: null });

  const bucket: Period["bucket"] = len <= 31 * DAY ? "day" : len <= 183 * DAY ? "week" : "month";
  const starts: number[] = [];
  if (bucket === "month") { const d = new Date(from); d.setUTCDate(1); for (; d.getTime() < to; d.setUTCMonth(d.getUTCMonth() + 1)) starts.push(d.getTime()); }
  else for (let s = from; s < to; s += (bucket === "day" ? 1 : 7) * DAY) starts.push(s);
  const trend = starts.map((s, i) => { const e = starts[i + 1] ?? to; const b = stories.filter((x) => x.t >= s && x.t < e); return { start: new Date(Math.max(s, from)).toISOString().slice(0, 10), ghosted: b.filter((x) => x.outcome === "ghosted").length, offers: b.filter((x) => x.outcome === "offer").length, total: b.length }; });
  const perDay = new Map<string, { silent: number; total: number }>();
  for (const x of stories) { const k = new Date(x.t).toISOString().slice(0, 10); const e = perDay.get(k) ?? { silent: 0, total: 0 }; e.total++; if (silent(x)) e.silent++; perDay.set(k, e); }
  const heat: Period["heat"] = [];
  for (let d = from; d < to; d += DAY) { const k = new Date(d).toISOString().slice(0, 10); heat.push({ date: k, ...(perDay.get(k) ?? { silent: 0, total: 0 }) }); }
  const funnel = STAGES.map((s, i) => ({ stage: s, reached: stories.filter((x) => STAGES.indexOf(x.stage) >= i).length, silentHere: stories.filter((x) => x.stage === s && silent(x)).length }));
  const waited = stories.map((x) => x.days).filter((d): d is number => d != null);
  const waitSpread = ([["0–3 days", 0, 3], ["4–7 days", 4, 7], ["8–14 days", 8, 14], ["15–30 days", 15, 30], ["30+ days", 31, Infinity]] as const).map(([label, lo, hi]) => ({ label, count: waited.filter((d) => d >= lo && d <= hi).length }));
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekdays = DAYS.map((day) => ({ day, silent: 0, total: 0 }));
  for (const x of stories) { const w = weekdays[(new Date(x.t).getDay() + 6) % 7]!; w.total++; if (silent(x)) w.silent++; }
  const groupBy = (key: (x: SampleStory) => string) => {
    const m = new Map<string, Group>();
    for (const x of stories) { const k = key(x); const e = m.get(k) ?? { key: k, label: k, stories: 0, ghosted: 0, ghostRate: 0 }; e.stories++; if (x.outcome === "ghosted") e.ghosted++; m.set(k, e); }
    return [...m.values()].filter((g) => g.stories >= 5).map((g) => ({ ...g, ghostRate: Math.round((g.ghosted / g.stories) * 100) })).sort((a, b) => b.ghostRate - a.ghostRate).slice(0, 8);
  };
  const waits = new Map<number, number[]>();
  for (const x of stories) if (x.days != null) waits.set(x.co, [...(waits.get(x.co) ?? []), x.days]);
  const ranked = [...waits.entries()].filter(([, w]) => w.length >= 3).map(([i, w]) => ({ ...ref(i), medianDays: median(w)!, stories: w.length })).sort((a, b) => a.medianDays - b.medianDays);
  const flagged = (l: SampleStory[]) => { const m = new Map<number, number>(); for (const x of l) m.set(x.co, (m.get(x.co) ?? 0) + x.flags); return [...m.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([i, n]) => ({ ...ref(i), flags: n })); };
  const options = (skip: string, key: (x: SampleStory) => string) => { const m = new Map<string, Option>(); for (const x of inPeriod) { if (!matches(x, skip)) continue; const k = key(x); const e = m.get(k) ?? { value: skip === "city" ? k.toLowerCase() : k, label: k, count: 0 }; e.count++; m.set(k, e); } return [...m.values()].sort((a, b) => b.count - a.count); };

  // The widgets' "this week" numbers keep their fixed sample values.
  const week = all.filter((x) => x.t >= now - 7 * DAY), lastWeek = all.filter((x) => x.t >= now - 14 * DAY && x.t < now - 7 * DAY);
  const peak = ghostingThisWeek.reduce((a, b) => (b.reports > a.reports ? b : a));
  const roles = new Map<string, { mins: number[]; maxs: number[] }>();
  for (const x of stories) if (x.sal) { const e = roles.get(x.role) ?? { mins: [], maxs: [] }; e.mins.push(x.sal[0]); e.maxs.push(x.sal[1]); roles.set(x.role, e); }
  const salaries = roles.size ? [...roles.entries()].sort((a, b) => b[1].mins.length - a[1].mins.length).slice(0, 6).map(([role, e]) => ({ role, range: [Math.min(...e.mins), Math.max(...e.maxs)] as [number, number], median: Math.round(((median(e.mins) ?? 0) + (median(e.maxs) ?? 0)) / 2), reports: e.mins.length }))
    : salaryPulse.map((s) => ({ role: s.role, range: [s.range[0], s.range[1]] as [number, number], median: s.median, reports: 10 }));
  const cur = summary(stories);
  return {
    storiesThisWeek: week.length, ghostedThisWeek: ghostingThisWeek.reduce((n, d) => n + d.reports, 0),
    flags: { thisWeek: summary(week).flags, lastWeek: summary(lastWeek).flags, topCompanies: flagged(week) },
    revoked: { thisWeek: summary(week).revoked, lastWeek: summary(lastWeek).revoked },
    daily: ghostingThisWeek.map((d) => ({ ...d })), peakDay: peak.day,
    weekly: insightWeekly.map((w) => ({ week: w.week, ghosted: w.ghosted, offers: w.offers })),
    outcomes: OUTCOMES.map((o) => ({ outcome: o, count: stories.filter((x) => x.outcome === o).length })),
    byStage: STAGES.map((s) => { const w = stories.filter((x) => x.stage === s && x.days != null).map((x) => x.days!); return { stage: s, avgDays: w.length ? Math.round(w.reduce((a, b) => a + b, 0) / w.length) : null, stories: w.length }; }),
    salaries,
    totals: { stories: cur.stories, avgDaysWaited: cur.avgDays },
    period: {
      from: new Date(from).toISOString().slice(0, 10), to: new Date(to - DAY).toISOString().slice(0, 10), bucket,
      current: cur, previous: summary(previous), trend, heat, funnel, waitSpread, weekdays,
      byIndustry: groupBy((x) => coOf(x).industry), byCity: groupBy((x) => coOf(x).city),
      repliers: { fastest: ranked.slice(0, 5), slowest: ranked.length >= 6 ? ranked.slice(-5).reverse() : [] },
      topFlagged: flagged(stories),
      filterOptions: { industry: options("industry", (x) => coOf(x).industry), size: options("size", (x) => coOf(x).size), city: options("city", (x) => coOf(x).city) },
    },
  };
}

export function useInsights(filters: InsightFilters = DEFAULT_FILTERS) {
  const qc = useQueryClient();
  const qs = toQuery(filters);
  const q = useQuery({
    queryKey: ["insights", qs], queryFn: () => api<Insights>(`/v1/stats/insights${qs && qs !== "range=90d" ? `?${qs}` : ""}`),
    enabled: apiEnabled, staleTime: 60_000, placeholderData: keepPreviousData, // no blank page while a new period loads
  });
  // New stories anywhere move these numbers.
  useLive(apiEnabled ? "feed" : null, () => void qc.invalidateQueries({ queryKey: ["insights"] }));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- qs is the filters, serialised
  const demo = useMemo(() => (apiEnabled ? null : sample(filters)), [qs]);
  return {
    data: apiEnabled ? q.data ?? null : demo,
    loading: apiEnabled && q.isPending,
    refreshing: apiEnabled && q.isFetching && q.isPlaceholderData,
    error: apiEnabled && q.isError ? (q.error as Error).message : null,
  };
}

// "+12%" style change; null when there's nothing to compare against.
export const change = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);
