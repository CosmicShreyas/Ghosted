// Invites: the link that brings people in. Rewards are XP (levels.ts), not rings or missions.
//
//   invite code   private per member (8 characters); a link /invite?ref=CODE
//   joining       someone signs up with your code: a small XP thank-you (security.ts linkInviter)
//   a "voice"     someone who joined with your code AND has published a story: the biggest XP
//                 payout on Ghosted, once per person. Only voices pay big, so empty sign-ups can't
//                 be farmed
import { randomInt } from "node:crypto";
import { admin } from "./supabase.js";
import { addNotification } from "./notify.js";
import { hit } from "./funnel.js";
import { GOOFY_PUBLIC_ID } from "./goofy/index.js";
import { award, XP_RULES } from "./levels.js";

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
  const { data } = await admin().from("profiles").select("id, public_id, handle, avatar_seed, pastel, kind, level").eq("ref_code", code).maybeSingle();
  const p = data as { id: string; public_id: number; handle: string; avatar_seed: string; pastel: string; kind?: string; level?: number } | null;
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

// Someone you invited just published their first story: that's a voice. Best effort.
export async function notifyInviter(author: { id: string; referred_by?: string | null }) {
  try {
    const { count } = await admin().from("stories").select("id", { count: "exact", head: true }).eq("author_id", author.id).eq("status", "published");
    if (count !== 1) return;
    await hit("first_story"); // the funnel's last step, for everyone (invited or not)
    if (!author.referred_by) return;
    award(author.referred_by, "invite", author.id);
    const { voices } = await referralStats(author.referred_by);
    await addNotification(author.referred_by, "system", `Someone you invited just shared their first story. That's the biggest XP drop on Ghosted (${XP_RULES.invite.xp} XP before level scaling), and ${voices} ${voices === 1 ? "voice" : "voices"} brought in so far.`);
    if (voices === 10) await addNotification(author.referred_by, "goofy", "Ten voices. TEN. You've done more for the next candidate than most HR teams do in a year. My eternal, slightly ghostly gratitude.", undefined, GOOFY_PUBLIC_ID);
  } catch (e) { console.error("[invite] notify", (e as Error).message); }
}
