// Invites, missions and flair: the loop that brings people in and keeps them active.
//
//   invite code   private per member (8 characters); a link /invite?ref=CODE
//   a "voice"     someone who joined with your code AND has published a story. Only voices count,
//                 so empty sign-ups earn nothing and can't be farmed
//   missions      six things that make Ghosted better (share, react, chitchat, follow, track,
//                 invite); progress is computed live from real activity
//   flair         cosmetics unlocked by voices and missions; the member picks one, and it colours
//                 their avatar ring and page banner everywhere
import { randomInt } from "node:crypto";
import { admin } from "./supabase.js";
import { addNotification } from "./notify.js";

export const FLAIRS = {
  violet: { label: "Violet", how: "Complete 3 missions" },
  sunrise: { label: "Sunrise", how: "Bring your first voice, or join through an invite and share a story" },
  mint: { label: "Mint", how: "Complete all 6 missions" },
  gold: { label: "Gold", how: "Bring 3 voices" },
  cosmic: { label: "Cosmic", how: "Bring 10 voices" },
} as const;
export type Flair = keyof typeof FLAIRS;
export const isFlair = (v: unknown): v is Flair => typeof v === "string" && v in FLAIRS;

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export async function codeFor(profileId: string, existing: string | null | undefined) {
  if (existing) return existing;
  for (let i = 0; i < 5; i++) {
    const code = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
    const { error } = await admin().from("profiles").update({ ref_code: code }).eq("id", profileId).is("ref_code", null);
    if (!error) { const { data } = await admin().from("profiles").select("ref_code").eq("id", profileId).single(); return (data as { ref_code: string }).ref_code; }
  }
  throw new Error("Couldn't create an invite code");
}

export async function inviterByCode(code: string) {
  if (!/^[A-Z2-9]{8}$/.test(code)) return null;
  const { data } = await admin().from("profiles").select("id, public_id, handle, avatar_seed, pastel, kind").eq("ref_code", code).maybeSingle();
  const p = data as { id: string; public_id: number; handle: string; avatar_seed: string; pastel: string; kind?: string } | null;
  return p && p.kind !== "bot" ? p : null;
}

// Who you've brought in, and how many of them have shared a story.
export async function referralStats(profileId: string) {
  const { data: joined } = await admin().from("profiles").select("id").eq("referred_by", profileId).limit(5000);
  const ids = ((joined ?? []) as { id: string }[]).map((r) => r.id);
  let voices = 0, stories = 0, relatable = 0;
  if (ids.length) {
    const { data: rows } = await admin().from("stories").select("id, author_id").in("author_id", ids).eq("status", "published").limit(20000);
    const list = (rows ?? []) as { id: string; author_id: string }[];
    voices = new Set(list.map((r) => r.author_id)).size;
    stories = list.length;
    if (list.length) {
      const { data: counts } = await admin().from("story_counts").select("relatable").in("story_id", list.slice(0, 1000).map((r) => r.id));
      relatable = ((counts ?? []) as { relatable: number }[]).reduce((n, r) => n + Number(r.relatable ?? 0), 0);
    }
  }
  return { joined: ids.length, voices, stories, relatable };
}

export type Mission = { id: string; label: string; hint: string; done: number; goal: number };
export async function missionsFor(profileId: string, voices: number) {
  const n = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0, () => 0);
  const [stories, reactions, chitchats, follows, tracked] = await Promise.all([
    n(admin().from("stories").select("id", { count: "exact", head: true }).eq("author_id", profileId).eq("status", "published")),
    n(admin().from("reactions").select("story_id", { count: "exact", head: true }).eq("user_id", profileId)),
    n(admin().from("comments").select("id", { count: "exact", head: true }).eq("author_id", profileId).eq("status", "published")),
    n(admin().from("company_follows").select("company_id", { count: "exact", head: true }).eq("user_id", profileId)),
    n(admin().from("applications").select("id", { count: "exact", head: true }).eq("user_id", profileId)),
  ]);
  const list: Mission[] = [
    { id: "share", label: "Share your first story", hint: "About 30 seconds with a quick story", done: Math.min(stories, 1), goal: 1 },
    { id: "react", label: "React to 3 stories", hint: "Relatable, eye-opening, with you…", done: Math.min(reactions, 3), goal: 3 },
    { id: "chitchat", label: "Leave a chitchat", hint: "Add what you know under a story", done: Math.min(chitchats, 1), goal: 1 },
    { id: "follow", label: "Follow a company", hint: "Hear when someone shares about it", done: Math.min(follows, 1), goal: 1 },
    { id: "track", label: "Track an application", hint: "The Waiting Room nudges you if they go quiet", done: Math.min(tracked, 1), goal: 1 },
    { id: "invite", label: "Bring a voice", hint: "Invite someone who shares a story", done: Math.min(voices, 1), goal: 1 },
  ];
  return { list, completed: list.filter((m) => m.done >= m.goal).length, hasStory: stories > 0 };
}

// Everything a member has unlocked.
export function unlockedFlairs({ voices, completed, joinedViaInviteWithStory }: { voices: number; completed: number; joinedViaInviteWithStory: boolean }): Flair[] {
  const out: Flair[] = [];
  if (completed >= 3) out.push("violet");
  if (voices >= 1 || joinedViaInviteWithStory) out.push("sunrise");
  if (completed >= 6) out.push("mint");
  if (voices >= 3) out.push("gold");
  if (voices >= 10) out.push("cosmic");
  return out;
}

// Someone you invited just published their first story: that's a voice. Best effort.
export async function notifyInviter(author: { id: string; referred_by?: string | null }) {
  try {
    if (!author.referred_by) return;
    const { count } = await admin().from("stories").select("id", { count: "exact", head: true }).eq("author_id", author.id).eq("status", "published");
    if (count !== 1) return;
    const { voices } = await referralStats(author.referred_by);
    const next = voices < 3 ? 3 : voices < 10 ? 10 : null;
    await addNotification(author.referred_by, "system", `Someone you invited just shared their first story. That's ${voices} ${voices === 1 ? "voice" : "voices"} you've brought to Ghosted${next ? `, ${next - voices} to go for your next flair` : ""}.`);
  } catch (e) { console.error("[invite] notify", (e as Error).message); }
}

// Flair for a batch of authors (by public id). Tolerates the column not existing yet.
export async function flairsFor(publicIds: (number | string)[]) {
  const map = new Map<string, Flair>();
  if (!publicIds.length) return map;
  const { data, error } = await admin().from("profiles").select("public_id, flair").in("public_id", [...new Set(publicIds.map(String))]).not("flair", "is", null);
  if (error) return map;
  for (const r of (data ?? []) as { public_id: number; flair: string | null }[]) if (isFlair(r.flair)) map.set(String(r.public_id), r.flair);
  return map;
}
