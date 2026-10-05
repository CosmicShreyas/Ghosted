import { dbFail, notFound } from "./errors.js";
import { STORY_COLUMNS, STORY_REACTIONS, storyDto, type Counts, type StoryRow } from "./dto.js";
import type { Profile } from "./security.js";
import { admin } from "./supabase.js";
import { loadFounders } from "./founding.js";
import { levelsFor } from "./levels.js";
import { maskAuthor, shieldFor } from "./rep-guard.js";
import { citationsFor } from "./changes.js";

// Adds reaction/comment counts and (if logged in) the viewer's own reactions to a batch of stories.
export async function hydrate(rows: StoryRow[], viewer: Profile | null) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  // The founders list is warmed alongside, so author lines can show "Founding contributor #N".
  // Everything in one parallel round: counts, your reactions, founders and authors' levels (the
  // badge, looked up separately so a missing column never breaks stories).
  const [countsRes, mineRes, , levels, greenRes, shield, cited] = await Promise.all([
    admin().from("story_counts").select("story_id, relatable, insightful, creative, support, love, flags, comments").in("story_id", ids),
    viewer ? admin().from("reactions").select("story_id, kind").eq("user_id", viewer.id).in("story_id", ids) : Promise.resolve({ data: [], error: null }),
    loadFounders(),
    levelsFor(rows.map((r) => r.author?.public_id).filter((x): x is number => x != null)),
    // Green flag shout-outs (an error, e.g. the table not created yet, just means none).
    admin().from("story_green_flags").select("story_id, flags").in("story_id", ids).then((r) => r, () => ({ data: null, error: null })),
    // A company rep (current or past) never sees who wrote about that company (rep-guard.ts).
    shieldFor(viewer?.id),
    // Cited in a "You said, we did" note: the small "Changed" chip (changes.ts).
    citationsFor(ids),
  ]);
  const green = new Map(((greenRes.data ?? []) as { story_id: string; flags: string[] }[]).map((g) => [g.story_id, g.flags]));
  if (countsRes.error) dbFail("story counts", countsRes.error);
  if (mineRes.error) dbFail("my reactions", mineRes.error);
  const counts = new Map((countsRes.data ?? []).map((c) => [c.story_id as string, c as unknown as Counts]));
  const mine = viewer ? new Set((mineRes.data ?? []).map((r) => `${r.story_id}:${r.kind}`)) : undefined;
  return rows.map((r) => {
    const dto = { ...storyDto(r, counts.get(r.id), mine), greenFlags: green.get(r.id) ?? null, changed: cited.has(r.id) };
    return dto.author ? { ...dto, author: maskAuthor({ ...dto.author, level: levels.get(dto.author.publicId) ?? null }, shield) } : dto;
  });
}

export const publishedStories = () => admin().from("stories").select(STORY_COLUMNS).eq("status", "published");

// Public id → internal id for a published story, without loading its text and joins. Remembered for
// a short while (the mapping never changes; a story taken down stops resolving within ID_TTL).
const ID_TTL = 60_000;
const storyIds = new Map<string, { id: string; at: number }>();
export async function publishedStoryId(publicId: string) {
  const hit = storyIds.get(publicId);
  if (hit && Date.now() - hit.at < ID_TTL) return hit.id;
  const { data, error } = await admin().from("stories").select("id").eq("public_id", publicId).eq("status", "published").maybeSingle();
  if (error) dbFail("story by id", error);
  if (!data) { storyIds.delete(publicId); throw notFound("Story"); }
  if (storyIds.size > 20_000) storyIds.clear();
  storyIds.set(publicId, { id: (data as { id: string }).id, at: Date.now() });
  return (data as { id: string }).id;
}

// A story's current counts and the viewer's reaction, in one parallel round.
export async function countsFor(storyId: string, viewerId: string) {
  const [counts, mine] = await Promise.all([
    admin().from("story_counts").select("relatable, insightful, creative, support, love, flags, comments").eq("story_id", storyId).maybeSingle(),
    admin().from("reactions").select("kind").eq("story_id", storyId).eq("user_id", viewerId).in("kind", [...STORY_REACTIONS]).limit(1),
  ]);
  if (counts.error) dbFail("story counts", counts.error);
  if (mine.error) dbFail("my reactions", mine.error);
  const z: Counts = { relatable: 0, insightful: 0, creative: 0, support: 0, love: 0, flags: 0, comments: 0 };
  return { counts: { ...z, ...((counts.data as Partial<Counts> | null) ?? {}) }, myReaction: ((mine.data ?? [])[0] as { kind: string } | undefined)?.kind ?? null };
}

// Resolves a public story id to its internal row; 404s for missing or unpublished stories.
export async function storyByPublicId(publicId: string) {
  const { data, error } = await publishedStories().eq("public_id", publicId).maybeSingle();
  if (error) dbFail("story by id", error);
  if (!data) throw notFound("Story");
  return data as unknown as StoryRow;
}
