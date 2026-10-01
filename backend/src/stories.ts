import { dbFail, notFound } from "./errors.js";
import { STORY_COLUMNS, storyDto, type Counts, type StoryRow } from "./dto.js";
import type { Profile } from "./security.js";
import { admin } from "./supabase.js";

// Adds reaction/comment counts and (if logged in) the viewer's own reactions to a batch of stories.
export async function hydrate(rows: StoryRow[], viewer: Profile | null) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [countsRes, mineRes] = await Promise.all([
    admin().from("story_counts").select("story_id, relatable, flags, comments").in("story_id", ids),
    viewer ? admin().from("reactions").select("story_id, kind").eq("user_id", viewer.id).in("story_id", ids) : Promise.resolve({ data: [], error: null }),
  ]);
  if (countsRes.error) dbFail("story counts", countsRes.error);
  if (mineRes.error) dbFail("my reactions", mineRes.error);
  const counts = new Map((countsRes.data ?? []).map((c) => [c.story_id as string, c as unknown as Counts]));
  const mine = viewer ? new Set((mineRes.data ?? []).map((r) => `${r.story_id}:${r.kind}`)) : undefined;
  return rows.map((r) => storyDto(r, counts.get(r.id), mine));
}

export const publishedStories = () => admin().from("stories").select(STORY_COLUMNS).eq("status", "published");

// Resolves a public story id to its internal row; 404s for missing or unpublished stories.
export async function storyByPublicId(publicId: string) {
  const { data, error } = await publishedStories().eq("public_id", publicId).maybeSingle();
  if (error) dbFail("story by id", error);
  if (!data) throw notFound("Story");
  return data as unknown as StoryRow;
}
