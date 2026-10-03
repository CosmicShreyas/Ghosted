// Shapes that leave the API. Internal UUIDs (user, story, company) are never included.
import { fromBytea } from "./lib/compression.js";
import { dimensionScore, storyScore } from "./score.js";
import { unsealBytea } from "./lib/sealed.js";
import type { Profile } from "./security.js";

export type AuthorRow = Pick<Profile, "public_id" | "handle" | "avatar_seed" | "pastel" | "show_real" | "details_z" | "shared_fields">;

export const AUTHOR_COLUMNS = "public_id, handle, avatar_seed, pastel, show_real, details_z, shared_fields";

// Decrypts only when the user has opted in, and returns only the fields they chose to share.
function revealedDetails(p: AuthorRow) {
  if (!p.show_real || !p.shared_fields.length) return null;
  const d = unsealBytea(p.details_z);
  const has = (f: string) => p.shared_fields.includes(f);
  return {
    name: has("name") ? d.name ?? null : null,
    role: has("role") ? d.role ?? null : null,
    experience: has("experience") ? d.experience ?? null : null,
    city: has("city") ? d.city ?? null : null,
    linkedin: has("linkedin") ? d.linkedin ?? null : null,
  };
}

export const publicAuthor = (p: AuthorRow) => ({
  publicId: String(p.public_id),
  handle: p.handle,
  avatarSeed: p.avatar_seed,
  pastel: p.pastel,
  revealed: revealedDetails(p),
});

// What OTHER people see as the author of anything (stories, chitchats, their page). Identity belongs
// to the account, not the post: one person, one page, one public id.
//
// - Anonymous account: handle + avatar everywhere, past and future.
// - Public account: the details they chose to show (real name in place of the handle, if shown),
//   again everywhere, including everything posted while anonymous. Going back to anonymous hides
//   them everywhere again.
// Either way the public id is included, so a name or avatar always opens that person's page.

export const nameIsPublic = (p: AuthorRow) => p.show_real && p.shared_fields.includes("name") && !!unsealBytea(p.details_z).name;

export function storyAuthor(p: AuthorRow) {
  const author = publicAuthor(p);
  return { ...author, name: author.revealed?.name ?? p.handle };
}

// Missing ratings (not every journey has all five) stay null, never a fake score.
const score = dimensionScore;

export type StoryRow = {
  id: string;
  public_id: number;
  outcome: string;
  stage: string;
  job_role: string | null;
  title: string;
  body_z: string; // bytea as "\x<hex>", Brotli-compressed
  rating_hiring: number | null;
  rating_communication: number | null;
  rating_culture: number | null;
  rating_pay: number | null;
  rating_growth: number | null;
  salary_min_lpa: number | null;
  salary_max_lpa: number | null;
  days_waited: number | null;
  joined?: boolean | null;
  quick?: boolean;
  anonymous: boolean;
  edited_at: string | null;
  created_at: string;
  company: { slug: string; name: string; color: string; logo_url?: string | null } | null;
  author: AuthorRow | null;
  moderation?: { redactedBy?: string } | null;
};

export const STORY_COLUMNS = `id, public_id, outcome, stage, job_role, title, body_z, rating_hiring, rating_communication, rating_culture, rating_pay, rating_growth, salary_min_lpa, salary_max_lpa, days_waited, joined, quick, anonymous, created_at, edited_at, moderation, company:companies(slug, name, color, logo_url), author:profiles!stories_author_id_fkey(${AUTHOR_COLUMNS})`;
// "!stories_author_id_fkey" names the link explicitly: stories also reach profiles through reactions,
// and without the hint the database refuses to guess (PGRST201).

export const STORY_REACTIONS = ["relatable", "insightful", "creative", "support", "love"] as const;
export type StoryReaction = (typeof STORY_REACTIONS)[number];
export type Counts = { relatable: number; insightful: number; creative: number; support: number; love: number; flags: number; comments: number };

export function storyDto(s: StoryRow, counts: Counts | undefined, mine: Set<string> | undefined) {
  return {
    publicId: String(s.public_id),
    outcome: s.outcome,
    stage: s.stage,
    role: s.job_role,
    title: s.title,
    body: fromBytea(s.body_z),
    scores: { hiring: score(s.rating_hiring), communication: score(s.rating_communication), culture: score(s.rating_culture), pay: score(s.rating_pay), growth: score(s.rating_growth) },
    flagScore: storyScore({ hiring: s.rating_hiring, communication: s.rating_communication, culture: s.rating_culture, pay: s.rating_pay, growth: s.rating_growth }),
    joined: s.joined ?? null,
    quick: s.quick ?? false,
    salary: s.salary_min_lpa != null && s.salary_max_lpa != null ? [Number(s.salary_min_lpa), Number(s.salary_max_lpa)] : null,
    daysWaited: s.days_waited,
    company: s.company,
    author: s.author ? storyAuthor(s.author) : null,
    counts: counts ?? { relatable: 0, insightful: 0, creative: 0, support: 0, love: 0, flags: 0, comments: 0 },
    myReaction: mine ? STORY_REACTIONS.find((kind) => mine.has(`${s.id}:${kind}`)) ?? null : null,
    myReactions: mine ? { relatable: mine.has(`${s.id}:relatable`), flag: mine.has(`${s.id}:flag`) } : null,
    createdAt: s.created_at,
    editedAt: s.edited_at ?? null,
    // Goofy published it with a person's name hidden as [name] (only that fact, never the review).
    goofy: s.moderation?.redactedBy === "goofy" ? "redacted" : null,
    // The 1–5 stars behind the scores, so the author can edit their story with them pre-filled.
    ratings: { hiring: s.rating_hiring, communication: s.rating_communication, culture: s.rating_culture, pay: s.rating_pay, growth: s.rating_growth },
  };
}

export type CompanyScoreRow = {
  slug: string; name: string; color: string; summary: string | null; story_count: number;
  score_hiring: number | null; score_communication: number | null; score_culture: number | null; score_pay: number | null; score_growth: number | null;
  count_hiring?: number; count_communication?: number; count_culture?: number; count_pay?: number; count_growth?: number;
  flag_score: number | null; salary_min_lpa: number | null; salary_max_lpa: number | null;
  ghosted_count: number; revoked_count: number; avg_days_waited: number | null; last_story_at: string | null;
  domain?: string | null; website?: string | null; logo_url?: string | null; about?: string | null; industry?: string | null;
  size?: string | null; hq_city?: string | null; founded?: number | null; careers_url?: string | null; created_at?: string;
};

const flagLabel = (s: number | null) => (s == null ? null : s >= 70 ? "green" : s >= 40 ? "mixed" : "red");

export const companyDto = (c: CompanyScoreRow) => ({
  slug: c.slug,
  name: c.name,
  initial: c.name.charAt(0).toUpperCase(),
  color: c.color,
  summary: c.summary,
  storyCount: c.story_count,
  flagScore: c.flag_score,
  flag: flagLabel(c.flag_score),
  scores: c.story_count ? { hiring: c.score_hiring, communication: c.score_communication, culture: c.score_culture, pay: c.score_pay, growth: c.score_growth } : null,
  // How many stories rated each dimension ("based on N stories"); 0 means no data yet.
  scoreCounts: { hiring: c.count_hiring ?? c.story_count, communication: c.count_communication ?? c.story_count, culture: c.count_culture ?? c.story_count, pay: c.count_pay ?? c.story_count, growth: c.count_growth ?? c.story_count },
  salary: c.salary_min_lpa != null && c.salary_max_lpa != null ? [Number(c.salary_min_lpa), Number(c.salary_max_lpa)] : null,
  badges: [
    ...(c.ghosted_count >= 3 ? ["Ghosts Candidates"] : []),
    ...(c.revoked_count >= 2 ? ["Offer Revoked Reports"] : []),
    ...((c.score_communication ?? 0) >= 75 && c.story_count >= 3 ? ["Fast Replies"] : []),
    ...((c.score_pay ?? 0) >= 75 && c.story_count >= 3 ? ["Fair Pay"] : []),
  ],
  avgDaysWaited: c.avg_days_waited,
  lastStoryAt: c.last_story_at,
  // Listing details (from "List a company"). Older listings may not have them.
  domain: c.domain ?? null,
  website: c.website ?? null,
  logoUrl: c.logo_url ?? null,
  about: c.about ?? null,
  industry: c.industry ?? null,
  size: c.size ?? null,
  hqCity: c.hq_city ?? null,
  founded: c.founded ?? null,
  careersUrl: c.careers_url ?? null,
  listedAt: c.created_at ?? null,
});
