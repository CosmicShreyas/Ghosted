// Live updates, transport-agnostic. Every change bumps a version number for a topic; open pages ask
// "what are the numbers now?" (GET /v1/live) and refetch only the topics that moved.
//
// Today pages poll. Later a WebSocket push can announce the same bumps from `bump()` below, and the
// page-side hook (src/lib/live.ts) swaps its polling for the socket without any caller changing.
//
// Topics:
//   feed               public: stories published or removed, anywhere
//   story:<publicId>   public: that story's reactions and chitchats
//   me                 yours: profile and settings (tone, notifications, 2FA, go public…)
//   sessions           yours: devices signed in
//   stories            yours: your own stories and what you've saved
//   notifications      yours: new notifications and read state (the bell)
import { waitUntil } from "@vercel/functions";
import { admin } from "./supabase.js";

// Runs work after the response has gone out (emails, bumps, bookkeeping), so the person isn't kept
// waiting. On Vercel the function stays alive until it finishes; locally it simply runs on.
export function later(work: Promise<unknown>) {
  const safe = work.catch((err: unknown) => console.error("[later]", (err as Error).message));
  try { waitUntil(safe); } catch { /* not on Vercel: the promise still runs */ }
}

export type UserTopic = "me" | "sessions" | "stories" | "notifications" | "applications";
export const USER_TOPICS: UserTopic[] = ["me", "sessions", "stories", "notifications", "applications"];

const userKey = (userId: string, topic: UserTopic) => `u:${userId}:${topic}`;

// Best-effort: a missed bump only delays an update until the next change, it never breaks a request.
export async function bump({ user, topics = [], shared = [] }: { user?: string; topics?: UserTopic[]; shared?: string[] }) {
  const keys = [...(user ? topics.map((t) => userKey(user, t)) : []), ...shared];
  if (!keys.length) return;
  const { error } = await admin().rpc("live_bump", { p_keys: keys });
  if (error) console.error("[live] bump (run supabase/init_database.sql on a fresh project)", error.message);
}

// Current numbers for one account's topics plus any public topics the page is watching.
// Unknown topics read as 0, so a page can watch something before it has ever changed.
export async function versions(userId: string | null, shared: string[]) {
  const mine = userId ? USER_TOPICS.map((t) => [t, userKey(userId, t)] as const) : [];
  const keys = [...mine.map(([, k]) => k), ...shared];
  const out: Record<string, number> = Object.fromEntries([...mine.map(([t]) => [t, 0]), ...shared.map((s) => [s, 0])]);
  if (!keys.length) return out;
  const { data, error } = await admin().from("live_versions").select("key, version").in("key", keys);
  if (error) { console.error("[live] read", error.message); return out; }
  const byKey = new Map((data ?? []).map((r) => [r.key as string, Number(r.version)]));
  for (const [t, k] of mine) out[t] = byKey.get(k) ?? 0;
  for (const s of shared) out[s] = byKey.get(s) ?? 0;
  return out;
}
