// The reply pledge badge, worked out from candidate stories only. Pure (no database) and tested.
//
//   A verified rep can pledge that candidates hear back within 7, 14 or 30 days. The badge is then
//   computed from stories posted AFTER the pledge that say how it went:
//     kept      the candidate heard back (any outcome but ghosted / ghost job) within the pledged days
//     broken    ghosted, a ghost job, or a reply that took longer than the pledge
//     (stories without a wait aren't counted, unless they were ghosted: silence is its own answer)
//   made        fewer than 5 counted stories: too early to say
//   holding     5+ stories and at least 70% kept
//   slipping    5+ stories and under 40% kept
//   mixed       5+ stories, between 40% and 70%
//   withdrawn   the company took the pledge back: shown as such, never silently removed
// Always shown as "Based on N candidate stories, not verified by the company".
export const PLEDGE_DAYS = [7, 14, 30] as const;
export type PledgeDays = (typeof PLEDGE_DAYS)[number];
export type PledgeBadge = "made" | "holding" | "mixed" | "slipping" | "withdrawn";
export const PLEDGE_MIN = 5;

export type PledgeStory = { outcome: string; days_waited: number | null; created_at: string };

export function pledgeBadge(stories: PledgeStory[], days: number, madeAt: string, withdrawn = false) {
  const after = stories.filter((s) => s.created_at >= madeAt);
  const silent = (s: PledgeStory) => s.outcome === "ghosted" || s.outcome === "ghost_job";
  const counted = after.filter((s) => silent(s) || s.days_waited != null);
  const kept = counted.filter((s) => !silent(s) && s.days_waited != null && s.days_waited <= days).length;
  const n = counted.length;
  const rate = n ? kept / n : 0;
  const badge: PledgeBadge = withdrawn ? "withdrawn" : n < PLEDGE_MIN ? "made" : rate >= 0.7 ? "holding" : rate < 0.4 ? "slipping" : "mixed";
  return { badge, stories: n, kept, rate: n ? Math.round(rate * 100) : null };
}

export const PLEDGE_LABEL: Record<PledgeBadge, string> = {
  made: "Pledge made", holding: "Pledge holding", mixed: "Pledge mixed", slipping: "Pledge slipping", withdrawn: "Pledge withdrawn",
};
