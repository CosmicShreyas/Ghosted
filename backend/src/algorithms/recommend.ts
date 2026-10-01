// The "For you" feed. Candidates come from four pools, then one scorer ranks them all:
//
//   following      people whose bell you rang / follow
//   companies      companies you follow
//   new voices     first stories from new people (cold start: nobody follows them yet)
//   everyone       the rest of the recent feed
//
// score = affinity         who it's from, relative to you (follow > company > new voice > everyone)
//       × freshness        exponential decay with a 36-hour half-life (old stories fade, never vanish)
//       × quality          engagement per hour of exposure, Wilson-bounded so 3/3 doesn't beat 80/100,
//                          plus how useful the story is (detail, ratings, salary, wait)
//       × trust            flagged-heavy or low-trust authors sink a little, never to zero
//
// Then a diversity pass (greedy MMR): no two stories from the same company or author back to back,
// and at most 2 per company in any 10. Finally, about 1 in 8 slots goes to exploration: a fresh
// story with little engagement yet, picked with a per-viewer daily seed so the feed is stable
// between reloads but different tomorrow.
import { wilson } from "./stats.js";

export type Candidate = {
  id: string; authorId: string; companyId: string; createdAt: number;
  relatable: number; flags: number; comments: number;
  bodyLength: number; hasSalary: boolean; hasWait: boolean; hasRole: boolean;
  authorStories: number;       // how many stories the author has published in total
  authorTrust?: number;        // trust.ts, default 0.6
};
export type Viewer = { id: string | null; followsAuthors: Set<string>; followsCompanies: Set<string>; seen?: Set<string> };
export type Ranked = { id: string; score: number; why: "following" | "company" | "new_voice" | "popular" | "fresh" | "explore" };

const HOUR = 3600_000;
const HALF_LIFE_H = 36;

function affinity(c: Candidate, v: Viewer): { a: number; why: Ranked["why"] } {
  if (v.followsAuthors.has(c.authorId)) return { a: 3, why: "following" };
  if (v.followsCompanies.has(c.companyId)) return { a: 2.2, why: "company" };
  if (c.authorStories <= 2) return { a: 1.4, why: "new_voice" };
  return { a: 1, why: "popular" };
}

function quality(c: Candidate, now: number): number {
  const hours = Math.max(1, (now - c.createdAt) / HOUR);
  // Positive signals vs "exposure" (an estimate of how many people saw it, grows with time).
  const positive = c.relatable + c.comments * 2;
  const exposure = Math.max(positive + c.flags, Math.sqrt(hours) * 6);
  const lb = wilson(positive, exposure).low;
  const detail = (c.bodyLength > 600 ? 0.12 : c.bodyLength > 250 ? 0.06 : 0) + (c.hasSalary ? 0.06 : 0) + (c.hasWait ? 0.05 : 0) + (c.hasRole ? 0.03 : 0);
  return 0.5 + lb * 2 + detail;
}

function trustFactor(c: Candidate): number {
  const t = c.authorTrust ?? 0.6;
  // Red flags are about the company, not the story; only a flag-heavy story with little else sinks.
  const contested = c.flags > 6 && c.flags > (c.relatable + c.comments) * 3 ? 0.85 : 1;
  return (0.7 + t * 0.5) * contested;
}

// Deterministic 0..1 from a string (FNV-1a), for stable per-viewer exploration.
function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0) / 2 ** 32;
}

export function rankFeed(cands: Candidate[], viewer: Viewer, now = Date.now()): Ranked[] {
  const own = viewer.id;
  const scored = cands.filter((c) => c.authorId !== own).map((c) => {
    const { a, why } = affinity(c, viewer);
    const ageH = Math.max(0, (now - c.createdAt) / HOUR);
    const fresh = Math.pow(0.5, ageH / HALF_LIFE_H);
    const seenPenalty = viewer.seen?.has(c.id) ? 0.35 : 1;
    const score = a * (0.25 + fresh) * quality(c, now) * trustFactor(c) * seenPenalty;
    return { c, score, why: ageH < 6 && why === "popular" ? "fresh" as const : why };
  }).sort((x, y) => y.score - x.score);

  // Exploration pool: fresh (< 48 h) stories with little engagement, ordered by a daily seed.
  const day = Math.floor(now / (24 * HOUR));
  const explore = scored.filter((s) => now - s.c.createdAt < 48 * HOUR && s.c.relatable + s.c.comments < 3)
    .sort((a, b) => hash01(`${viewer.id ?? "anon"}:${day}:${a.c.id}`) - hash01(`${viewer.id ?? "anon"}:${day}:${b.c.id}`));

  // Greedy diversity re-rank.
  const out: Ranked[] = [];
  const used = new Set<string>();
  const pool = [...scored];
  while (pool.length && out.length < cands.length) {
    const slot = out.length;
    if (slot > 0 && slot % 8 === 5) {
      const e = explore.find((x) => !used.has(x.c.id));
      const at = e ? pool.indexOf(e) : -1;
      if (e && at >= 0) { out.push({ id: e.c.id, score: e.score, why: "explore" }); used.add(e.c.id); pool.splice(at, 1); continue; }
    }
    const recent = out.slice(-10).map((r) => cands.find((c) => c.id === r.id)!);
    const last = recent.at(-1);
    let best = -1, bestScore = -Infinity;
    for (let i = 0; i < Math.min(pool.length, 40); i++) {
      const p = pool[i]!;
      if (used.has(p.c.id)) continue;
      let s = p.score;
      if (last && (last.companyId === p.c.companyId || last.authorId === p.c.authorId)) s *= 0.3;
      const sameCo = recent.filter((r) => r.companyId === p.c.companyId).length;
      if (sameCo >= 2) s *= 0.4;
      if (recent.filter((r) => r.authorId === p.c.authorId).length >= 2) s *= 0.4;
      if (s > bestScore) { bestScore = s; best = i; }
    }
    if (best < 0) break;
    const [pick] = pool.splice(best, 1);
    out.push({ id: pick!.c.id, score: pick!.score, why: pick!.why });
    used.add(pick!.c.id);
  }
  return out;
}
