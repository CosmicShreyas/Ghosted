// GET /v1/search?q=…: the main search bar. Stories ranked by algorithms/search.ts (concepts,
// typo tolerance, BM25F, filters like company:acme or outcome:ghosted), plus matching companies.
//
// The index is the last year of published stories (up to 3,000), cached in memory for a minute
// per server instance, so typing doesn't hit the database on every keystroke.
import { Hono } from "hono";
import { z } from "zod";
import { parseQuery, search, searchCompanies, type SearchDoc } from "../algorithms/index.js";
import { AUTHOR_COLUMNS, companyDto, storyAuthor, type AuthorRow, type CompanyScoreRow, type StoryRow } from "../dto.js";
import { dbFail } from "../errors.js";
import { fromBytea } from "../lib/compression.js";
import { hydrate, publishedStories } from "../stories.js";
import { optionalAuth, rateLimit, type AppEnv } from "../security.js";
import { admin } from "../supabase.js";
import { loadLive } from "../automation.js";
import { validate } from "../validate.js";

let cache: { at: number; docs: SearchDoc[] } | null = null;

type SearchableProfile = AuthorRow & { id: string; kind?: "person" | "bot" };

const fold = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// Real names only enter this index through storyAuthor(), which exposes them solely when the
// account is public and the owner has explicitly shared the name field.
function searchPeople(rows: SearchableProfile[], query: string, limit = 6) {
  const needle = fold(query);
  const terms = needle.split(/\s+/).filter(Boolean);
  return rows.flatMap((row) => {
    const author = storyAuthor(row);
    const handle = fold(author.handle);
    const publicName = author.revealed?.name ? fold(author.revealed.name) : "";
    const haystack = `${handle} ${publicName}`;
    if (!terms.every((term) => haystack.includes(term))) return [];
    const score = publicName === needle || handle === needle ? 0
      : publicName.startsWith(needle) || handle.startsWith(needle) ? 1
        : handle.includes(needle) ? 2 : 3;
    return [{ row, author, score }];
  }).sort((a, b) => a.score - b.score || a.author.name.localeCompare(b.author.name)).slice(0, limit);
}

async function index(): Promise<SearchDoc[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.docs;
  const { data, error } = await admin().from("stories")
    .select("id, title, body_z, job_role, outcome, stage, created_at, company:companies(slug, name)")
    .eq("status", "published").gte("created_at", new Date(Date.now() - 365 * 86400_000).toISOString())
    .order("created_at", { ascending: false }).limit(3000);
  if (error) dbFail("search index", error);
  type Row = { id: string; title: string; body_z: string; job_role: string | null; outcome: string; stage: string; created_at: string; company: { slug: string; name: string } | null };
  const rows = (data ?? []) as unknown as Row[];
  const { data: counts } = rows.length ? await admin().from("story_counts").select("story_id, relatable, comments").in("story_id", rows.map((r) => r.id).slice(0, 3000)) : { data: [] };
  const eng = new Map(((counts ?? []) as { story_id: string; relatable: number; comments: number }[]).map((r) => [r.story_id, r.relatable + r.comments * 2]));
  const docs = rows.map((r) => {
    let body = "";
    try { body = fromBytea(r.body_z); } catch { /* unreadable row: title still searchable */ }
    return { id: r.id, title: r.title, body, company: r.company?.name ?? "", companySlug: r.company?.slug ?? "", role: r.job_role ?? "", outcome: r.outcome, stage: r.stage, createdAt: new Date(r.created_at).getTime(), engagement: eng.get(r.id) ?? 0 };
  });
  cache = { at: Date.now(), docs };
  return docs;
}

export const searchRoutes = new Hono<AppEnv>().get("/", optionalAuth, rateLimit({ name: "search", max: 120, windowSeconds: 60 }), validate("query", z.object({
  q: z.string().trim().min(2).max(200),
  limit: z.coerce.number().int().min(1).max(40).default(20),
})), async (c) => {
  const { q, limit } = c.req.valid("query");
  const parsed = parseQuery(q);
  const [docs, , cos, profiles] = await Promise.all([
    index(),
    loadLive(), // learned synonyms
    admin().from("company_scores").select("*").limit(3000),
    admin().from("profiles").select(`id, ${AUTHOR_COLUMNS}, kind`).limit(3000),
  ]);
  if (cos.error) dbFail("search companies", cos.error);
  if (profiles.error) dbFail("search people", profiles.error);
  const hits = search(docs, parsed, Date.now(), limit);
  const ids = hits.map((h) => h.id);
  const { data, error } = ids.length ? await publishedStories().in("id", ids) : { data: [], error: null };
  if (error) dbFail("search results", error);
  const order = new Map(ids.map((id, i) => [id, i]));
  const rows = ((data ?? []) as unknown as StoryRow[]).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const companies = parsed.terms.length || parsed.company ? searchCompanies((cos.data ?? []) as CompanyScoreRow[], parsed.company ?? q, 5) : [];
  const peopleWithRows = searchPeople((profiles.data ?? []) as unknown as SearchableProfile[], q);
  const viewer = c.get("profile");
  const peopleIds = peopleWithRows.map(({ row }) => row.id);
  const followed = new Set<string>();
  if (viewer && peopleIds.length) {
    const { data: follows, error: followError } = await admin().from("follows").select("followee_id")
      .eq("follower_id", viewer.id).in("followee_id", peopleIds);
    if (followError) dbFail("search relationships", followError);
    for (const follow of (follows ?? []) as { followee_id: string }[]) followed.add(follow.followee_id);
  }
  return c.json({
    stories: await hydrate(rows, c.get("profile")),
    companies: companies.map(companyDto),
    people: peopleWithRows.map(({ row, author }) => ({
      ...author,
      isMe: viewer?.id === row.id,
      following: followed.has(row.id),
      ...(row.kind === "bot" && { bot: { badge: "AutoMod" } }),
    })),
    // What the search understood, so the page can say "Showing results for …".
    understood: { terms: parsed.terms, company: parsed.company, outcome: parsed.outcome, stage: parsed.stage, phrases: parsed.phrases, exclude: parsed.exclude },
  });
});
