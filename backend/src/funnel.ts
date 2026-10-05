// The growth funnel: anonymous daily counters for visits, free-tool uses, company searches,
// sign-ups and first stories. Only totals per day are stored (funnel_daily); never who.
import { admin } from "./supabase.js";

// The rep_* / change / ask / pledge events count the company side of the loop (anonymous totals too).
export const FUNNEL_EVENTS = ["visit", "ghostometer", "timeline_check", "followup", "company_search", "signup", "first_story", "invite_open",
  "rep_start", "rep_verified", "rep_viewed_story", "rep_status", "change_posted", "ask_response", "pledge_made"] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

// Best effort: a missing table (before the SQL runs) or a hiccup never breaks the request.
export async function hit(event: FunnelEvent) {
  try { await admin().rpc("funnel_hit", { p_event: event }); } catch { /* counters are optional */ }
}

// Totals per event for the last `days` days, plus the same for the period before (for the change).
export async function funnel(days: number) {
  const DAY = 86400_000;
  const from = new Date(Date.now() - (2 * days - 1) * DAY).toISOString().slice(0, 10);
  const cut = new Date(Date.now() - (days - 1) * DAY).toISOString().slice(0, 10);
  const { data, error } = await admin().from("funnel_daily").select("day, event, count").gte("day", from).limit(5000);
  const now: Record<string, number> = {}, before: Record<string, number> = {}, daily: Record<string, Record<string, number>> = {};
  if (!error) for (const r of (data ?? []) as { day: string; event: string; count: number }[]) {
    const bucket = r.day >= cut ? now : before;
    bucket[r.event] = (bucket[r.event] ?? 0) + r.count;
    if (r.day >= cut) (daily[r.day] ??= {})[r.event] = r.count;
  }
  return { installed: !error, days, now, before, daily };
}
