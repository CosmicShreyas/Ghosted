// The impact ladder: a candidate's story visibly leading somewhere.
//
//   Posted → Seen by the team → Heard → Being looked into → Changed
//
//   seen      a verified rep of the story's company opened it (rep_story_views, once per rep). The
//             author learns how many people at the company saw it, never which ones.
//   statuses  a rep taps heard, looking_into_it or fixed (story_responses). Forward only: each is
//             set once per story, never edited or deleted, and never set after a later one. "fixed"
//             is the company's own claim and is shown that way ("The company says this is fixed").
//             A citation in a "You said, we did" entry (phase 2) also lights up "Changed".
//   notes     optional and short, through the same automatic review as chitchats
//
// The author hears about each step once (notification + push, in their tone), and earns "impact"
// XP once per story when a rep first responds. No XP when the rep and the author have ever shared
// an internet connection or a device (the invite anti-cheat, applied to both accounts' sign-ins).
import { ApiError, dbFail, notFound } from "./errors.js";
import { bump } from "./live.js";
import { award } from "./levels.js";
import { addNotification } from "./notify.js";
import { admin } from "./supabase.js";
import { hit } from "./funnel.js";

export const STATUSES = ["heard", "looking_into_it", "fixed"] as const;
export type ImpactStatus = (typeof STATUSES)[number];
const RANK: Record<ImpactStatus, number> = { heard: 1, looking_into_it: 2, fixed: 3 };

type StoryRef = { id: string; public_id: number; author_id: string; company_id: string; company: { name: string; slug: string } | null };
async function storyRef(storyId: string): Promise<StoryRef | null> {
  const { data } = await admin().from("stories").select("id, public_id, author_id, company_id, company:companies(name, slug)").eq("id", storyId).eq("status", "published").maybeSingle();
  return data as unknown as StoryRef | null;
}
export async function storyRefByPublicId(publicId: string): Promise<StoryRef> {
  const { data } = await admin().from("stories").select("id, public_id, author_id, company_id, company:companies(name, slug)").eq("public_id", publicId).eq("status", "published").maybeSingle();
  if (!data) throw notFound("Story");
  return data as unknown as StoryRef;
}

export async function isActiveRep(userId: string, companyId: string) {
  const { count, error } = await admin().from("company_reps").select("user_id", { count: "exact", head: true }).eq("user_id", userId).eq("company_id", companyId).is("revoked_at", null);
  return !error && (count ?? 0) > 0;
}

// Have these two accounts ever signed in from the same connection or the same device?
export async function sharedFootprint(a: string, b: string) {
  const { data } = await admin().from("session_devices").select("user_id, ip_hash, device_hash").in("user_id", [a, b]).limit(400);
  const rows = (data ?? []) as { user_id: string; ip_hash: string | null; device_hash: string | null }[];
  const of = (u: string, k: "ip_hash" | "device_hash") => new Set(rows.filter((r) => r.user_id === u && r[k]).map((r) => r[k]!));
  const overlap = (x: Set<string>, y: Set<string>) => [...x].some((v) => y.has(v));
  return overlap(of(a, "ip_hash"), of(b, "ip_hash")) || overlap(of(a, "device_hash"), of(b, "device_hash"));
}

async function tell(authorId: string, storyPublicId: number, sassy: string, calm: string) {
  const { data } = await admin().from("profiles").select("tone").eq("id", authorId).maybeSingle();
  const tone = (data as { tone?: string } | null)?.tone ?? "sassy";
  await addNotification(authorId, "rep_update", tone === "calm" ? calm : sassy, storyPublicId);
}

// ---------- seen by the team ----------

// Called whenever a signed-in member opens a story. Records a view only for a current rep of the
// story's company, once per rep; the author is told on the story's very first rep view.
export async function recordRepView(viewerId: string, storyId: string) {
  try {
    const s = await storyRef(storyId);
    if (!s || s.author_id === viewerId || !(await isActiveRep(viewerId, s.company_id))) return;
    const { data, error } = await admin().from("rep_story_views").upsert({ story_id: s.id, rep_user_id: viewerId, company_id: s.company_id }, { onConflict: "story_id,rep_user_id", ignoreDuplicates: true }).select("story_id");
    if (error || !data?.length) return; // seen by this rep before (or the table isn't created yet)
    await hit("rep_viewed_story");
    const { count } = await admin().from("rep_story_views").select("story_id", { count: "exact", head: true }).eq("story_id", s.id);
    if (count === 1) {
      const co = s.company?.name ?? "the company";
      await tell(s.author_id, s.public_id,
        `Someone at ${co} just read your story. Receipts: delivered.`,
        `A verified team member at ${co} has seen your story.`);
    }
    await bump({ shared: [`story:${s.public_id}`] });
  } catch (e) { console.error("[impact] view", (e as Error).message); }
}

// ---------- statuses ----------

const STEP_COPY: Record<ImpactStatus, (co: string) => [string, string]> = {
  heard: (co) => [`${co} says they've heard you. Look at that, a reply that isn't silence.`, `${co} has acknowledged your story.`],
  looking_into_it: (co) => [`${co} says they're looking into what you shared. Your receipts are doing work.`, `${co} says it is looking into what you shared.`],
  fixed: (co) => [`${co} says this is fixed. Their word, for now: your story keeps them honest.`, `${co} says the issue in your story is now fixed.`],
};

export async function setStatus(repId: string, s: StoryRef, status: ImpactStatus, note: { body_z: string; held: boolean; moderation: unknown } | null) {
  if (!(await isActiveRep(repId, s.company_id))) throw new ApiError(403, "not_rep", "Only verified representatives of this company can respond.");
  if (s.author_id === repId) throw new ApiError(403, "own_story", "You can't respond to your own story.");
  const { data: existing } = await admin().from("story_responses").select("status").eq("story_id", s.id);
  const top = Math.max(0, ...((existing ?? []) as { status: ImpactStatus }[]).map((r) => RANK[r.status] ?? 0));
  if (RANK[status] <= top) throw new ApiError(409, "status_set", "This story has already moved past that step. Steps only go forward and can't be changed.");
  const { error } = await admin().from("story_responses").insert({
    story_id: s.id, company_id: s.company_id, rep_user_id: repId, status,
    note_z: note?.body_z ?? null, note_status: note ? (note.held ? "pending" : "published") : null, moderation: note?.moderation ?? null,
  });
  if (error) { if (error.code === "23505") throw new ApiError(409, "status_set", "That step is already set."); dbFail("story status (run the Impact ladder section of init_database.sql)", error); }
  await hit("rep_status");
  const [sassy, calm] = STEP_COPY[status](s.company?.name ?? "The company");
  await tell(s.author_id, s.public_id, sassy, calm);
  // The first response of any kind: impact XP for the author, unless rep and author share a footprint.
  if (top === 0 && !(await sharedFootprint(repId, s.author_id))) award(s.author_id, "impact", `resp:${s.id}`);
  await bump({ shared: [`story:${s.public_id}`] });
}

// ---------- what the ladder shows ----------

export type Impact = {
  repViews: number; firstSeenAt: string | null;
  steps: { status: ImpactStatus; at: string; note: string | null }[];
  replied: boolean;
  cited: { at: string; changePublicId: string }[]; // phase 2: "You said, we did" entries citing it
};

export async function impactFor(storyIds: string[], fromBytea: (z: string) => string) {
  const out = new Map<string, Impact>();
  if (!storyIds.length) return out;
  for (const id of storyIds) out.set(id, { repViews: 0, firstSeenAt: null, steps: [], replied: false, cited: [] });
  const [views, steps, replies] = await Promise.all([
    admin().from("rep_story_views").select("story_id, first_seen_at").in("story_id", storyIds).limit(5000),
    admin().from("story_responses").select("story_id, status, note_z, note_status, created_at").in("story_id", storyIds).order("created_at").limit(5000),
    admin().from("rep_replies").select("story_id").in("story_id", storyIds).eq("status", "published").limit(5000),
  ]);
  for (const v of (views.data ?? []) as { story_id: string; first_seen_at: string }[]) {
    const m = out.get(v.story_id)!; m.repViews++; if (!m.firstSeenAt || v.first_seen_at < m.firstSeenAt) m.firstSeenAt = v.first_seen_at;
  }
  for (const r of (steps.data ?? []) as { story_id: string; status: ImpactStatus; note_z: string | null; note_status: string | null; created_at: string }[]) {
    out.get(r.story_id)?.steps.push({ status: r.status, at: r.created_at, note: r.note_z && r.note_status === "published" ? fromBytea(r.note_z) : null });
  }
  for (const r of (replies.data ?? []) as { story_id: string }[]) { const m = out.get(r.story_id); if (m) m.replied = true; }
  // "You said, we did" entries citing the story light up "Changed" (changes.ts).
  const { citationsFor } = await import("./changes.js");
  for (const [id, list] of await citationsFor(storyIds)) { const m = out.get(id); if (m) m.cited = list; }
  return out;
}
