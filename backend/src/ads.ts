// Ad results: daily visit and sign-up counts per ad (ad_daily in init_database.sql). The site sends
// the ad's utm_campaign and utm_content, which it keeps for that browser tab only. Counts only:
// nothing about the visitor is stored.
import { z } from "zod";
import { admin } from "./supabase.js";

const label = z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{1,40}$/);
export const adAttribution = z.object({ campaign: label, content: label }).strict();
export type AdAttribution = z.infer<typeof adAttribution>;

// Visits and sign-ups per ad over the last `days` days, busiest first (admin Growth page).
export async function adResults(days: number) {
  const from = new Date(Date.now() - (days - 1) * 86400_000).toISOString().slice(0, 10);
  const { data, error } = await admin().from("ad_daily").select("campaign, content, event, count").gte("day", from).limit(10000);
  if (error) return { installed: false, rows: [] };
  const by = new Map<string, { campaign: string; content: string; visits: number; signups: number }>();
  for (const r of (data ?? []) as { campaign: string; content: string; event: string; count: number }[]) {
    const k = `${r.campaign}/${r.content}`;
    const row = by.get(k) ?? { campaign: r.campaign, content: r.content, visits: 0, signups: 0 };
    if (r.event === "visit") row.visits += r.count; else row.signups += r.count;
    by.set(k, row);
  }
  return { installed: true, rows: [...by.values()].sort((a, b) => b.visits - a.visits || b.signups - a.signups) };
}

// Best effort: a missing table (SQL section not run yet) or a bad label never breaks a request.
export async function adHit(ad: AdAttribution, event: "visit" | "signup") {
  const ok = adAttribution.safeParse(ad);
  if (!ok.success) return;
  const { error } = await admin().rpc("ad_hit", { p_campaign: ok.data.campaign, p_content: ok.data.content, p_event: event });
  if (error) console.warn("[ads] ad_hit failed (run the 'Ad results' section of init_database.sql):", error.message);
}
