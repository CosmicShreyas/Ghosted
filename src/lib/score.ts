// The Flag Score formula, shared by everything on the site that shows one. A story carries only the
// ratings that fit its journey (see JOURNEY below), so missing ratings are skipped, never counted
// as zero. Mirrors backend/src/score.ts and the company_scores view in init_database.sql.
export type Ratings = { hiring?: number | null; communication?: number | null; culture?: number | null; pay?: number | null; growth?: number | null };
export type Dimension = keyof Ratings;
export type Outcome = "ghosted" | "rejected" | "offer" | "offer_revoked" | "ghost_job";

// One rating (1 to 5) as a 0 to 100 score.
export const dimensionScore = (r: number | null | undefined) => (r == null ? null : Math.round((r - 1) * 25));

// A story's Flag Score: the mean of the ratings it has, scaled to 0 to 100. Null with no ratings.
export function storyScore(r: Ratings): number | null {
  const vals = Object.values(r).filter((v): v is number => typeof v === "number");
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length - 1) * 25);
}

// Which ratings (and whether salary) a journey asks for.
export function journey(outcome: Outcome, joined: boolean | null | undefined): { ratings: Dimension[]; salary: boolean } {
  if (outcome === "offer" && joined) return { ratings: ["hiring", "communication", "pay", "culture", "growth"], salary: true };
  if (outcome === "offer" || outcome === "offer_revoked") return { ratings: ["hiring", "communication", "pay"], salary: true };
  return { ratings: ["hiring", "communication"], salary: false };
}
