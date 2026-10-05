// Demand and the HR front door:
//
//   response requests   one tap, "Ask {company} to respond": one per member per company, can be
//                       taken back. Shown as "N candidates asked" only from MIN_ASKS (lib/aggregate.ts)
//   /for-hr themes      public, no login: the request count and stage / outcome counts. Never story
//                       text, never authors
//   Company Pulse       private to the company's verified reps: aggregates only. A metric needs
//                       MIN_STORIES stories; any group under MIN_BUCKET is hidden
import { admin } from "./supabase.js";
import { storyScore } from "./score.js";
import { buckets, floorCount, median, MIN_STORIES, monthlyAverage } from "./lib/aggregate.js";

export async function askCount(companyId: string) {
  const { count, error } = await admin().from("response_requests").select("user_id", { count: "exact", head: true }).eq("company_id", companyId);
  return error ? 0 : count ?? 0;
}

type Row = { outcome: string; stage: string; days_waited: number | null; created_at: string; rating_hiring: number | null; rating_communication: number | null; rating_culture: number | null; rating_pay: number | null; rating_growth: number | null };
async function storiesOf(companyId: string) {
  const { data } = await admin().from("stories").select("outcome, stage, days_waited, created_at, rating_hiring, rating_communication, rating_culture, rating_pay, rating_growth").eq("company_id", companyId).eq("status", "published").limit(5000);
  return (data ?? []) as Row[];
}

// For /for-hr?company=slug: counts only.
export async function hrThemes(companyId: string) {
  const [rows, asks] = await Promise.all([storiesOf(companyId), askCount(companyId)]);
  const enough = rows.length >= MIN_STORIES;
  return {
    stories: rows.length,
    requests: floorCount(asks),
    stages: enough ? buckets(rows.map((r) => r.stage)).shown : [],
    outcomes: enough ? buckets(rows.map((r) => r.outcome)).shown : [],
  };
}

// Company Pulse, for the company's own verified reps.
export async function pulse(companyId: string) {
  const [rows, asks] = await Promise.all([storiesOf(companyId), askCount(companyId)]);
  if (rows.length < MIN_STORIES) return { locked: true as const, stories: rows.length, need: MIN_STORIES };
  // First reply: stories that got any answer and say how long it took.
  const replied = rows.filter((r) => r.outcome !== "ghosted" && r.outcome !== "ghost_job" && r.days_waited != null).map((r) => r.days_waited!);
  const silent = rows.filter((r) => r.outcome === "ghosted");
  const outcomes = buckets(rows.map((r) => r.outcome));
  const quiet = buckets(silent.map((r) => r.stage));
  const trend = monthlyAverage(rows.map((r) => ({ at: r.created_at, value: storyScore({ hiring: r.rating_hiring, communication: r.rating_communication, culture: r.rating_culture, pay: r.rating_pay, growth: r.rating_growth }) })));
  return {
    locked: false as const,
    stories: rows.length,
    requests: floorCount(asks),
    medianDaysToReply: replied.length >= MIN_STORIES ? median(replied) : null,
    repliedSample: replied.length >= MIN_STORIES ? replied.length : null,
    outcomes: outcomes.shown, outcomesHidden: outcomes.hidden,
    quietStages: silent.length >= MIN_STORIES ? quiet.shown : [], quietHidden: silent.length >= MIN_STORIES ? quiet.hidden : silent.length,
    flagTrend: trend.map((t) => ({ month: t.month, value: t.value })),
    flagNow: (() => { const v = rows.map((r) => storyScore({ hiring: r.rating_hiring, communication: r.rating_communication, culture: r.rating_culture, pay: r.rating_pay, growth: r.rating_growth })).filter((x): x is number => x != null); return v.length >= MIN_STORIES ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; })(),
  };
}
