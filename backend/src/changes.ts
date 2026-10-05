// "You said, we did": a verified company rep's public note about what changed, linked to the
// candidate stories behind it.
//
//   at most 4 entries per rep per calendar month (India time), 1 to 5 cited stories each, only
//   stories about that company; the note goes through the same automatic review as everything
//   else (held for a moderator if unsure); no edits or deletes, and only moderators remove entries
//   once published, every cited story's author is told ("{company} made a change after stories
//   like yours"), the story's ladder shows "Changed: cited in a change note", and the author earns
//   the bigger impact XP once per story (never when rep and author share a connection or device)
import { ApiError, dbFail } from "./errors.js";
import { award, IMPACT_CITED_XP } from "./levels.js";
import { bump } from "./live.js";
import { addNotification } from "./notify.js";
import { sharedFootprint } from "./impact.js";
import { admin } from "./supabase.js";
import { hit } from "./funnel.js";

export const CHANGES_PER_MONTH = 4;
export const MAX_CITED = 5;

const monthStartIST = () => {
  const ist = new Date(Date.now() + 5.5 * 3600_000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - 5.5 * 3600_000).toISOString();
};

export async function changesLeft(repId: string) {
  const { count, error } = await admin().from("company_changes").select("id", { count: "exact", head: true }).eq("rep_user_id", repId).neq("status", "removed").gte("created_at", monthStartIST());
  return error ? 0 : Math.max(0, CHANGES_PER_MONTH - (count ?? 0));
}

// The cited stories, checked: published, about this company, and not more than MAX_CITED.
export async function citedStories(companyId: string, publicIds: string[]) {
  const unique = [...new Set(publicIds)];
  if (!unique.length || unique.length > MAX_CITED) throw new ApiError(422, "bad_citations", `Link between 1 and ${MAX_CITED} stories about your company.`);
  const { data } = await admin().from("stories").select("id, public_id, author_id").in("public_id", unique).eq("company_id", companyId).eq("status", "published");
  const rows = (data ?? []) as { id: string; public_id: number; author_id: string }[];
  if (rows.length !== unique.length) throw new ApiError(422, "bad_citations", "Every linked story must be a published story about your company.");
  return rows;
}

// Everything that happens when an entry goes live (straight away, or when a moderator approves it).
export async function publishChangeEffects(changeId: string) {
  try {
    const { data } = await admin().from("company_changes").select("id, public_id, rep_user_id, company:companies(name, slug), cites:company_change_stories(story:stories(id, public_id, author_id))").eq("id", changeId).eq("status", "published").maybeSingle();
    const ch = data as unknown as { id: string; public_id: number; rep_user_id: string; company: { name: string; slug: string } | null; cites: { story: { id: string; public_id: number; author_id: string } | null }[] } | null;
    if (!ch) return;
    const co = ch.company?.name ?? "A company";
    const stories = ch.cites.map((c) => c.story).filter((s): s is NonNullable<typeof s> => !!s);
    for (const s of stories) {
      if (s.author_id === ch.rep_user_id) continue;
      const { data: p } = await admin().from("profiles").select("tone").eq("id", s.author_id).maybeSingle();
      const calm = (p as { tone?: string } | null)?.tone === "calm";
      await addNotification(s.author_id, "rep_update", calm ? `${co} made a change after stories like yours, and cited yours.` : `${co} made a change after stories like yours. Yours was one of the receipts.`, s.public_id);
      if (!(await sharedFootprint(ch.rep_user_id, s.author_id))) award(s.author_id, "impact", `cite:${s.id}`, IMPACT_CITED_XP);
    }
    await bump({ shared: [`company:${ch.company?.slug ?? ""}`, ...stories.map((s) => `story:${s.public_id}`)] });
  } catch (e) { console.error("[changes] publish", (e as Error).message); }
}

export async function createChange(repId: string, company: { id: string }, body_z: string, held: boolean, moderation: unknown, stories: { id: string }[]) {
  const { data, error } = await admin().from("company_changes").insert({ company_id: company.id, rep_user_id: repId, body_z, status: held ? "pending" : "published", moderation }).select("id, public_id").single();
  if (error) dbFail("change note (run the You said, we did section of init_database.sql)", error);
  const ch = data as { id: string; public_id: number };
  const { error: lErr } = await admin().from("company_change_stories").insert(stories.map((s) => ({ change_id: ch.id, story_id: s.id })));
  if (lErr) { await admin().from("company_changes").update({ status: "removed", removed_reason: "citations failed" }).eq("id", ch.id); dbFail("change citations", lErr); }
  await hit("change_posted");
  if (!held) await publishChangeEffects(ch.id);
  return ch;
}

// For story ladders and the "Changed" chip: the live entries citing each story.
export async function citationsFor(storyIds: string[]) {
  const out = new Map<string, { at: string; changePublicId: string }[]>();
  if (!storyIds.length) return out;
  const { data, error } = await admin().from("company_change_stories").select("story_id, change:company_changes!inner(public_id, status, created_at)").in("story_id", storyIds).eq("change.status", "published").limit(5000);
  if (error) return out; // before the SQL runs
  for (const r of (data ?? []) as unknown as { story_id: string; change: { public_id: number; created_at: string } }[]) {
    out.set(r.story_id, [...(out.get(r.story_id) ?? []), { at: r.change.created_at, changePublicId: String(r.change.public_id) }]);
  }
  return out;
}
