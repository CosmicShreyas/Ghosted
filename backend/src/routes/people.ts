// People pages (/u/<publicId> on the site): one page per person, whatever name they currently show.
// Identity is account-level (dto.ts storyAuthor), so every story, chitchat and page shows the same
// person the same way, and the 15-digit public id is the only thing that ever addresses them.
import { Hono, type Context } from "hono";
import { z } from "zod";
import { ApiError, dbFail, notFound } from "../errors.js";
import { AUTHOR_COLUMNS, storyAuthor, type AuthorRow, type StoryRow } from "../dto.js";
import { hydrate, publishedStories } from "../stories.js";
import { me, optionalAuth, rateLimit, requireAuth, type AppEnv } from "../security.js";
import { admin } from "../supabase.js";
import { notifyNewFollower } from "../notify.js";
import { bump, later } from "../live.js";
import { optionalText, publicId, validate } from "../validate.js";
import { goofy, GOOFY, isGoofyPublicId } from "../goofy/index.js";

type Person = AuthorRow & { id: string; created_at: string; kind?: "person" | "bot" };

const idParam = validate("param", z.object({ id: publicId }));

async function personByPublicId(id: string): Promise<Person> {
  // Goofy's account is created on first use, so his page always exists.
  if (isGoofyPublicId(id)) await goofy().catch((e: Error) => console.error(e.message));
  const { data, error } = await admin().from("profiles").select(`id, ${AUTHOR_COLUMNS}, created_at, kind`).eq("public_id", id).maybeSingle();
  if (error) dbFail("person", error);
  if (!data) throw notFound("Profile");
  return data as unknown as Person;
}

const OUTCOMES = ["ghosted", "rejected", "offer", "offer_revoked", "ghost_job"] as const;
const WEEKS = 8;

// Everything the page header and the right-hand stats need, computed from their published stories.
async function statsFor(person: Person) {
  const [{ data: rows, error }, followers, following] = await Promise.all([
    admin().from("stories").select("id, outcome, created_at, days_waited, company:companies(slug, name, color), rating_hiring, rating_communication, rating_culture, rating_pay, rating_growth").eq("author_id", person.id).eq("status", "published").limit(1000),
    admin().from("follows").select("follower_id", { count: "exact", head: true }).eq("followee_id", person.id),
    admin().from("follows").select("followee_id", { count: "exact", head: true }).eq("follower_id", person.id),
  ]);
  if (error) dbFail("person stats", error);
  const stories = (rows ?? []) as unknown as { id: string; outcome: string; created_at: string; days_waited: number | null; company: { slug: string; name: string; color: string } | null; rating_hiring: number; rating_communication: number; rating_culture: number; rating_pay: number; rating_growth: number }[];
  const ids = stories.map((s) => s.id);

  const since = new Date(Date.now() - WEEKS * 7 * 86400_000);
  const [{ data: counts }, { data: recent }] = ids.length
    ? await Promise.all([
        admin().from("story_counts").select("story_id, relatable, flags, comments").in("story_id", ids),
        admin().from("reactions").select("kind, created_at").in("story_id", ids).gte("created_at", since.toISOString()).limit(10000),
      ])
    : [{ data: [] }, { data: [] }];
  const sum = (k: "relatable" | "flags" | "comments") => (counts ?? []).reduce((n, c) => n + Number((c as Record<string, unknown>)[k] ?? 0), 0);

  // Reactions their stories received, per week, oldest first (the activity chart).
  const weekly = Array.from({ length: WEEKS }, (_, i) => {
    const start = new Date(since.getTime() + i * 7 * 86400_000);
    return { week: start.toISOString().slice(0, 10), relatable: 0, flags: 0 };
  });
  for (const r of recent ?? []) {
    const i = Math.min(WEEKS - 1, Math.floor((new Date(r.created_at as string).getTime() - since.getTime()) / (7 * 86400_000)));
    if (i >= 0) weekly[i]![r.kind === "flag" ? "flags" : "relatable"]++;
  }

  const byCompany = new Map<string, { slug: string; name: string; color: string; stories: number }>();
  for (const s of stories) if (s.company) { const e = byCompany.get(s.company.slug) ?? { ...s.company, stories: 0 }; e.stories++; byCompany.set(s.company.slug, e); }
  const waits = stories.map((s) => s.days_waited).filter((d): d is number => d != null);
  const avg = (k: keyof (typeof stories)[number]) => (stories.length ? Math.round((stories.reduce((n, s) => n + Number(s[k]), 0) / stories.length - 1) * 25) : null);

  return {
    stories: stories.length,
    relatableReceived: sum("relatable"),
    flagsReceived: sum("flags"),
    chitchatsReceived: sum("comments"),
    followers: followers.count ?? 0,
    following: following.count ?? 0,
    companies: byCompany.size,
    avgDaysWaited: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null,
    outcomes: OUTCOMES.map((o) => ({ outcome: o, count: stories.filter((s) => s.outcome === o).length })),
    weekly,
    topCompanies: [...byCompany.values()].sort((a, b) => b.stories - a.stories).slice(0, 5),
    ratings: stories.length ? { hiring: avg("rating_hiring"), communication: avg("rating_communication"), culture: avg("rating_culture"), pay: avg("rating_pay"), growth: avg("rating_growth") } : null,
  };
}

async function relationship(viewerId: string, personId: string) {
  const [{ data: f }, { data: m }] = await Promise.all([
    admin().from("follows").select("notify").eq("follower_id", viewerId).eq("followee_id", personId).maybeSingle(),
    admin().from("mutes").select("muted_id").eq("muter_id", viewerId).eq("muted_id", personId).maybeSingle(),
  ]);
  return { following: !!f, notify: !!f?.notify, muted: !!m };
}

async function storiesPage(c: Context<AppEnv>, person: Person, before: string | undefined, limit: number) {
  let q = publishedStories().eq("author_id", person.id).order("created_at", { ascending: false }).limit(limit + 1);
  if (before) q = q.lt("created_at", before);
  const { data, error } = await q;
  if (error) dbFail("person stories", error);
  const rows = (data ?? []) as unknown as StoryRow[];
  const page = rows.slice(0, limit);
  return { stories: await hydrate(page, c.get("profile")), nextCursor: rows.length > limit ? page.at(-1)!.created_at : null };
}

// Following, unfollowing, the bell and muting all change the page for both people, live.
const changed = (viewerId: string, person: Person) => later(bump({ user: viewerId, topics: ["me"], shared: [`person:${person.public_id}`] }));

const noSelf = (c: Context<AppEnv>, person: Person) => { if (person.id === me(c).id) throw new ApiError(400, "self", "That's you. You're already your biggest fan."); };
// Goofy is official: followable, but no bell, no mute, no report.
const notBot = (person: Person, what: string) => { if (person.kind === "bot") throw new ApiError(400, "official_account", `Goofy is Ghosted's official AutoMod, so he can't be ${what}.`); };

// ---------- Goofy's page ----------
const ACTION_LABEL: Record<string, string> = {
  removed_story: "Removed a vulgar story", removed_chitchat: "Removed a vulgar chitchat", held: "Held a post for a quick check", released: "Released a post after its check",
  redacted: "Hid a person's name and published", took_down: "Took down a post after reports", restored: "Restored a post after reports didn't hold",
  reported_story: "Reported a story for a human to check", reported_chitchat: "Reported a chitchat for a human to check", reported_company: "Reported a company listing",
  asked_rephrase: "Asked an author to rephrase an accusation", warned: "Gave someone a friendly warning", paused: "Paused someone's posting for 3 days",
  welcomed: "Welcomed a new member", ghost_job_alert: "Warned followers about ghost jobs", dismissed_reports: "Closed stale reports", escalated: "Flagged items for the human team",
  lists_updated: "Refreshed the word lists", learned: "Learned new words from the community",
};
const REMOVAL = ["removed_story", "removed_chitchat", "took_down"];
const REPORTS = ["reported_story", "reported_chitchat", "reported_company"];

async function goofyStats(person: Person) {
  const since = new Date(Date.now() - WEEKS * 7 * 86400_000);
  const [all, recent, followers, upS, noS, upC, noC, terms] = await Promise.all([
    admin().from("goofy_actions").select("action").limit(100000),
    admin().from("goofy_actions").select("action, reason, created_at").gte("created_at", since.toISOString()).limit(50000),
    admin().from("follows").select("follower_id", { count: "exact", head: true }).eq("followee_id", person.id),
    admin().from("reports").select("id", { count: "exact", head: true }).eq("reporter_id", person.id).eq("outcome", "upheld"),
    admin().from("reports").select("id", { count: "exact", head: true }).eq("reporter_id", person.id).eq("outcome", "dismissed"),
    admin().from("comment_reports").select("id", { count: "exact", head: true }).eq("reporter_id", person.id).eq("outcome", "upheld"),
    admin().from("comment_reports").select("id", { count: "exact", head: true }).eq("reporter_id", person.id).eq("outcome", "dismissed"),
    admin().from("moderation_terms").select("term", { count: "exact", head: true }).eq("status", "active"),
  ]);
  const count = (rows: { action: string }[], set: string[]) => rows.filter((r) => set.includes(r.action)).length;
  const A = (all.data ?? []) as { action: string }[], R = (recent.data ?? []) as { action: string; reason: string | null; created_at: string }[];
  const weekly = Array.from({ length: WEEKS }, (_, i) => ({ week: new Date(since.getTime() + i * 7 * 86400_000).toISOString().slice(0, 10), removed: 0, held: 0, reported: 0 }));
  for (const r of R) {
    const i = Math.min(WEEKS - 1, Math.floor((new Date(r.created_at).getTime() - since.getTime()) / (7 * 86400_000)));
    if (i < 0) continue;
    if (REMOVAL.includes(r.action)) weekly[i]!.removed++; else if (r.action === "held") weekly[i]!.held++; else if (REPORTS.includes(r.action)) weekly[i]!.reported++;
  }
  const reasons = new Map<string, number>();
  for (const r of R) if ((REMOVAL.includes(r.action) || r.action === "held") && r.reason) reasons.set(r.reason, (reasons.get(r.reason) ?? 0) + 1);
  const upheld = (upS.count ?? 0) + (upC.count ?? 0), dismissed = (noS.count ?? 0) + (noC.count ?? 0);
  return {
    actions: A.length, removed: count(A, REMOVAL), held: count(A, ["held"]), released: count(A, ["released", "redacted", "restored"]), reportsFiled: count(A, REPORTS),
    welcomed: count(A, ["welcomed"]), followers: followers.count ?? 0, weekly,
    reasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([reason, n]) => ({ reason, count: n })),
    accuracy: upheld + dismissed ? Math.round((upheld / (upheld + dismissed)) * 100) : null, reportsDecided: upheld + dismissed,
    wordsWatched: terms.count ?? 0,
  };
}

async function goofyActivity(before: string | undefined, limit: number) {
  let q = admin().from("goofy_actions").select("public_id, action, target_kind, story_public_id, company_slug, reason, created_at").order("created_at", { ascending: false }).limit(limit + 1);
  if (before) q = q.lt("created_at", before);
  const { data, error } = await q;
  if (error) dbFail("goofy activity", error);
  const rows = (data ?? []) as { public_id: number; action: string; target_kind: string | null; story_public_id: number | null; company_slug: string | null; reason: string | null; created_at: string }[];
  const page = rows.slice(0, limit);
  // Link a story only while it's public (held or removed ones stay unlinked).
  const ids = [...new Set(page.map((r) => r.story_public_id).filter((x): x is number => x != null))];
  const { data: live } = ids.length ? await admin().from("stories").select("public_id").in("public_id", ids).eq("status", "published") : { data: [] };
  const open = new Set(((live ?? []) as { public_id: number }[]).map((r) => String(r.public_id)));
  return {
    activity: page.map((r) => ({ publicId: String(r.public_id), action: r.action, label: ACTION_LABEL[r.action] ?? r.action, kind: r.target_kind, reason: r.reason, storyPublicId: r.story_public_id && open.has(String(r.story_public_id)) ? String(r.story_public_id) : null, companySlug: r.company_slug, createdAt: r.created_at })),
    nextCursor: rows.length > limit ? page.at(-1)!.created_at : null,
  };
}

export const peopleRoutes = new Hono<AppEnv>()
  .get("/:id", optionalAuth, rateLimit({ name: "profile", max: 180, windowSeconds: 60 }), idParam, async (c) => {
    const person = await personByPublicId(c.req.valid("param").id);
    const viewer = c.get("profile");
    if (person.kind === "bot") {
      const [g, rel, act] = await Promise.all([goofyStats(person), viewer && viewer.id !== person.id ? relationship(viewer.id, person.id) : Promise.resolve(null), goofyActivity(undefined, 15)]);
      const empty = { stories: 0, relatableReceived: 0, flagsReceived: 0, chitchatsReceived: 0, followers: g.followers, following: 0, companies: 0, avgDaysWaited: null, outcomes: [], weekly: [], topCompanies: [], ratings: null };
      return c.json({ profile: { ...storyAuthor(person), name: GOOFY.handle, joinedAt: person.created_at, isMe: false, bot: { badge: GOOFY.badge, avatarUrl: GOOFY.avatarUrl, bio: GOOFY.bio } }, stats: empty, goofy: g, relationship: rel && { ...rel, notify: false }, stories: [], nextCursor: null, activity: act.activity, activityCursor: act.nextCursor });
    }
    const [stats, rel, first] = await Promise.all([
      statsFor(person),
      viewer && viewer.id !== person.id ? relationship(viewer.id, person.id) : Promise.resolve(null),
      storiesPage(c, person, undefined, 10),
    ]);
    return c.json({ profile: { ...storyAuthor(person), joinedAt: person.created_at, isMe: viewer?.id === person.id }, stats, relationship: rel, ...first });
  })

  // More of their stories, newest first (`before` = the last story's createdAt).
  .get("/:id/stories", optionalAuth, rateLimit({ name: "profile-stories", max: 180, windowSeconds: 60 }), idParam, validate("query", z.object({ before: z.string().datetime().optional(), limit: z.coerce.number().int().min(1).max(30).default(10) })), async (c) => {
    const person = await personByPublicId(c.req.valid("param").id);
    const { before, limit } = c.req.valid("query");
    return c.json(await storiesPage(c, person, before, limit));
  })

  // Goofy's activity feed, newest first (`before` = the last item's createdAt).
  .get("/:id/activity", optionalAuth, rateLimit({ name: "profile-activity", max: 180, windowSeconds: 60 }), idParam, validate("query", z.object({ before: z.string().datetime().optional(), limit: z.coerce.number().int().min(1).max(40).default(15) })), async (c) => {
    const person = await personByPublicId(c.req.valid("param").id);
    if (person.kind !== "bot") throw notFound("Activity");
    const { before, limit } = c.req.valid("query");
    return c.json(await goofyActivity(before, limit));
  })

  .post("/:id/follow", requireAuth, rateLimit({ name: "follow", max: 60, windowSeconds: 3600, by: "user" }), idParam, validate("json", z.object({ notify: z.boolean().optional() }).strict()), async (c) => {
    const person = await personByPublicId(c.req.valid("param").id);
    noSelf(c, person);
    if (person.kind === "bot" && c.req.valid("json").notify) notBot(person, "given a bell");
    const { notify } = c.req.valid("json");
    const { data: existing } = await admin().from("follows").select("notify").eq("follower_id", me(c).id).eq("followee_id", person.id).maybeSingle();
    const { error } = await admin().from("follows").upsert({ follower_id: me(c).id, followee_id: person.id, notify: notify ?? existing?.notify ?? false }, { onConflict: "follower_id,followee_id" });
    if (error) dbFail("follow", error);
    // Tell them once, as the follower currently appears (their handle, or name if public).
    if (!existing && person.kind !== "bot") later(notifyNewFollower(person.id, me(c)));
    changed(me(c).id, person);
    return c.json({ relationship: await relationship(me(c).id, person.id) });
  })

  .delete("/:id/follow", requireAuth, rateLimit({ name: "unfollow", max: 60, windowSeconds: 3600, by: "user" }), idParam, async (c) => {
    const person = await personByPublicId(c.req.valid("param").id);
    const { error } = await admin().from("follows").delete().eq("follower_id", me(c).id).eq("followee_id", person.id);
    if (error) dbFail("unfollow", error);
    changed(me(c).id, person);
    return c.json({ relationship: await relationship(me(c).id, person.id) });
  })

  // "Keep them silent": their stories leave your feed. Muting also turns off their bell.
  .post("/:id/mute", requireAuth, rateLimit({ name: "mute", max: 60, windowSeconds: 3600, by: "user" }), idParam, async (c) => {
    const person = await personByPublicId(c.req.valid("param").id);
    noSelf(c, person);
    notBot(person, "muted");
    const { error } = await admin().from("mutes").upsert({ muter_id: me(c).id, muted_id: person.id }, { onConflict: "muter_id,muted_id" });
    if (error) dbFail("mute", error);
    await admin().from("follows").update({ notify: false }).eq("follower_id", me(c).id).eq("followee_id", person.id);
    later(bump({ user: me(c).id, topics: ["me"], shared: ["feed"] }));
    changed(me(c).id, person);
    return c.json({ relationship: await relationship(me(c).id, person.id) });
  })

  .delete("/:id/mute", requireAuth, rateLimit({ name: "unmute", max: 60, windowSeconds: 3600, by: "user" }), idParam, async (c) => {
    const person = await personByPublicId(c.req.valid("param").id);
    const { error } = await admin().from("mutes").delete().eq("muter_id", me(c).id).eq("muted_id", person.id);
    if (error) dbFail("unmute", error);
    later(bump({ user: me(c).id, topics: ["me"], shared: ["feed"] }));
    changed(me(c).id, person);
    return c.json({ relationship: await relationship(me(c).id, person.id) });
  })

  .post("/:id/report", requireAuth, rateLimit({ name: "report-person", max: 10, windowSeconds: 3600, by: "user" }), idParam, validate("json", z.object({
    reason: z.enum(["impersonation", "harassment", "spam", "identifies_person", "fake_stories", "other"]),
    details: optionalText(1000),
  }).strict()), async (c) => {
    const person = await personByPublicId(c.req.valid("param").id);
    noSelf(c, person);
    notBot(person, "reported");
    const { reason, details } = c.req.valid("json");
    const { error } = await admin().from("profile_reports").insert({ profile_id: person.id, reporter_id: me(c).id, reason, details: details ?? null });
    if (error) dbFail("report person", error);
    return c.json({ ok: true, message: "Thanks. Our moderators will review this within 24 hours. They won't know it was you." }, 201);
  });
