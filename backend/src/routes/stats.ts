import { Hono } from "hono";
import { z } from "zod";
import { ApiError, dbFail } from "../errors.js";
import { stats } from "../algorithms/index.js";
import { optionalAuth, rateLimit, type AppEnv } from "../security.js";
import { FOUNDING_LIMIT, foundingRankOf, loadFounders } from "../founding.js";
import { admin } from "../supabase.js";

// Landing-page numbers. The frontend shows pre-launch copy until `stories` is above zero.
export const statsRoutes = new Hono<AppEnv>().get("/", rateLimit({ name: "stats", max: 90, windowSeconds: 60 }), async (c) => {
  const [{ data, error }, listed, rows] = await Promise.all([
    admin().from("platform_stats").select("*").single(),
    admin().from("companies").select("id", { count: "exact", head: true }).eq("status", "listed"),
    admin().from("stories").select("outcome, days_waited").eq("status", "published").limit(20000),
  ]);
  if (error) dbFail("stats", error);
  const all = (rows.data ?? []) as { outcome: string; days_waited: number | null }[];
  const waits = all.map((r) => r.days_waited).filter((d): d is number => d != null);
  const replied = all.filter((r) => r.outcome !== "ghosted" && r.outcome !== "ghost_job").length;
  c.header("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
  return c.json({
    stories: data.stories, companies: data.companies, ghosted: data.ghosted, silenceDays: data.silence_days,
    // The landing strip: each number with its sample size, so the page only shows it once it means something.
    companiesListed: listed.count ?? 0,
    replyRate: all.length ? Math.round((replied / all.length) * 100) : null, replyRateN: all.length,
    medianWait: stats.median(waits), medianWaitN: waits.length,
  });
})

// Founding 50: how many people have published a story, and (signed in) your founding rank, if any.
.get("/founding", optionalAuth, rateLimit({ name: "founding", max: 90, windowSeconds: 60 }), async (c) => {
  const f = await loadFounders();
  const me = c.get("profile");
  c.header("Cache-Control", "private, no-store");
  return c.json({ contributors: f.contributors, limit: FOUNDING_LIMIT, complete: f.ranks.size >= FOUNDING_LIMIT, foundingRank: me ? foundingRankOf(me.public_id) : null });
})

// Everything the dashboard's right-hand widgets and Insights charts show, from real stories only.
// The Insights page picks a period (preset or custom dates) and optional filters; every number also
// comes for the previous period of the same length, so the page can show the change. Without any
// parameters it's the last 90 days, unfiltered (what the widgets use). Cached briefly at the edge.
.get("/insights", rateLimit({ name: "insights", max: 90, windowSeconds: 60 }), async (c) => {
  const DAY = 86400_000;
  const now = Date.now();
  const q = insightsQuery.safeParse(c.req.query());
  if (!q.success) throw new ApiError(400, "bad_request", q.error.issues[0]?.message ?? "Check the filters.");
  const f = q.data;
  // The period: a preset counts back from today; custom dates are whole days (end inclusive).
  const endOfToday = new Date(new Date(now).toISOString().slice(0, 10)).getTime() + DAY;
  let from: number, to: number;
  if (f.from && f.to) { from = Date.parse(f.from); to = Date.parse(f.to) + DAY; }
  else { to = endOfToday; from = to - PRESET_DAYS[f.range ?? "90d"] * DAY; }
  if (!(to > from)) throw new ApiError(400, "bad_request", "The start date must be before the end date.");
  if (to - from > 731 * DAY) throw new ApiError(400, "bad_request", "Pick a period of two years or less.");
  if (to > endOfToday) to = endOfToday;
  const len = to - from, prevFrom = from - len;

  const { data: rows, error } = await admin().from("stories")
    .select("id, outcome, stage, job_role, created_at, days_waited, salary_min_lpa, salary_max_lpa, company:companies(slug, name, color, logo_url, industry, size, hq_city)")
    .eq("status", "published").gte("created_at", new Date(prevFrom).toISOString()).lt("created_at", new Date(to).toISOString())
    .order("created_at", { ascending: false }).limit(20000);
  if (error) dbFail("insights", error);
  type Co = { slug: string; name: string; color: string; logo_url: string | null; industry: string | null; size: string | null; hq_city: string | null };
  type Row = { id: string; outcome: string; stage: string; job_role: string | null; created_at: string; days_waited: number | null; salary_min_lpa: number | null; salary_max_lpa: number | null; company: Co | null };
  const t = (r: Row) => new Date(r.created_at).getTime();
  const all = (rows ?? []) as unknown as Row[];
  const cityKey = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  const matches = (r: Row, skip?: keyof typeof f) =>
    (skip === "industry" || !f.industry || r.company?.industry === f.industry)
    && (skip === "size" || !f.size || r.company?.size === f.size)
    && (skip === "city" || !f.city || cityKey(r.company?.hq_city) === cityKey(f.city))
    && (skip === "role" || !f.role || (r.job_role ?? "").toLowerCase().includes(f.role.toLowerCase()));
  const inPeriod = all.filter((r) => t(r) >= from);
  const stories = inPeriod.filter((r) => matches(r));
  const previous = all.filter((r) => t(r) < from && matches(r));

  // ---- summary numbers, for this period and the one before ----
  // Robust statistics (algorithms/stats.ts): medians interpolate, averages are winsorized so one
  // "waited 700 days" typo can't drag the number.
  const median = stats.median;
  const summary = (list: Row[]) => {
    const waits = list.map((r) => r.days_waited).filter((d): d is number => d != null);
    const silent = list.filter((r) => r.outcome === "ghosted" || r.outcome === "ghost_job").length;
    return {
      stories: list.length,
      ghosted: list.filter((r) => r.outcome === "ghosted").length,
      ghostRate: list.length ? Math.round((list.filter((r) => r.outcome === "ghosted").length / list.length) * 100) : null,
      replyRate: list.length ? Math.round(((list.length - silent) / list.length) * 100) : null,
      avgDays: stats.robustMean(waits),
      medianDays: median(waits),
      offers: list.filter((r) => r.outcome === "offer").length,
      revoked: list.filter((r) => r.outcome === "offer_revoked").length,
    };
  };

  // ---- trend: by day up to a month, by week up to six months, then by month ----
  const bucket = stats.bucketFor(len / DAY);
  const starts: number[] = [];
  if (bucket === "month") { const d = new Date(from); d.setUTCDate(1); for (; d.getTime() < to; d.setUTCMonth(d.getUTCMonth() + 1)) starts.push(d.getTime()); }
  else for (let s = from; s < to; s += (bucket === "day" ? 1 : 7) * DAY) starts.push(s);
  const trend = starts.map((s, i) => {
    const e = starts[i + 1] ?? to;
    const b = stories.filter((r) => t(r) >= s && t(r) < e);
    return { start: new Date(Math.max(s, from)).toISOString().slice(0, 10), ghosted: b.filter((r) => r.outcome === "ghosted").length, offers: b.filter((r) => r.outcome === "offer").length, total: b.length };
  });

  // ---- calendar heatmap: every day of the period ----
  const perDay = new Map<string, { silent: number; total: number }>();
  for (const r of stories) { const k = r.created_at.slice(0, 10); const e = perDay.get(k) ?? { silent: 0, total: 0 }; e.total++; if (r.outcome === "ghosted" || r.outcome === "ghost_job") e.silent++; perDay.set(k, e); }
  const heat: { date: string; silent: number; total: number }[] = [];
  for (let d = from; d < to; d += DAY) { const k = new Date(d).toISOString().slice(0, 10); heat.push({ date: k, ...(perDay.get(k) ?? { silent: 0, total: 0 }) }); }

  // ---- funnel: how far stories got, and where they went silent ----
  const STAGES = ["application", "screening", "technical", "final", "offer"];
  const funnel = STAGES.map((s, i) => ({
    stage: s,
    reached: stories.filter((r) => STAGES.indexOf(r.stage) >= i).length,
    silentHere: stories.filter((r) => r.stage === s && (r.outcome === "ghosted" || r.outcome === "ghost_job")).length,
  }));

  // ---- how long people waited ----
  const BUCKETS: [string, number, number][] = [["0–3 days", 0, 3], ["4–7 days", 4, 7], ["8–14 days", 8, 14], ["15–30 days", 15, 30], ["30+ days", 31, Infinity]];
  const waited = stories.map((r) => r.days_waited).filter((d): d is number => d != null);
  const waitSpread = BUCKETS.map(([label, lo, hi]) => ({ label, count: waited.filter((d) => d >= lo && d <= hi).length }));

  // ---- where it's worst: groups under MIN_GROUP stories are left out so nobody is singled out ----
  const groupBy = (key: (r: Row) => string | null | undefined, label: (k: string, r: Row) => string) => {
    const m = new Map<string, { key: string; label: string; stories: number; ghosted: number }>();
    for (const r of stories) { const k = key(r); if (!k) continue; const e = m.get(k) ?? { key: k, label: label(k, r), stories: 0, ghosted: 0 }; e.stories++; if (r.outcome === "ghosted") e.ghosted++; m.set(k, e); }
    return stats.minGroup([...m.values()], MIN_GROUP).map((g) => ({ ...g, ghostRate: Math.round((g.ghosted / g.stories) * 100) })).sort((a, b) => b.ghostRate - a.ghostRate).slice(0, 8);
  };
  const byIndustry = groupBy((r) => r.company?.industry, (k) => k);
  const byCity = groupBy((r) => cityKey(r.company?.hq_city) || null, (_, r) => r.company!.hq_city!.trim());

  // ---- fastest and slowest to reply (median wait, companies with enough stories) ----
  const waitsByCo = new Map<string, { co: Co; waits: number[] }>();
  for (const r of stories) if (r.company && r.days_waited != null) { const e = waitsByCo.get(r.company.slug) ?? { co: r.company, waits: [] }; e.waits.push(r.days_waited); waitsByCo.set(r.company.slug, e); }
  const ranked = [...waitsByCo.values()].filter((e) => e.waits.length >= MIN_COMPANY)
    .map((e) => ({ slug: e.co.slug, name: e.co.name, color: e.co.color, logoUrl: e.co.logo_url, medianDays: median(e.waits)!, stories: e.waits.length }))
    .sort((a, b) => a.medianDays - b.medianDays);
  // Slowest only once there are enough companies that the two lists don't just mirror each other.
  const repliers = { fastest: ranked.slice(0, 5), slowest: ranked.length >= 6 ? ranked.slice(-5).reverse() : [] };

  // ---- filter choices, each with how many stories it would leave (ignoring its own filter) ----
  const options = (skip: "industry" | "size" | "city", key: (r: Row) => string | null | undefined, label: (r: Row) => string) => {
    const m = new Map<string, { value: string; label: string; count: number }>();
    for (const r of inPeriod) { if (!matches(r, skip)) continue; const k = key(r); if (!k) continue; const e = m.get(k) ?? { value: k, label: label(r), count: 0 }; e.count++; m.set(k, e); }
    return [...m.values()].sort((a, b) => b.count - a.count).slice(0, 30);
  };
  const filterOptions = {
    industry: options("industry", (r) => r.company?.industry, (r) => r.company!.industry!),
    size: options("size", (r) => r.company?.size, (r) => r.company!.size!),
    city: options("city", (r) => cityKey(r.company?.hq_city) || null, (r) => r.company!.hq_city!.trim()),
  };

  // The right-hand widgets always describe this week, whatever period the page picked. When that
  // period doesn't cover the last two weeks, read them separately (unfiltered, like the widgets).
  const covers = to >= endOfToday && prevFrom <= now - 14 * DAY;
  const recent: Row[] = covers ? all : (((await admin().from("stories")
    .select("id, outcome, stage, job_role, created_at, days_waited, salary_min_lpa, salary_max_lpa, company:companies(slug, name, color, logo_url, industry, size, hq_city)")
    .eq("status", "published").gte("created_at", new Date(now - 14 * DAY).toISOString()).limit(5000)).data ?? []) as unknown as Row[]);

  // Reports per weekday over the last 7 days (the "Ghosting this week" chart).
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const lastWeek = recent.filter((r) => t(r) >= now - 7 * DAY);
  // Which weekday gets the most silence over the whole period (for the Insights page).
  const weekdays = DAYS.map((day) => ({ day, silent: 0, total: 0 }));
  for (const r of stories) { const w = weekdays[(new Date(r.created_at).getDay() + 6) % 7]!; w.total++; if (r.outcome === "ghosted" || r.outcome === "ghost_job") w.silent++; }
  const daily = DAYS.map((day) => ({ day, reports: 0 }));
  for (const r of lastWeek) if (r.outcome === "ghosted" || r.outcome === "ghost_job") daily[(new Date(r.created_at).getDay() + 6) % 7]!.reports++;
  const peak = daily.reduce((a, b) => (b.reports > a.reports ? b : a), daily[0]!);

  // Ghosted vs offers per week, 8 weeks (Insights trend).
  const weekly = Array.from({ length: 8 }, (_, i) => {
    const start = now - (8 - i) * 7 * DAY, end = start + 7 * DAY;
    const inWeek = all.filter((r) => t(r) >= start && t(r) < end);
    return { week: new Date(start).toISOString().slice(0, 10), ghosted: inWeek.filter((r) => r.outcome === "ghosted").length, offers: inWeek.filter((r) => r.outcome === "offer").length };
  });

  const outcomes = ["ghosted", "rejected", "offer", "offer_revoked", "ghost_job"].map((o) => ({ outcome: o, count: stories.filter((r) => r.outcome === o).length }));
  const byStage = ["application", "screening", "technical", "final", "offer"].map((s) => {
    const w = stories.filter((r) => r.stage === s && r.days_waited != null).map((r) => r.days_waited!);
    return { stage: s, avgDays: w.length ? Math.round(w.reduce((a, b) => a + b, 0) / w.length) : null, stories: w.length };
  });

  // Salary ranges for the most-reported roles.
  const roles = new Map<string, { role: string; mins: number[]; maxs: number[] }>();
  for (const r of stories) if (r.job_role && r.salary_min_lpa != null && r.salary_max_lpa != null) {
    const key = r.job_role.trim().toLowerCase();
    const e = roles.get(key) ?? { role: r.job_role.trim(), mins: [], maxs: [] };
    e.mins.push(Number(r.salary_min_lpa)); e.maxs.push(Number(r.salary_max_lpa)); roles.set(key, e);
  }
  // 10th–90th percentile bands, so one mistyped "900 LPA" can't stretch a role's range.
  const salaries = [...roles.values()].sort((a, b) => b.mins.length - a.mins.length).slice(0, 6)
    .map((e) => ({ role: e.role, ...stats.salaryBand(e.mins, e.maxs), reports: e.mins.length }));

  // Red flags: this week vs last week (widgets), and in the chosen period vs the one before, with
  // the most-flagged companies of the period (filters apply through the story's company).
  const flagSince = Math.min(prevFrom, now - 14 * DAY);
  const { data: flags } = await admin().from("reactions").select("created_at, story:stories(job_role, company:companies(slug, name, color, logo_url, industry, size, hq_city))").eq("kind", "flag").gte("created_at", new Date(flagSince).toISOString()).lt("created_at", new Date(Math.max(to, now)).toISOString()).limit(20000);
  type Flag = { created_at: string; story: { job_role: string | null; company: Co | null } | null };
  const flagRows = (flags ?? []) as unknown as Flag[];
  const ft = (x: Flag) => new Date(x.created_at).getTime();
  const flagsThisWeek = flagRows.filter((x) => ft(x) >= now - 7 * DAY);
  const flagsLastWeek = flagRows.filter((x) => ft(x) >= now - 14 * DAY && ft(x) < now - 7 * DAY).length;
  const flagMatches = (x: Flag) => matches({ job_role: x.story?.job_role ?? null, company: x.story?.company ?? null } as Row);
  const periodFlags = flagRows.filter((x) => ft(x) >= from && ft(x) < to && flagMatches(x));
  const prevFlags = flagRows.filter((x) => ft(x) >= prevFrom && ft(x) < from && flagMatches(x)).length;
  const topFlagged = (list: Flag[]) => {
    const m = new Map<string, { slug: string; name: string; color: string; logoUrl: string | null; flags: number }>();
    for (const x of list) { const co = x.story?.company; if (!co) continue; const e = m.get(co.slug) ?? { slug: co.slug, name: co.name, color: co.color, logoUrl: co.logo_url, flags: 0 }; e.flags++; m.set(co.slug, e); }
    return [...m.values()].sort((a, b) => b.flags - a.flags).slice(0, 5);
  };
  const revokedNow = lastWeek.filter((r) => r.outcome === "offer_revoked").length;
  const revokedBefore = recent.filter((r) => t(r) >= now - 14 * DAY && t(r) < now - 7 * DAY && r.outcome === "offer_revoked").length;

  c.header("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=600");
  return c.json({
    storiesThisWeek: lastWeek.length,
    ghostedThisWeek: lastWeek.filter((r) => r.outcome === "ghosted").length,
    flags: { thisWeek: flagsThisWeek.length, lastWeek: flagsLastWeek, topCompanies: topFlagged(flagsThisWeek) },
    revoked: { thisWeek: revokedNow, lastWeek: revokedBefore },
    daily, peakDay: peak.reports ? peak.day : null,
    weekly, outcomes, byStage, salaries,
    totals: { stories: stories.length, avgDaysWaited: summary(stories).avgDays },
    // The Insights page: the chosen period, filtered, against the period before it.
    period: {
      from: new Date(from).toISOString().slice(0, 10), to: new Date(to - DAY).toISOString().slice(0, 10), bucket,
      current: { ...summary(stories), flags: periodFlags.length }, previous: { ...summary(previous), flags: prevFlags },
      trend, heat, funnel, waitSpread, weekdays, byIndustry, byCity, repliers,
      // Is the change against the previous period bigger than chance? (two-proportion z-test)
      // And which way is the trend heading? (Theil–Sen slope over the trend buckets)
      significance: {
        ghostRate: stats.changeIsReal(summary(stories).ghosted, stories.length, summary(previous).ghosted, previous.length),
        replyRate: stats.changeIsReal(stories.length - stories.filter((r) => r.outcome === "ghosted" || r.outcome === "ghost_job").length, stories.length, previous.length - previous.filter((r) => r.outcome === "ghosted" || r.outcome === "ghost_job").length, previous.length),
      },
      direction: { ghosted: stats.trendDirection(trend.map((t) => t.ghosted)), offers: stats.trendDirection(trend.map((t) => t.offers)) },
      topFlagged: topFlagged(periodFlags), filterOptions,
    },
  });
});

const PRESET_DAYS = { "7d": 7, "30d": 30, "90d": 90, "12m": 365 } as const;
const MIN_GROUP = 5, MIN_COMPANY = 3;
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dates look like 2026-01-31.").refine((s) => !Number.isNaN(Date.parse(s)), "That date doesn't exist.");
const insightsQuery = z.object({
  range: z.enum(["7d", "30d", "90d", "12m"]).optional(),
  from: day.optional(), to: day.optional(),
  industry: z.string().regex(/^[a-z_]{2,30}$/).optional(),
  size: z.enum(["1-10", "11-50", "51-200", "201-1000", "1001-5000", "5000+"]).optional(),
  city: z.string().trim().min(2).max(60).optional(),
  role: z.string().trim().min(2).max(60).optional(),
}).refine((q) => !q.from === !q.to, "Pick both a start and an end date.");
