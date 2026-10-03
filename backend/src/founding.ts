// Founding 50: the first 50 people to publish a story, ranked by when their first published story
// went up. Badges stay for good once earned. Computed from real published stories only (bots are
// excluded) and cached for a minute per server instance.
import { admin } from "./supabase.js";

export const FOUNDING_LIMIT = 50;
let cache: { at: number; ranks: Map<number, number>; contributors: number } | null = null;

export async function loadFounders(fresh = false) {
  if (!fresh && cache && Date.now() - cache.at < 60_000) return cache;
  const { data, error } = await admin().from("stories").select("created_at, author:profiles!stories_author_id_fkey(public_id, kind)").eq("status", "published").order("created_at", { ascending: true }).limit(20000);
  if (error) return cache ?? { at: 0, ranks: new Map<number, number>(), contributors: 0 };
  const ranks = new Map<number, number>();
  const seen = new Set<number>();
  for (const r of (data ?? []) as unknown as { author: { public_id: number; kind?: string } | null }[]) {
    const a = r.author;
    if (!a || a.kind === "bot" || seen.has(Number(a.public_id))) continue;
    seen.add(Number(a.public_id));
    if (ranks.size < FOUNDING_LIMIT) ranks.set(Number(a.public_id), ranks.size + 1);
  }
  cache = { at: Date.now(), ranks, contributors: seen.size };
  return cache;
}

// Sync read for DTOs; callers warm the cache with loadFounders() first.
export const foundingRankOf = (publicId: number | string | null | undefined) => (publicId == null ? null : cache?.ranks.get(Number(publicId)) ?? null);
