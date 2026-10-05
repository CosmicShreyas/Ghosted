// Keeping candidates anonymous from the companies they wrote about.
//
// Anyone who is, or ever was, a verified representative of a company (revoked reps included, so a
// revocation is never a way around it) cannot reach any author who has a published story about
// that company, anywhere:
//   - their person page, stories list, follow, mute and report routes answer exactly like a profile
//     that doesn't exist (404 "Profile"), so a rep can't even confirm the author exists
//   - wherever such an author appears (stories, chitchats, search), the rep sees "A candidate"
//     with a neutral avatar and no link, never a handle, public id, level or revealed details
// It works per AUTHOR, not per story: a person page lists every story an author wrote (other
// companies too), which could be pieced together into who they are.
// Enforced here, on the server. Hiding links in the interface is only a convenience on top.
import { admin } from "./supabase.js";

type Shield = { companies: Set<string>; ids: Set<string>; publicIds: Set<string> };
const cache = new Map<string, { at: number; shield: Shield | null }>();
const TTL = 60_000;

// Every company this account has ever represented (verified at some point, revoked or not).
export async function everRepCompanies(userId: string) {
  const { data, error } = await admin().from("company_reps").select("company_id").eq("user_id", userId);
  if (error) return new Set<string>(); // before the Right of Reply section runs
  return new Set(((data ?? []) as { company_id: string }[]).map((r) => r.company_id));
}

// The authors this viewer must not reach, or null when the viewer has never been a rep.
export async function shieldFor(viewerId: string | null | undefined): Promise<Shield | null> {
  if (!viewerId) return null;
  const hit = cache.get(viewerId);
  if (hit && Date.now() - hit.at < TTL) return hit.shield;
  const companies = await everRepCompanies(viewerId);
  let shield: Shield | null = null;
  if (companies.size) {
    const { data } = await admin().from("stories").select("author_id, author:profiles!stories_author_id_fkey(public_id)").in("company_id", [...companies]).eq("status", "published").limit(20000);
    const rows = (data ?? []) as unknown as { author_id: string; author: { public_id: number } | null }[];
    shield = { companies, ids: new Set(rows.map((r) => r.author_id)), publicIds: new Set(rows.map((r) => String(r.author?.public_id ?? ""))) };
    shield.ids.delete(viewerId); shield.publicIds.delete(""); // never hide yourself from yourself
  }
  if (cache.size > 2000) cache.delete(cache.keys().next().value!);
  cache.set(viewerId, { at: Date.now(), shield });
  return shield;
}

// What a shielded author looks like to a rep.
export const HIDDEN_AUTHOR = { publicId: "", handle: "A candidate", name: "A candidate", avatarSeed: "ghosted-candidate", pastel: "bg-avatar-lilac", revealed: null, foundingRank: null, level: null, hidden: true } as const;

// Masks any author DTO (with a publicId) the viewer is shielded from.
export function maskAuthor<T extends { publicId: string }>(author: T | null, shield: Shield | null): T | typeof HIDDEN_AUTHOR | null {
  if (!author || !shield || !shield.publicIds.has(author.publicId)) return author;
  return HIDDEN_AUTHOR;
}

// Can this account post a CANDIDATE story about this company? Not if it has ever represented it
// (a conflict of interest, and a rep posting "candidate" stories about their own employer).
export async function isEverRepOf(userId: string, companyId: string) {
  const { count, error } = await admin().from("company_reps").select("user_id", { count: "exact", head: true }).eq("user_id", userId).eq("company_id", companyId);
  return !error && (count ?? 0) > 0;
}

// Someone just became a rep, or published a story: their shield must be rebuilt.
export const forgetShield = (userId?: string) => { if (userId) cache.delete(userId); else cache.clear(); };
