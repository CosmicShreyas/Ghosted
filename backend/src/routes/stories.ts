import { Hono } from "hono";
import { z } from "zod";
import { ApiError, dbFail, forbidden, notFound } from "../errors.js";
import { AUTHOR_COLUMNS, storyAuthor, type AuthorRow, type StoryRow } from "../dto.js";
import { countsFor, hydrate, publishedStories, publishedStoryId, storyByPublicId } from "../stories.js";
import { me, optionalAuth, rateLimit, requireAuth, type AppEnv, type Profile } from "../security.js";
import { ensureOpen, goofyControls } from "../platform.js";
import { verifyChallenge } from "../captcha.js";
import { admin } from "../supabase.js";
import { addNotification, notifyCompanyFollowers, notifyFollowers, notifyRelatable, notifyReply } from "../notify.js";
import { bump, later } from "../live.js";
import { fromBytea, toBytea } from "../lib/compression.js";
import { optionalText, publicId, text, validate } from "../validate.js";
import { moderationRecord, refuseIfBlocked, reviewContent, triageReports } from "../moderation.js";
import { rankFeed, type Candidate } from "../algorithms/index.js";
import { kickSweep } from "../automation.js";
import { act, ensureCanPost, reportAs, say, strike } from "../goofy/index.js";
import type { Review } from "../algorithms/index.js";
import { checkJourney } from "../score.js";
import { notifyWaiting } from "../interest.js";
import { notifyInviter } from "../referral.js";
import { award } from "../levels.js";
import { forgetShield, isEverRepOf, maskAuthor, shieldFor } from "../rep-guard.js";
import { recordRepView } from "../impact.js";

const rating = z.number().int().min(1).max(5);

const optRating = rating.nullable().optional();
const outcomeEnum = z.enum(["ghosted", "rejected", "offer", "offer_revoked", "ghost_job"]);
const stageEnum = z.enum(["application", "screening", "technical", "final", "offer"]);
// Which ratings a story may carry depends on its journey; checkJourney (score.ts) enforces it.
const ratingsShape = z.object({ hiring: rating.optional(), communication: rating.optional(), culture: optRating, pay: optRating, growth: optRating }).strict();
const salaryShape = z.object({ min: z.number().min(0).max(1000), max: z.number().min(0).max(1000) }).refine((s) => s.max >= s.min, "Max must be at least min");

export const GREEN_FLAGS = ["replied_48h", "clear_pay", "respectful_rejection", "quick_process", "gave_feedback"] as const;
const newStory = z.object({
  companySlug: z.string().regex(/^[a-z0-9-]{2,60}$/),
  outcome: outcomeEnum,
  stage: stageEnum,
  role: optionalText(140),
  title: text(5, 90),
  body: text(40, 4000),
  ratings: ratingsShape,
  joined: z.boolean().nullable().optional(),
  quick: z.boolean().optional(),
  salary: salaryShape.optional(),
  daysWaited: z.number().int().min(0).max(730).optional(),
  // Kept for older clients; ignored. Identity is account-level (see dto.ts storyAuthor).
  anonymous: z.boolean().optional(),
  captchaToken: z.string().max(12000).optional(),
  // Green flag shout-out: up to 3 things the company did well. Always a quick story that ended in
  // an offer or a (respectful) rejection.
  greenFlags: z.array(z.enum(GREEN_FLAGS)).min(1).max(3).optional(),
}).strict().superRefine(checkJourney).superRefine((s, ctx) => {
  if (!s.greenFlags) return;
  if (new Set(s.greenFlags).size !== s.greenFlags.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["greenFlags"], message: "Pick each one once" });
  if (s.outcome !== "offer" && s.outcome !== "rejected") ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["outcome"], message: "A shout-out is for an offer or a respectful rejection" });
});

const idParam = validate("param", z.object({ id: publicId }));

// Editing your own story: everything except the company (moving a story would move scores around).
// Salary can be cleared with null. Edited stories get an "Edited" badge (edited_at).
const storyEdit = z.object({
  outcome: outcomeEnum,
  stage: stageEnum,
  role: optionalText(140),
  title: text(5, 90),
  body: text(40, 4000),
  ratings: ratingsShape,
  joined: z.boolean().nullable().optional(),
  quick: z.boolean().optional(),
  salary: salaryShape.nullable().optional(),
  daysWaited: z.number().int().min(0).max(730).nullable().optional(),
}).strict().superRefine(checkJourney);

export const storyRoutes = new Hono<AppEnv>()
  // Feed, newest first, cursor-paginated with `before` (an ISO timestamp from the last item).
  .get("/", optionalAuth, rateLimit({ name: "stories", max: 180, windowSeconds: 60 }), validate("query", z.object({
    company: z.string().regex(/^[a-z0-9-]{2,60}$/).optional(),
    outcome: z.enum(["ghosted", "rejected", "offer", "offer_revoked", "ghost_job"]).optional(),
    // Latest: an ISO timestamp. For you: "o<offset>.<anchor ms>" (the ranking is frozen at the anchor,
    // so paging never repeats or skips a story while new ones arrive).
    before: z.union([z.string().datetime(), z.string().regex(/^o\d{1,4}\.\d{13}$/)]).optional(),
    sort: z.enum(["latest", "for_you"]).default("latest"),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })), async (c) => {
    const { company, outcome, before, limit, sort } = c.req.valid("query");
    if (sort === "for_you" && !company && !outcome) return c.json(await forYou(c.get("profile"), limit, before?.startsWith("o") ? before : undefined));
    let query = publishedStories().order("created_at", { ascending: false }).limit(limit + 1);
    // The company and your mutes ("keep them silent": never in your feed) are looked up side by side.
    const viewer = c.get("profile");
    const [coRes, mutedRes] = await Promise.all([
      company ? admin().from("companies").select("id").eq("slug", company).maybeSingle() : Promise.resolve({ data: null }),
      viewer ? admin().from("mutes").select("muted_id").eq("muter_id", viewer.id) : Promise.resolve({ data: [] as { muted_id: string }[] }),
    ]);
    if (company) {
      if (!coRes.data) throw notFound("Company");
      query = query.eq("company_id", (coRes.data as { id: string }).id);
    }
    if (outcome) query = query.eq("outcome", outcome);
    if (before && !before.startsWith("o")) query = query.lt("created_at", before);
    const muted = (mutedRes.data ?? []) as { muted_id: string }[];
    if (muted.length) query = query.not("author_id", "in", `(${muted.map((m) => m.muted_id).join(",")})`);
    const { data, error } = await query;
    if (error) dbFail("feed", error);
    const rows = (data ?? []) as unknown as StoryRow[];
    const page = rows.slice(0, limit);
    return c.json({ stories: await hydrate(page, c.get("profile")), nextCursor: rows.length > limit ? page.at(-1)!.created_at : null });
  })

  .get("/:id", optionalAuth, rateLimit({ name: "story", max: 180, windowSeconds: 60 }), idParam, async (c) => {
    const row = await storyByPublicId(c.req.valid("param").id);
    const [story] = await hydrate([row], c.get("profile"));
    // A verified rep of this story's company opening it: "Seen by the team" (impact.ts, once per rep).
    const viewer = c.get("profile");
    if (viewer) later(recordRepView(viewer.id, row.id));
    return c.json({ story });
  })

  .post("/", requireAuth, rateLimit({ name: "story-create", max: 8, windowSeconds: 3600, by: "user" }), rateLimit({ name: "story-create-day", max: 25, windowSeconds: 86400, by: "user" }), validate("json", newStory), async (c) => {
    const body = c.req.valid("json");
    await verifyChallenge(c, body.captchaToken);
    const { data: company } = await admin().from("companies").select("id, name").eq("slug", body.companySlug).eq("status", "listed").maybeSingle();
    if (!company) throw new ApiError(400, "unknown_company", "Pick a company from the list, or add it first.");
    // A company's own rep (now or before) can't post a candidate story about it: a conflict of interest.
    if (await isEverRepOf(me(c).id, company.id as string)) throw new ApiError(403, "rep_conflict", "You're verified as a representative of this company, so you can't post a candidate story about it. Your official reply is the place for the company's side.");
    // One story per person per company per 30 days keeps scores from being stuffed.
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { count } = await admin().from("stories").select("id", { count: "exact", head: true }).eq("author_id", me(c).id).eq("company_id", company.id).gte("created_at", since);
    if ((count ?? 0) > 0) throw new ApiError(409, "duplicate_story", "You've already shared a story about this company recently.");
    // Automatic review (algorithms/moderation.ts): blocked content is refused with the reason;
    // content that needs a human is saved as pending and goes up after a check.
    await ensureOpen("postingOpen");
    ensureCanPost(me(c));
    const review = await reviewContent(me(c), "story", `${body.title}\n${body.role ?? ""}\n${body.body}`, company.name as string);
    const goofy = await goofyControls();
    const goofyBlocked = review.decision === "block" && review.reasons.some((r) => GOOFY_REMOVES.has(r.code));
    // Vulgar, slurs or threats: Goofy turns it away (your draft stays with you) and counts a strike.
    if (goofyBlocked && goofy.enabled && goofy.blockVulgarity) await goofyRefuses(me(c), "story", review);
    if (!goofyBlocked) refuseIfBlocked(review);
    const held = goofy.enabled && goofy.holdRisky && review.decision === "review";
    const { data, error } = await admin().from("stories").insert({
      author_id: me(c).id, company_id: company.id, outcome: body.outcome, stage: body.stage, job_role: body.role, title: body.title, body_z: toBytea(body.body),
      rating_hiring: body.ratings.hiring, rating_communication: body.ratings.communication, rating_culture: body.ratings.culture ?? null, rating_pay: body.ratings.pay ?? null, rating_growth: body.ratings.growth ?? null,
      joined: body.outcome === "offer" ? body.joined ?? null : null, quick: body.quick ?? false,
      salary_min_lpa: body.salary?.min ?? null, salary_max_lpa: body.salary?.max ?? null, days_waited: body.daysWaited ?? null, anonymous: false,
      status: held ? "pending" : "published", moderation: moderationRecord(review),
    }).select("public_id").single();
    if (error) dbFail("create story", error);
    // A shout-out's ticks (best effort: a missing table just means no green card style yet).
    if (body.greenFlags?.length) {
      const { error: gErr } = await admin().from("story_green_flags").insert({ story_id: await idOfStory(String(data.public_id)), flags: body.greenFlags });
      if (gErr) console.error("[story] green flags (run the Green flag shout-outs section of init_database.sql)", gErr.message);
    }
    if (held) {
      later(bump({ user: me(c).id, topics: ["stories"] }));
      later(goofyHolds(me(c), "story", review, { id: await idOfStory(String(data.public_id)), publicId: String(data.public_id) }));
      later(kickSweep()); // the held queue is decided automatically (automation.ts)
      return c.json({ pending: true, publicId: String(data.public_id), message: `Goofy: ${say("held", me(c).tone ?? "sassy", { what: "story", reason: topReason(review) })}` }, 202);
    }
    // Anyone who tapped "I want to know about this company" hears about it now.
    later(notifyWaiting(company.id as string));
    later(notifyInviter(me(c) as { id: string; referred_by?: string | null }));
    award(me(c).id, "story", String(data.public_id));
    forgetShield(); // a new author about this company: reps' shields are rebuilt (rep-guard.ts)
    const [story] = await hydrate([await storyByPublicId(String(data.public_id))], me(c));
    later(bump({ user: me(c).id, topics: ["stories"], shared: ["feed", `person:${me(c).public_id}`] })); // every open feed, your other devices, your page
    later(notifyFollowers(me(c), story!.publicId, body.title)); // followers who rang your bell
    later(notifyCompanyFollowers({ id: company.id as string, slug: body.companySlug, name: company.name as string }, me(c).id, story!.publicId, body.title)); // and the company's bell
    later(bump({ shared: [`company:${body.companySlug}`] }));
    return c.json({ story }, 201);
  })

  // Authors can take their story down at any time (soft delete keeps reports auditable).
  // Authors only. Returns the updated story.
  .patch("/:id", requireAuth, rateLimit({ name: "story-edit", max: 20, windowSeconds: 3600, by: "user" }), idParam, validate("json", storyEdit), async (c) => {
    const id = c.req.valid("param").id;
    const b = c.req.valid("json");
    // Edits go through the same automatic review as new stories.
    const { data: cur } = await admin().from("stories").select("company:companies(name)").eq("public_id", id).eq("author_id", me(c).id).maybeSingle();
    const review = await reviewContent(me(c), "story", `${b.title}\n${b.role ?? ""}\n${b.body}`, (cur as { company?: { name?: string } } | null)?.company?.name);
    const goofy = await goofyControls();
    const goofyBlocked = review.decision === "block" && review.reasons.some((r) => GOOFY_REMOVES.has(r.code));
    if (goofyBlocked && goofy.enabled && goofy.blockVulgarity) await goofyRefuses(me(c), "story", review);
    if (!goofyBlocked) refuseIfBlocked(review);
    const held = goofy.enabled && goofy.holdRisky && review.decision === "review";
    const { data, error } = await admin().from("stories").update({
      moderation: moderationRecord(review), ...(held && { status: "pending" }),
      outcome: b.outcome, stage: b.stage, job_role: b.role, title: b.title, body_z: toBytea(b.body),
      // Ratings that don't belong to the (possibly changed) journey are cleared, not kept.
      rating_hiring: b.ratings.hiring, rating_communication: b.ratings.communication, rating_culture: b.ratings.culture ?? null, rating_pay: b.ratings.pay ?? null, rating_growth: b.ratings.growth ?? null,
      joined: b.outcome === "offer" ? b.joined ?? null : null, ...(b.quick !== undefined && { quick: b.quick }),
      ...(b.outcome !== "offer" && b.outcome !== "offer_revoked" ? { salary_min_lpa: null, salary_max_lpa: null }
        : b.salary !== undefined && { salary_min_lpa: b.salary?.min ?? null, salary_max_lpa: b.salary?.max ?? null }),
      ...(b.daysWaited !== undefined && { days_waited: b.daysWaited }),
      edited_at: new Date().toISOString(),
    }).eq("public_id", id).eq("author_id", me(c).id).eq("status", "published").select("id");
    if (error) dbFail("edit story", error);
    if (!data?.length) throw forbidden();
    if (held) {
      later(bump({ user: me(c).id, topics: ["stories"], shared: ["feed", `story:${id}`, `person:${me(c).public_id}`] }));
      return c.json({ pending: true, publicId: id, message: review.message }, 202);
    }
    const [story] = await hydrate([await storyByPublicId(id)], me(c));
    later(bump({ user: me(c).id, topics: ["stories"], shared: ["feed", `story:${id}`, `person:${me(c).public_id}`] }));
    return c.json({ story });
  })

  .delete("/:id", requireAuth, rateLimit({ name: "story-delete", max: 30, windowSeconds: 3600, by: "user" }), idParam, async (c) => {
    const { data, error } = await admin().from("stories").update({ status: "removed" }).eq("public_id", c.req.valid("param").id).eq("author_id", me(c).id).select("id");
    if (error) dbFail("delete story", error);
    if (!data?.length) throw forbidden();
    later(bump({ user: me(c).id, topics: ["stories"], shared: ["feed", `story:${c.req.valid("param").id}`, `person:${me(c).public_id}`] }));
    return c.json({ ok: true });
  })

  // Reading a story (its page stayed open a few seconds): XP once per story, never for your own.
  .post("/:id/read", requireAuth, rateLimit({ name: "story-read", max: 60, windowSeconds: 600, by: "user" }), idParam, async (c) => {
    const { data } = await admin().from("stories").select("id, author_id").eq("public_id", c.req.valid("param").id).eq("status", "published").maybeSingle();
    const s = data as { id: string; author_id: string } | null;
    if (s && s.author_id !== me(c).id) award(me(c).id, "read", s.id);
    return c.body(null, 204);
  })

  // A person has one reaction per story. Tapping it again removes it; choosing another replaces it.
  .post("/:id/reactions", requireAuth, rateLimit({ name: "react", max: 90, windowSeconds: 60, by: "user" }), idParam, validate("json", z.object({ kind: z.enum(["relatable", "insightful", "creative", "support", "love"]) })), async (c) => {
    const story = { id: await publishedStoryId(c.req.valid("param").id) };
    const { kind } = c.req.valid("json");
    const key = { story_id: story.id, user_id: me(c).id };
    const { data: removed, error } = await admin().from("reactions").delete().match(key).select("kind");
    if (error) dbFail("unreact", error);
    const wasSame = removed?.some((row) => row.kind === kind);
    if (!wasSame) {
      const { error: iErr } = await admin().from("reactions").insert({ ...key, kind });
      if (iErr && iErr.code !== "23505") dbFail("react", iErr);
      if (!iErr && kind === "relatable") later(notifyRelatable(story.id, me(c).id));
      if (!iErr) award(me(c).id, "react", story.id); // once per story, however often it's toggled
    }
    later(bump({ user: me(c).id, topics: ["stories"], shared: [`story:${c.req.valid("param").id}`] }));
    return c.json(await countsFor(story.id, me(c).id));
  })

  // Chitchats (comments): top-level ones with their replies nested (one level), relatable counts and
  // your own reactions. A removed chitchat that still has replies stays as a "deleted" placeholder,
  // so the conversation under it keeps making sense.
  // Paged for scrolling: `limit` top-level chitchats per page (each with all its replies), from
  // `offset`, sorted by `sort` ("top": most relatable and discussed first; "new": newest first).
  .get("/:id/comments", optionalAuth, rateLimit({ name: "comments", max: 180, windowSeconds: 60 }), idParam, validate("query", z.object({
    sort: z.enum(["top", "new"]).default("top"),
    offset: z.coerce.number().int().min(0).max(5000).default(0),
    limit: z.coerce.number().int().min(1).max(30).default(10),
  })), async (c) => {
    const story = await storyByPublicId(c.req.valid("param").id);
    const { sort, offset, limit } = c.req.valid("query");
    const { data, error } = await admin().from("comments").select(`id, public_id, parent_id, body_z, status, created_at, edited_at, author:profiles!comments_author_id_fkey(${AUTHOR_COLUMNS})`).eq("story_id", story.id).order("created_at").limit(500);
    if (error) dbFail("chitchats", error);
    type Row = { id: string; public_id: number; parent_id: string | null; body_z: string; status: string; created_at: string; edited_at: string | null; author: AuthorRow };
    const rows = (data ?? []) as unknown as Row[];
    const viewer = c.get("profile");
    const shield = await shieldFor(viewer?.id); // reps never see who chitchatted, if they wrote about the company
    const ids = rows.map((r) => r.id);
    const [{ data: reacts }, { data: mineR }] = ids.length ? await Promise.all([
      admin().from("comment_reactions").select("comment_id").in("comment_id", ids),
      viewer ? admin().from("comment_reactions").select("comment_id").eq("user_id", viewer.id).in("comment_id", ids) : Promise.resolve({ data: [] }),
    ]) : [{ data: [] }, { data: [] }];
    const counts = new Map<string, number>();
    for (const r of reacts ?? []) counts.set(r.comment_id as string, (counts.get(r.comment_id as string) ?? 0) + 1);
    const mine = new Set((mineR ?? []).map((r) => r.comment_id as string));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const live = (r: Row) => r.status === "published";
    const dto = (r: Row) => ({
      publicId: String(r.public_id),
      parentPublicId: r.parent_id ? String(byId.get(r.parent_id)?.public_id ?? "") || null : null,
      deleted: !live(r),
      body: live(r) ? fromBytea(r.body_z) : null,
      author: live(r) ? maskAuthor(storyAuthor(r.author), shield) : null,
      createdAt: r.created_at, editedAt: r.edited_at,
      relatable: counts.get(r.id) ?? 0, myRelatable: mine.has(r.id),
      mine: live(r) && !!viewer && r.author.public_id === viewer.public_id,
    });
    const tops = rows.filter((r) => !r.parent_id);
    const replies = rows.filter((r) => r.parent_id && live(r));
    const threads = tops
      .map((t) => ({ ...dto(t), replies: replies.filter((r) => r.parent_id === t.id).map(dto) }))
      .filter((t) => !t.deleted || t.replies.length > 0)
      .sort((a, b) => sort === "new" ? b.createdAt.localeCompare(a.createdAt) : (b.relatable + b.replies.length * 2) - (a.relatable + a.replies.length * 2) || b.createdAt.localeCompare(a.createdAt));
    return c.json({
      total: rows.filter(live).length,
      chitchats: threads.slice(offset, offset + limit),
      nextOffset: offset + limit < threads.length ? offset + limit : null,
    });
  })

  // Add a chitchat, or reply to one (`parentId`: replies always attach to the top-level chitchat).
  .post("/:id/comments", requireAuth, rateLimit({ name: "comment-create", max: 30, windowSeconds: 3600, by: "user" }), idParam, validate("json", z.object({ body: text(2, 1000), parentId: publicId.optional() }).strict()), async (c) => {
    const { body, parentId } = c.req.valid("json");
    await ensureOpen("chitchatsOpen");
    ensureCanPost(me(c));
    // One parallel round: the story (id and author only), the chitchat being replied to, the
    // content review and Goofy's settings.
    type Parent = { id: string; author_id: string; parent_id: string | null; story: { public_id: number } | null };
    const [storyRes, parentRes, review, goofy] = await Promise.all([
      admin().from("stories").select("id, public_id, author_id").eq("public_id", c.req.valid("param").id).eq("status", "published").maybeSingle(),
      parentId ? admin().from("comments").select("id, author_id, parent_id, story:stories(public_id)").eq("public_id", parentId).maybeSingle() : Promise.resolve({ data: null }),
      reviewContent(me(c), "chitchat", body),
      goofyControls(),
    ]);
    if (storyRes.error) dbFail("story by id", storyRes.error);
    if (!storyRes.data) throw notFound("Story");
    const story = storyRes.data as { id: string; public_id: number; author_id: string };
    const storyOwner = { author_id: story.author_id };
    let parent: Parent | null = null;
    if (parentId) {
      const p = parentRes.data as unknown as Parent | null;
      if (!p || String(p.story?.public_id) !== String(story.public_id)) throw new ApiError(404, "not_found", "That chitchat isn't there any more.");
      parent = p;
      // Replying to a reply: join the same thread, under its top-level chitchat (but still tell the
      // person you actually replied to). The top-level chitchat's id is the reply's parent_id.
      if (parent.parent_id) parent = { id: parent.parent_id, author_id: parent.author_id, parent_id: null, story: parent.story };
    }
    const goofyBlocked = review.decision === "block" && review.reasons.some((r) => GOOFY_REMOVES.has(r.code));
    // Vulgar chitchats: Goofy turns them away on the spot (kept as removed for the record, never
    // shown) and tells the author in their tone. Never published, so never a strike.
    if (goofyBlocked && goofy.enabled && goofy.blockVulgarity) {
      const { data: gone } = await admin().from("comments").insert({ story_id: story.id, author_id: me(c).id, body_z: toBytea(body), parent_id: parent?.id ?? null, status: "removed", moderation: { ...moderationRecord(review), autoRemoved: true, by: "goofy" } }).select("id").single();
      const reason = topReason(review);
      later(act("refused", { targetKind: "chitchat", userId: me(c).id, reason }));
      void gone;
      return c.json({ removed: true, message: `Goofy: ${say("removed", me(c).tone ?? "sassy", { what: "chitchat", reason })}` }, 202);
    }
    if (!goofyBlocked) refuseIfBlocked(review);
    const held = goofy.enabled && goofy.holdRisky && review.decision === "review";
    const { data, error } = await admin().from("comments").insert({ story_id: story.id, author_id: me(c).id, body_z: toBytea(body), parent_id: parent?.id ?? null, status: held ? "pending" : "published", moderation: moderationRecord(review) }).select("id, public_id, created_at").single();
    if (error) dbFail("create chitchat", error);
    if (held) {
      later(goofyHolds(me(c), "chitchat", review, { id: data.id as string, storyPublicId: c.req.valid("param").id }));
      later(kickSweep());
      return c.json({ pending: true, message: `Goofy: ${say("held", me(c).tone ?? "sassy", { what: "chitchat", reason: topReason(review) })}` }, 202);
    }
    later(notifyReply(story.id, me(c).id, body));
    award(me(c).id, "chitchat", data.id as string);
    // The person being replied to hears about it too (unless it's the story's author, told above, or you).
    if (parent && parent.author_id !== me(c).id && parent.author_id !== (storyOwner?.author_id as string | undefined)) {
      const hidden = (await shieldFor(parent.author_id))?.ids.has(me(c).id); // the person told is a rep this author wrote about
      later(addNotification(parent.author_id, "reply", `${hidden ? "A candidate" : storyAuthor(me(c)).name} replied to your chitchat: “${body.slice(0, 80)}”`, String(story.public_id)));
    }
    later(bump({ shared: [`story:${c.req.valid("param").id}`] }));
    return c.json({ chitchat: { publicId: String(data.public_id), parentPublicId: parentId ?? null, deleted: false, body, author: storyAuthor(me(c)), createdAt: data.created_at, editedAt: null, relatable: 0, myRelatable: false, mine: true, replies: [] } }, 201);
  })

  .delete("/:id/comments/:commentId", requireAuth, rateLimit({ name: "comment-delete", max: 45, windowSeconds: 3600, by: "user" }), validate("param", z.object({ id: publicId, commentId: publicId })), async (c) => {
    const { data, error } = await admin().from("comments").update({ status: "removed" }).eq("public_id", c.req.valid("param").commentId).eq("author_id", me(c).id).select("id");
    if (error) dbFail("delete chitchat", error);
    if (!data?.length) throw forbidden();
    later(bump({ shared: [`story:${c.req.valid("param").id}`] }));
    return c.json({ ok: true });
  })

  // "Relatable" on a chitchat: toggles, returns the new count.
  .post("/:id/comments/:commentId/relatable", requireAuth, rateLimit({ name: "comment-react", max: 120, windowSeconds: 60, by: "user" }), validate("param", z.object({ id: publicId, commentId: publicId })), async (c) => {
    const { data: row } = await admin().from("comments").select("id").eq("public_id", c.req.valid("param").commentId).eq("status", "published").maybeSingle();
    if (!row) throw notFound("Chitchat");
    const key = { comment_id: row.id as string, user_id: me(c).id };
    const { data: removed, error } = await admin().from("comment_reactions").delete().match(key).select("comment_id");
    if (error) dbFail("unrelate chitchat", error);
    if (!removed?.length) { const { error: iErr } = await admin().from("comment_reactions").insert(key); if (iErr && iErr.code !== "23505") dbFail("relate chitchat", iErr); }
    const { count } = await admin().from("comment_reactions").select("comment_id", { count: "exact", head: true }).eq("comment_id", row.id);
    later(bump({ shared: [`story:${c.req.valid("param").id}`] }));
    return c.json({ relatable: count ?? 0, myRelatable: !removed?.length });
  })

  .post("/:id/comments/:commentId/report", requireAuth, rateLimit({ name: "comment-report", max: 20, windowSeconds: 3600, by: "user" }), validate("param", z.object({ id: publicId, commentId: publicId })), validate("json", z.object({
    reason: z.enum(["harassment", "identifies_person", "spam", "false_info", "off_topic", "other"]),
    details: optionalText(1000),
  }).strict()), async (c) => {
    await ensureOpen("reportsOpen");
    const { data: row } = await admin().from("comments").select("id, author_id, body_z, created_at").eq("public_id", c.req.valid("param").commentId).maybeSingle();
    if (!row) throw notFound("Chitchat");
    if (row.author_id === me(c).id) throw new ApiError(400, "own_chitchat", "That's your own chitchat. You can delete it instead.");
    const { reason, details } = c.req.valid("json");
    const { error } = await admin().from("comment_reports").insert({ comment_id: row.id, reporter_id: me(c).id, reason, details: details ?? null });
    if (error) dbFail("report chitchat", error);
    // Re-rank the queue for this chitchat; several trusted reports on risky content hide it for review.
    later((async () => {
      const { count } = await admin().from("comment_reactions").select("comment_id", { count: "exact", head: true }).eq("comment_id", row.id);
      const t = await triageReports({ kind: "comment", id: row.id as string, text: fromBytea(row.body_z as string), createdAt: row.created_at as string, engagement: count ?? 0, authorId: row.author_id as string });
      if (t?.autoHide) await bump({ shared: [`story:${c.req.valid("param").id}`] });
      await kickSweep();
    })());
    return c.json({ ok: true, message: "Thanks. Moderators will review this chitchat within 24 hours." }, 201);
  })

  // Anyone (logged in or not) can report; reports go to the moderation queue in the reports table.
  .post("/:id/report", optionalAuth, rateLimit({ name: "report", max: 15, windowSeconds: 3600 }), idParam, validate("json", z.object({
    reason: z.enum(["false_info", "identifies_person", "harassment", "confidential", "spam", "other"]),
    details: optionalText(1000),
  })), async (c) => {
    await ensureOpen("reportsOpen");
    const story = await storyByPublicId(c.req.valid("param").id);
    const { reason, details } = c.req.valid("json");
    // Right of Reply: a company's verified reps can't report its stories to get them removed. They
    // reply publicly, or use the removal and correction request form, which a moderator reviews.
    const reporter = c.get("profile");
    if (reporter) {
      const { data: s } = await admin().from("stories").select("company_id").eq("id", story.id).single();
      const { data: rep } = await admin().from("company_reps").select("user_id").eq("user_id", reporter.id).eq("company_id", (s as { company_id: string }).company_id).is("revoked_at", null).maybeSingle();
      if (rep) throw new ApiError(403, "rep_cannot_report", "As this company's verified representative, you can't report its stories. Post your official reply, or send a removal or correction request for a moderator to review.");
    }
    const { error } = await admin().from("reports").insert({ story_id: story.id, reporter_id: c.get("profile")?.id ?? null, reason, details });
    if (error) dbFail("report", error);
    later((async () => {
      const { data: s } = await admin().from("stories").select("title, body_z, created_at, author_id").eq("id", story.id).single();
      const { data: n } = await admin().from("story_counts").select("relatable, comments").eq("story_id", story.id).maybeSingle();
      const row = s as { title: string; body_z: string; created_at: string; author_id: string };
      const t = await triageReports({ kind: "story", id: story.id, text: `${row.title}\n${fromBytea(row.body_z)}`, createdAt: row.created_at, engagement: ((n as { relatable?: number; comments?: number } | null)?.relatable ?? 0) + ((n as { comments?: number } | null)?.comments ?? 0), authorId: row.author_id });
      if (t?.autoHide) await bump({ shared: ["feed", `story:${c.req.valid("param").id}`] });
      await kickSweep();
    })());
    return c.json({ ok: true, message: "Thanks. Our moderators will review this within 24 hours." }, 201);
  });

// ---------- Goofy at the door ----------
const GOOFY_REMOVES = new Set(["vulgar", "slur", "identity_attack", "threat"]);
const topReason = (r: Review) => [...r.reasons].sort((a, b) => b.weight - a.weight)[0]?.detail ?? "a guideline issue";
async function idOfStory(publicId: string) { const { data } = await admin().from("stories").select("id").eq("public_id", publicId).single(); return (data as { id: string }).id; }
// Refused at the door: Goofy logs it and says it in the author's tone. It never went public, so it's
// never a strike: the author can edit and try again as often as they need.
async function goofyRefuses(p: Profile, kind: "story" | "chitchat", review: Review): Promise<never> {
  const reason = topReason(review);
  later(act("refused", { targetKind: kind, userId: p.id, reason }));
  throw new ApiError(422, "moderation_blocked", `Goofy: ${say("removed", p.tone ?? "sassy", { what: kind, reason })}`, { body: review.message ?? reason });
}
// Held for a check: Goofy logs it and, where a human might be needed, files his own report.
async function goofyHolds(p: Profile, kind: "story" | "chitchat", review: Review, target: { id: string; publicId?: string; storyPublicId?: string }) {
  await act("held", { targetKind: kind, reason: topReason(review) });
  const codes = review.reasons.map((r) => r.code);
  if (codes.some((x) => ["defamation_risk", "targeted_abuse", "sexual_abuse", "confidential", "self_harm"].includes(x))) await reportAs(kind, target.id, codes, topReason(review), { storyPublicId: target.publicId ?? target.storyPublicId ?? null });
  void p;
}

// ---------- For you (algorithms/recommend.ts) ----------
// Candidates: published stories from the last 21 days (up to 500), plus older ones from people and
// companies you follow (last 90 days), minus people you've muted. Ranked, diversified, then paged.
async function forYou(viewer: Profile | null, limit: number, cursor: string | undefined) {
  const [offsetPart, anchorPart] = cursor ? cursor.slice(1).split(".") : ["0", String(Date.now())];
  const offset = Number(offsetPart), anchor = Number(anchorPart);
  const [fa, fc, muted] = viewer ? await Promise.all([
    admin().from("follows").select("followee_id").eq("follower_id", viewer.id),
    admin().from("company_follows").select("company_id").eq("user_id", viewer.id),
    admin().from("mutes").select("muted_id").eq("muter_id", viewer.id),
  ]) : [{ data: [] }, { data: [] }, { data: [] }];
  const followsAuthors = new Set(((fa.data ?? []) as { followee_id: string }[]).map((r) => r.followee_id));
  const followsCompanies = new Set(((fc.data ?? []) as { company_id: string }[]).map((r) => r.company_id));
  const mutedIds = new Set(((muted.data ?? []) as { muted_id: string }[]).map((r) => r.muted_id));

  type Lite = { id: string; author_id: string; company_id: string; created_at: string; salary_min_lpa: number | null; days_waited: number | null; job_role: string | null; body_z: string };
  const cols = "id, author_id, company_id, created_at, salary_min_lpa, days_waited, job_role, body_z";
  const upto = new Date(anchor).toISOString();
  const recent = admin().from("stories").select(cols).eq("status", "published").lte("created_at", upto).gte("created_at", new Date(anchor - 21 * 86400_000).toISOString()).order("created_at", { ascending: false }).limit(500);
  const olderSince = new Date(anchor - 90 * 86400_000).toISOString();
  const [r1, r2, r3] = await Promise.all([
    recent,
    followsAuthors.size ? admin().from("stories").select(cols).eq("status", "published").in("author_id", [...followsAuthors].slice(0, 200)).gte("created_at", olderSince).lte("created_at", upto).limit(200) : Promise.resolve({ data: [] }),
    followsCompanies.size ? admin().from("stories").select(cols).eq("status", "published").in("company_id", [...followsCompanies].slice(0, 200)).gte("created_at", olderSince).lte("created_at", upto).limit(200) : Promise.resolve({ data: [] }),
  ]);
  const byId = new Map<string, Lite>();
  for (const r of [...((r1.data ?? []) as Lite[]), ...((r2.data ?? []) as Lite[]), ...((r3.data ?? []) as Lite[])]) if (!mutedIds.has(r.author_id)) byId.set(r.id, r);
  const lite = [...byId.values()];
  if (!lite.length) return { stories: [], nextCursor: null };

  const ids = lite.map((r) => r.id);
  const authors = [...new Set(lite.map((r) => r.author_id))];
  const [countsRes, authorRes] = await Promise.all([
    admin().from("story_counts").select("story_id, relatable, flags, comments").in("story_id", ids),
    admin().from("stories").select("author_id").eq("status", "published").in("author_id", authors.slice(0, 500)).limit(10000),
  ]);
  const counts = new Map(((countsRes.data ?? []) as { story_id: string; relatable: number; flags: number; comments: number }[]).map((r) => [r.story_id, r]));
  const perAuthor = new Map<string, number>();
  for (const r of (authorRes.data ?? []) as { author_id: string }[]) perAuthor.set(r.author_id, (perAuthor.get(r.author_id) ?? 0) + 1);
  const bodyLen = (z: string) => { try { return fromBytea(z).length; } catch { return 0; } };
  const cands: Candidate[] = lite.map((r) => ({
    id: r.id, authorId: r.author_id, companyId: r.company_id, createdAt: new Date(r.created_at).getTime(),
    relatable: counts.get(r.id)?.relatable ?? 0, flags: counts.get(r.id)?.flags ?? 0, comments: counts.get(r.id)?.comments ?? 0,
    bodyLength: bodyLen(r.body_z), hasSalary: r.salary_min_lpa != null, hasWait: r.days_waited != null, hasRole: !!r.job_role,
    authorStories: perAuthor.get(r.author_id) ?? 1,
  }));
  const ranked = rankFeed(cands, { id: viewer?.id ?? null, followsAuthors, followsCompanies }, anchor);
  const pageIds = ranked.slice(offset, offset + limit).map((r) => r.id);
  if (!pageIds.length) return { stories: [], nextCursor: null };
  const { data: full, error } = await publishedStories().in("id", pageIds);
  if (error) dbFail("for you", error);
  const order = new Map(pageIds.map((id, i) => [id, i]));
  const rows = ((full ?? []) as unknown as StoryRow[]).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const next = offset + limit < ranked.length ? `o${offset + limit}.${anchor}` : null;
  return { stories: await hydrate(rows, viewer), nextCursor: next };
}

// People pages live in routes/people.ts.
