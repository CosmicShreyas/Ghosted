// The Flag Score formula and the ratings each journey allows. Mirrors src/lib/score.ts and the
// company_scores view (init_database.sql): missing ratings are skipped, never counted as zero.
import { z } from "zod";

export type Ratings = { hiring?: number | null; communication?: number | null; culture?: number | null; pay?: number | null; growth?: number | null };
type Outcome = "ghosted" | "rejected" | "offer" | "offer_revoked" | "ghost_job";

export const dimensionScore = (r: number | null | undefined) => (r == null ? null : Math.round((r - 1) * 25));

export function storyScore(r: Ratings): number | null {
  const vals = Object.values(r).filter((v): v is number => typeof v === "number");
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length - 1) * 25);
}

// The consistency matrix, used by both new stories and edits (superRefine on the strict schema):
//   hiring and communication  every story
//   pay rating and salary     only when the outcome is offer or offer_revoked
//   culture and growth        only when the outcome is offer and joined is true
//   joined                    only when the outcome is offer
type Shape = { outcome: Outcome; joined?: boolean | null | undefined; ratings: Ratings; salary?: unknown };
export function checkJourney(s: Shape, ctx: z.RefinementCtx) {
  const offerish = s.outcome === "offer" || s.outcome === "offer_revoked";
  const joined = s.outcome === "offer" && s.joined === true;
  const bad = (path: (string | number)[], message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
  if (s.ratings.hiring == null) bad(["ratings", "hiring"], "Rate the hiring process");
  if (s.ratings.communication == null) bad(["ratings", "communication"], "Rate their communication");
  if (s.joined != null && s.outcome !== "offer") bad(["joined"], "Only an offer can be joined");
  if (offerish && s.ratings.pay == null) bad(["ratings", "pay"], "Rate their pay transparency");
  if (!offerish && s.ratings.pay != null) bad(["ratings", "pay"], "Pay is only rated when there was an offer");
  if (!offerish && s.salary != null) bad(["salary"], "Salary is only shared when there was an offer");
  for (const k of ["culture", "growth"] as const) {
    if (joined && s.ratings[k] == null) bad(["ratings", k], `Rate the ${k}`);
    if (!joined && s.ratings[k] != null) bad(["ratings", k], `${k[0]!.toUpperCase()}${k.slice(1)} is only rated by people who joined`);
  }
}
