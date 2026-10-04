// Founding 50: the first 50 people to publish a story, ranked by when their first published story
// went up. Badges stay for good once earned. Computed from real published stories only (bots are
// excluded) and cached for a minute per server instance.
import { admin } from "./supabase.js";
import { rankFounders, type FounderRow } from "./founding-rank.js";

export const FOUNDING_LIMIT = 50;
let cache: { at: number; ranks: Map<number, number>; contributors: number } | null = null;

export async function loadFounders(fresh = false) {
  if (!fresh && cache && Date.now() - cache.at < 60_000) return cache;
  const { data, error } = await admin().from("stories").select("created_at, author:profiles!stories_author_id_fkey(public_id, kind)").eq("status", "published").order("created_at", { ascending: true }).limit(20000);
  if (error) return cache ?? { at: 0, ranks: new Map<number, number>(), contributors: 0 };
  const { ranks, contributors } = rankFounders((data ?? []) as unknown as FounderRow[], FOUNDING_LIMIT);
  cache = { at: Date.now(), ranks, contributors };
  return cache;
}

// Sync read for DTOs; callers warm the cache with loadFounders() first.
export const foundingRankOf = (publicId: number | string | null | undefined) => (publicId == null ? null : cache?.ranks.get(Number(publicId)) ?? null);
