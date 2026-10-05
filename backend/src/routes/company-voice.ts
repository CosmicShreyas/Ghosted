// Two ways for more voices to be heard on a company, without anyone being able to buy their way in.
//
// Ask candidates (Q&A), on company pages:
//   GET    /v1/voice/companies/:slug/questions        questions with their answers, best one first
//   POST   /v1/voice/companies/:slug/questions        ask (any member; 3 open questions a day)
//   POST   /v1/voice/questions/:id/answers            answer (only with a story about the company, or following it)
//   POST   /v1/voice/questions/:id/best               the asker pins one answer
//   DELETE /v1/voice/questions/:id, /answers/:id      remove your own
// Everyone is anonymous: askers show as "A member", answers only say whether the person shared a
// story here or follows the company. Every question and answer goes through the same automatic
// review as chitchats (held for a check, or refused).
//
// Right of Reply, free and limited on purpose:
//   POST /v1/voice/reps/start, /reps/verify            prove you work there: a code to a work email
//                                                      on the company's own domain (only the domain is kept)
//   GET  /v1/voice/reps/me                             the companies you can reply for
//   POST /v1/voice/companies/:slug/rep-reply           ONE official reply per story, plus one on the page
//   GET  /v1/voice/companies/:slug/rep-replies         the live replies for a company
// Reps cannot edit or delete a reply, hide or rank anything, or report their company's stories to
// get them removed (see the story report route). Only moderators remove replies.
//
// Removal and factual-error requests:
//   POST /v1/voice/requests                            anyone, signed in or not; we acknowledge
//                                                      within 24 hours and resolve within 15 days
import { Hono } from "hono";
import { z } from "zod";
import { ApiError, dbFail, notFound } from "../errors.js";
import { addNotification } from "../notify.js";
import { me, optionalAuth, rateLimit, requireAuth, type AppEnv } from "../security.js";
import { admin } from "../supabase.js";
import { bump, later } from "../live.js";
import { fromBytea, toBytea } from "../lib/compression.js";
import { publicId, text, validate } from "../validate.js";
import { moderationRecord, refuseIfBlocked, reviewContent } from "../moderation.js";
import { ensureCanPost } from "../goofy/index.js";
import { ensureOpen } from "../platform.js";
import { consumeCode, sendCode } from "../otp.js";
import { verifyChallenge } from "../captcha.js";
import { registrableDomain } from "../lib/site-check.js";
import { pushUrl, sendPush } from "../push.js";
import { impactFor, isActiveRep, setStatus, sharedFootprint, STATUSES, storyRefByPublicId } from "../impact.js";
import { award } from "../levels.js";
import { forgetShield, isEverRepOf } from "../rep-guard.js";
import { askCount, hrThemes, pulse } from "../demand.js";
import { floorCount } from "../lib/aggregate.js";
import { makePledge, pledgesFor, withdrawPledge } from "../pledges.js";
import { hit } from "../funnel.js";
import { changesLeft, CHANGES_PER_MONTH, citedStories, createChange, MAX_CITED } from "../changes.js";

const OPEN_QUESTIONS_PER_DAY = 3;
const DAY = 86400_000;
const slugParam = validate("param", z.object({ slug: z.string().regex(/^[a-z0-9-]{2,60}$/) }));
const idParam = validate("param", z.object({ id: publicId }));

// The table doesn't exist yet: Postgres "undefined table", or PostgREST's "not in the schema cache".
const missingTable = (e: { code?: string }) => e.code === "42P01" || e.code === "PGRST205";

type Company = { id: string; slug: string; name: string; domain: string | null };
async function companyBySlug(slug: string): Promise<Company> {
  const { data, error } = await admin().from("companies").select("id, slug, name, domain").eq("slug", slug).maybeSingle();
  if (error) dbFail("company", error);
  if (!data) throw notFound("Company");
  return data as Company;
}

// Can this member answer questions about this company? A published story about it wins over following.
async function answerBasis(userId: string, companyId: string): Promise<"story" | "follower" | null> {
  const [s, f] = await Promise.all([
    admin().from("stories").select("id", { count: "exact", head: true }).eq("author_id", userId).eq("company_id", companyId).eq("status", "published"),
    admin().from("company_follows").select("user_id", { count: "exact", head: true }).eq("user_id", userId).eq("company_id", companyId),
  ]);
  return (s.count ?? 0) > 0 ? "story" : (f.count ?? 0) > 0 ? "follower" : null;
}

async function activeRep(userId: string, companyId: string) {
  const { data } = await admin().from("company_reps").select("email_domain").eq("user_id", userId).eq("company_id", companyId).is("revoked_at", null).maybeSingle();
  return data as { email_domain: string } | null;
}

// Everyone with a story about the company, plus its followers, hears about a new question (once).
async function notifyQuestion(company: Company, askerId: string, body: string) {
  try {
    const [stories, follows] = await Promise.all([
      admin().from("stories").select("author_id").eq("company_id", company.id).eq("status", "published").limit(2000),
      admin().from("company_follows").select("user_id").eq("company_id", company.id).limit(3000),
    ]);
    const ids = new Set<string>([...(stories.data ?? []).map((r) => r.author_id as string), ...(follows.data ?? []).map((r) => r.user_id as string)]);
    ids.delete(askerId);
    const line = `Someone asked about ${company.name}: “${body.length > 90 ? `${body.slice(0, 89)}…` : body}” You can answer anonymously.`;
    for (const id of [...ids].slice(0, 2000)) {
      const { error } = await admin().from("notifications").insert({ user_id: id, kind: "company", body: line.slice(0, 300), company_slug: company.slug });
      if (error) return;
      await bump({ user: id, topics: ["notifications"] });
      void sendPush(id, { kind: "company", body: line.slice(0, 180), url: pushUrl({ companySlug: company.slug }) });
    }
  } catch (e) { console.error("[qa] notify", (e as Error).message); }
}

type QRow = { id: string; public_id: number; author_id: string; body_z: string; best_answer_id: string | null; created_at: string };
type ARow = { id: string; public_id: number; question_id: string; author_id: string; body_z: string; basis: "story" | "follower"; created_at: string };

const requestBody = z.object({
  kind: z.enum(["removal", "factual_error"]),
  targetUrl: z.string().trim().url().max(500),
  email: z.string().trim().toLowerCase().email().max(254),
  relationship: z.enum(["author", "company", "subject", "other"]),
  details: z.string().trim().min(20).max(3000),
  captchaToken: z.string().max(4000).optional(),
}).strict();

export const voiceRoutes = new Hono<AppEnv>()

  // ---------- Ask candidates ----------

  .get("/companies/:slug/questions", optionalAuth, rateLimit({ name: "qa-list", max: 120, windowSeconds: 60 }), slugParam, async (c) => {
    const co = await companyBySlug(c.req.valid("param").slug);
    const viewer = c.get("profile");
    const { data: qs, error } = await admin().from("company_questions").select("id, public_id, author_id, body_z, best_answer_id, created_at").eq("company_id", co.id).eq("status", "published").order("created_at", { ascending: false }).limit(50);
    // Tables not created yet (SQL not run): an empty section, not a 500 on every company page.
    // A read that fails (most often: the SQL section hasn't been run yet) shows an empty section
    // instead of a 500 on every company page. The real error is logged.
    if (error) { console.error(`[qa] questions${missingTable(error) ? " (run the Ask candidates section of init_database.sql)" : ""}:`, error.code, error.message); return c.json({ canAsk: false, canAnswer: false, questionsLeftToday: 0, questions: [] }); }
    const questions = (qs ?? []) as QRow[];
    const [ans, basis] = await Promise.all([
      questions.length ? admin().from("company_answers").select("id, public_id, question_id, author_id, body_z, basis, created_at").in("question_id", questions.map((q) => q.id)).eq("status", "published").order("created_at").limit(1000) : Promise.resolve({ data: [], error: null }),
      viewer ? answerBasis(viewer.id, co.id) : Promise.resolve(null),
    ]);
    if (ans.error) console.error("[qa] answers:", ans.error.code, ans.error.message); // questions still show, without answers
    const byQ = new Map<string, ARow[]>();
    for (const a of (ans.data ?? []) as ARow[]) byQ.set(a.question_id, [...(byQ.get(a.question_id) ?? []), a]);
    let openToday = 0;
    if (viewer) {
      const { count } = await admin().from("company_questions").select("id", { count: "exact", head: true }).eq("author_id", viewer.id).neq("status", "removed").gte("created_at", new Date(Date.now() - DAY).toISOString());
      openToday = count ?? 0;
    }
    return c.json({
      canAsk: !!viewer, canAnswer: !!basis, questionsLeftToday: viewer ? Math.max(0, OPEN_QUESTIONS_PER_DAY - openToday) : 0,
      questions: questions.map((q) => {
        const list = (byQ.get(q.id) ?? []).map((a) => ({ publicId: String(a.public_id), body: fromBytea(a.body_z), basis: a.basis, createdAt: a.created_at, mine: a.author_id === viewer?.id, best: a.id === q.best_answer_id }));
        // The pinned best answer always comes first.
        list.sort((x, y) => Number(y.best) - Number(x.best));
        return { publicId: String(q.public_id), body: fromBytea(q.body_z), createdAt: q.created_at, mine: q.author_id === viewer?.id, answers: list };
      }),
    });
  })

  .post("/companies/:slug/questions", requireAuth, rateLimit({ name: "qa-ask", max: 10, windowSeconds: 3600, by: "user" }), slugParam, validate("json", z.object({ body: text(10, 500) }).strict()), async (c) => {
    await ensureOpen("chitchatsOpen");
    ensureCanPost(me(c));
    const co = await companyBySlug(c.req.valid("param").slug);
    const { count } = await admin().from("company_questions").select("id", { count: "exact", head: true }).eq("author_id", me(c).id).neq("status", "removed").gte("created_at", new Date(Date.now() - DAY).toISOString());
    if ((count ?? 0) >= OPEN_QUESTIONS_PER_DAY) throw new ApiError(429, "question_limit", `You can ask ${OPEN_QUESTIONS_PER_DAY} questions a day. Come back tomorrow, or read the answers so far.`);
    const { body } = c.req.valid("json");
    const review = await reviewContent(me(c), "chitchat", body, co.name);
    refuseIfBlocked(review);
    const held = review.decision === "review";
    const { data, error } = await admin().from("company_questions").insert({ company_id: co.id, author_id: me(c).id, body_z: toBytea(body), status: held ? "pending" : "published", moderation: moderationRecord(review) }).select("public_id").single();
    if (error) dbFail("ask question", error);
    if (held) return c.json({ pending: true, message: "Saved. Your question appears after a quick check." }, 202);
    later(notifyQuestion(co, me(c).id, body));
    later(bump({ shared: [`company:${co.slug}`] }));
    return c.json({ publicId: String((data as { public_id: number }).public_id) }, 201);
  })

  .post("/questions/:id/answers", requireAuth, rateLimit({ name: "qa-answer", max: 30, windowSeconds: 3600, by: "user" }), idParam, validate("json", z.object({ body: text(5, 1000) }).strict()), async (c) => {
    await ensureOpen("chitchatsOpen");
    ensureCanPost(me(c));
    const { data: q, error: qe } = await admin().from("company_questions").select("id, author_id, body_z, company:companies(id, slug, name)").eq("public_id", c.req.valid("param").id).eq("status", "published").maybeSingle();
    if (qe) dbFail("question", qe);
    if (!q) throw notFound("Question");
    const co = (q as unknown as { company: { id: string; slug: string; name: string } }).company;
    const basis = await answerBasis(me(c).id, co.id);
    if (!basis) throw new ApiError(403, "cannot_answer", `Only people who shared a story about ${co.name}, or follow it, can answer. Follow it to join in.`);
    const { body } = c.req.valid("json");
    const review = await reviewContent(me(c), "chitchat", body, co.name);
    refuseIfBlocked(review);
    const held = review.decision === "review";
    const { error } = await admin().from("company_answers").insert({ question_id: (q as { id: string }).id, author_id: me(c).id, body_z: toBytea(body), basis, status: held ? "pending" : "published", moderation: moderationRecord(review) });
    if (error) dbFail("answer", error);
    if (held) return c.json({ pending: true, message: "Saved. Your answer appears after a quick check." }, 202);
    const askerId = (q as { author_id: string }).author_id;
    if (askerId !== me(c).id) later((async () => {
      await admin().from("notifications").insert({ user_id: askerId, kind: "reply", body: `Your question about ${co.name} got an answer. Pin the most helpful one.`, company_slug: co.slug });
      await bump({ user: askerId, topics: ["notifications"] });
      await sendPush(askerId, { kind: "reply", body: `Your question about ${co.name} got an answer. Pin the most helpful one.`, url: pushUrl({ companySlug: co.slug }) });
    })());
    later(bump({ shared: [`company:${co.slug}`] }));
    return c.json({ ok: true }, 201);
  })

  .post("/questions/:id/best", requireAuth, rateLimit({ name: "qa-best", max: 60, windowSeconds: 3600, by: "user" }), idParam, validate("json", z.object({ answerId: publicId.nullable() }).strict()), async (c) => {
    const { data: q } = await admin().from("company_questions").select("id, author_id, company:companies(slug)").eq("public_id", c.req.valid("param").id).maybeSingle();
    if (!q) throw notFound("Question");
    if ((q as { author_id: string }).author_id !== me(c).id) throw new ApiError(403, "not_yours", "Only the person who asked can pin an answer.");
    let answerUuid: string | null = null;
    const aid = c.req.valid("json").answerId;
    if (aid) {
      const { data: a } = await admin().from("company_answers").select("id").eq("public_id", aid).eq("question_id", (q as { id: string }).id).eq("status", "published").maybeSingle();
      if (!a) throw notFound("Answer");
      answerUuid = (a as { id: string }).id;
    }
    const { error } = await admin().from("company_questions").update({ best_answer_id: answerUuid }).eq("id", (q as { id: string }).id);
    if (error) dbFail("pin answer", error);
    later(bump({ shared: [`company:${(q as unknown as { company: { slug: string } }).company.slug}`] }));
    return c.json({ ok: true });
  })

  .delete("/questions/:id", requireAuth, rateLimit({ name: "qa-delete", max: 60, windowSeconds: 3600, by: "user" }), idParam, async (c) => {
    const { data, error } = await admin().from("company_questions").update({ status: "removed" }).eq("public_id", c.req.valid("param").id).eq("author_id", me(c).id).select("id");
    if (error) dbFail("delete question", error);
    if (!data?.length) throw notFound("Question");
    return c.json({ ok: true });
  })

  .delete("/answers/:id", requireAuth, rateLimit({ name: "qa-delete", max: 60, windowSeconds: 3600, by: "user" }), idParam, async (c) => {
    const { data, error } = await admin().from("company_answers").update({ status: "removed" }).eq("public_id", c.req.valid("param").id).eq("author_id", me(c).id).select("id");
    if (error) dbFail("delete answer", error);
    if (!data?.length) throw notFound("Answer");
    return c.json({ ok: true });
  })

  // ---------- Right of Reply ----------

  .post("/reps/start", requireAuth, rateLimit({ name: "rep-start", max: 6, windowSeconds: 3600, by: "user" }), validate("json", z.object({ companySlug: z.string().regex(/^[a-z0-9-]{2,60}$/), email: z.string().trim().toLowerCase().email().max(254) }).strict()), async (c) => {
    const { companySlug, email } = c.req.valid("json");
    const co = await companyBySlug(companySlug);
    if (!co.domain) throw new ApiError(422, "no_domain", `${co.name} has no website on file, so we can't check a work email for it yet. Contact support.`);
    const host = email.split("@")[1] ?? "";
    // The work email must be on the company's own domain (or a subdomain of it). Free mail never matches.
    if (registrableDomain(host) !== co.domain) throw new ApiError(422, "wrong_domain", `Use your work email at ${co.domain}. Personal addresses can't be verified.`, { email: `Must end in @${co.domain}` });
    if (await activeRep(me(c).id, co.id)) return c.json({ alreadyVerified: true });
    await sendCode("rep", email, undefined, me(c).tone ?? "sassy", me(c).email_theme ?? "light");
    later(hit("rep_start"));
    return c.json({ sent: true, domain: co.domain });
  })

  .post("/reps/verify", requireAuth, rateLimit({ name: "rep-verify", max: 20, windowSeconds: 3600, by: "user" }), validate("json", z.object({ companySlug: z.string().regex(/^[a-z0-9-]{2,60}$/), email: z.string().trim().toLowerCase().email().max(254), code: z.string().regex(/^\d{6}$/) }).strict()), async (c) => {
    const { companySlug, email, code } = c.req.valid("json");
    const co = await companyBySlug(companySlug);
    if (!co.domain || registrableDomain(email.split("@")[1] ?? "") !== co.domain) throw new ApiError(422, "wrong_domain", "That email isn't on the company's domain.");
    await consumeCode("rep", email, code);
    // Only the domain is kept: we never store the work email itself.
    const { error } = await admin().from("company_reps").upsert({ user_id: me(c).id, company_id: co.id, email_domain: co.domain, verified_at: new Date().toISOString(), revoked_at: null }, { onConflict: "user_id,company_id" });
    if (error) dbFail("verify rep (run the Ask candidates section of init_database.sql)", error);
    forgetShield(me(c).id); // from now on, this account can't reach the company's authors
    later(hit("rep_verified"));
    later(bump({ user: me(c).id, topics: ["me"] }));
    return c.json({ verified: true, company: { slug: co.slug, name: co.name } });
  })

  .get("/reps/me", requireAuth, rateLimit({ name: "rep-me", max: 120, windowSeconds: 60 }), async (c) => {
    const { data, error } = await admin().from("company_reps").select("verified_at, company:companies(slug, name)").eq("user_id", me(c).id).is("revoked_at", null);
    if (error) dbFail("my rep companies", error);
    return c.json({ companies: ((data ?? []) as unknown as { verified_at: string; company: { slug: string; name: string } }[]).map((r) => ({ ...r.company, verifiedAt: r.verified_at })) });
  })

  .get("/companies/:slug/rep-replies", optionalAuth, rateLimit({ name: "rep-replies", max: 180, windowSeconds: 60 }), slugParam, async (c) => {
    const co = await companyBySlug(c.req.valid("param").slug);
    const viewer = c.get("profile");
    const [rows, rep] = await Promise.all([
      admin().from("rep_replies").select("public_id, body_z, created_at, story:stories(public_id)").eq("company_id", co.id).eq("status", "published").limit(500),
      viewer ? activeRep(viewer.id, co.id) : Promise.resolve(null),
    ]);
    // Same as questions: a failed read is an empty reply slot, never a 500 on the page.
    if (rows.error) { console.error(`[rep] replies${missingTable(rows.error) ? " (run the Ask candidates section of init_database.sql)" : ""}:`, rows.error.code, rows.error.message); return c.json({ company: { name: co.name, domain: co.domain }, viewerIsRep: false, replies: [] }); }
    const list = ((rows.data ?? []) as unknown as { public_id: number; body_z: string; created_at: string; story: { public_id: number } | null }[])
      .map((r) => ({ publicId: String(r.public_id), body: fromBytea(r.body_z), createdAt: r.created_at, storyPublicId: r.story ? String(r.story.public_id) : null }));
    return c.json({ company: { name: co.name, domain: co.domain }, viewerIsRep: !!rep, replies: list });
  })

  .post("/companies/:slug/rep-reply", requireAuth, rateLimit({ name: "rep-reply", max: 20, windowSeconds: 3600, by: "user" }), slugParam, validate("json", z.object({ storyPublicId: publicId.optional(), body: text(20, 1500) }).strict()), async (c) => {
    const co = await companyBySlug(c.req.valid("param").slug);
    if (!(await activeRep(me(c).id, co.id))) throw new ApiError(403, "not_rep", `Only verified representatives of ${co.name} can post its reply.`);
    ensureCanPost(me(c));
    const { storyPublicId, body } = c.req.valid("json");
    let storyId: string | null = null, storyAuthorId: string | null = null, storyPid: number | null = null;
    if (storyPublicId) {
      const { data: s } = await admin().from("stories").select("id, author_id, public_id").eq("public_id", storyPublicId).eq("company_id", co.id).eq("status", "published").maybeSingle();
      if (!s) throw new ApiError(404, "story_not_found", `That story isn't about ${co.name}.`);
      ({ id: storyId, author_id: storyAuthorId, public_id: storyPid } = s as { id: string; author_id: string; public_id: number });
    }
    // The same automatic review as everyone else: refused if it breaks the rules, held if unsure.
    const review = await reviewContent(me(c), "chitchat", body, co.name);
    refuseIfBlocked(review);
    const held = review.decision === "review";
    const { error } = await admin().from("rep_replies").insert({ company_id: co.id, story_id: storyId, author_id: me(c).id, body_z: toBytea(body), status: held ? "pending" : "published", moderation: moderationRecord(review) });
    if (error?.code === "23505") throw new ApiError(409, "already_replied", storyId ? `${co.name} has already replied to this story. Replies can't be edited or replaced.` : `${co.name} already has its reply on the company page.`);
    if (error) dbFail("rep reply", error);
    if (held) return c.json({ pending: true, message: "Saved. The reply appears after a quick check by our moderators." }, 202);
    if (storyAuthorId && storyPid) {
      later(addNotification(storyAuthorId, "rep_update", `${co.name} posted its official reply to your story.`, storyPid));
      // An official reply is a response too: the same once-per-story impact XP as a status.
      const repId = me(c).id, author = storyAuthorId, sid = storyId!;
      later((async () => { if (!(await sharedFootprint(repId, author))) award(author, "impact", `resp:${sid}`); })());
    }
    later(bump({ shared: [`company:${co.slug}`, ...(storyPublicId ? [`story:${storyPublicId}`] : [])] }));
    return c.json({ ok: true }, 201);
  })

  // ---------- The impact ladder (impact.ts) ----------

  // A story's ladder: how many at the company saw it (a count, never who), the steps a rep set, and
  // whether there's an official reply. Public, like the reply itself. `viewerIsRep`: the buttons.
  .get("/stories/:id/impact", optionalAuth, rateLimit({ name: "impact", max: 240, windowSeconds: 60 }), idParam, async (c) => {
    const s = await storyRefByPublicId(c.req.valid("param").id);
    const viewer = c.get("profile");
    try {
      const [map, rep] = await Promise.all([impactFor([s.id], fromBytea), viewer ? isActiveRep(viewer.id, s.company_id) : Promise.resolve(false)]);
      return c.json({ company: s.company, impact: map.get(s.id), viewerIsRep: rep && viewer?.id !== s.author_id });
    } catch (e) {
      console.error("[impact] read (run the Impact ladder section of init_database.sql)", (e as Error).message);
      return c.json({ company: s.company, impact: { repViews: 0, firstSeenAt: null, steps: [], replied: false, cited: [] }, viewerIsRep: false });
    }
  })

  // A rep's one-tap response: heard → looking_into_it → fixed, forward only, each once, never edited.
  .post("/stories/:id/status", requireAuth, rateLimit({ name: "impact-status", max: 40, windowSeconds: 3600, by: "user" }), idParam, validate("json", z.object({ status: z.enum(STATUSES), note: z.string().trim().min(2).max(280).optional() }).strict()), async (c) => {
    const s = await storyRefByPublicId(c.req.valid("param").id);
    ensureCanPost(me(c));
    const { status, note } = c.req.valid("json");
    let reviewed: { body_z: string; held: boolean; moderation: unknown } | null = null;
    if (note) {
      const review = await reviewContent(me(c), "chitchat", note, s.company?.name);
      refuseIfBlocked(review, "note");
      reviewed = { body_z: toBytea(note), held: review.decision === "review", moderation: moderationRecord(review) };
    }
    await setStatus(me(c).id, s, status, reviewed);
    return c.json({ ok: true, notePending: !!reviewed?.held }, 201);
  })

  // Your own stories' ladders, for My Stories (keyed by story public id).
  .get("/me/impact", requireAuth, rateLimit({ name: "my-impact", max: 120, windowSeconds: 60 }), async (c) => {
    const { data } = await admin().from("stories").select("id, public_id").eq("author_id", me(c).id).eq("status", "published").limit(500);
    const rows = (data ?? []) as { id: string; public_id: number }[];
    try {
      const map = await impactFor(rows.map((r) => r.id), fromBytea);
      return c.json({ impact: Object.fromEntries(rows.map((r) => [String(r.public_id), map.get(r.id)])) });
    } catch { return c.json({ impact: {} }); }
  })

  // ---------- "You said, we did" (changes.ts) ----------

  // The company's live change notes, newest first, each with the stories it cites (title only).
  .get("/companies/:slug/changes", optionalAuth, rateLimit({ name: "changes", max: 180, windowSeconds: 60 }), slugParam, async (c) => {
    const co = await companyBySlug(c.req.valid("param").slug);
    const viewer = c.get("profile");
    const rep = viewer ? await activeRep(viewer.id, co.id) : null;
    const { data, error } = await admin().from("company_changes").select("public_id, body_z, created_at, cites:company_change_stories(story:stories(public_id, title, status))").eq("company_id", co.id).eq("status", "published").order("created_at", { ascending: false }).limit(60);
    if (error) { console.error(`[changes] list${missingTable(error) ? " (run the You said, we did section of init_database.sql)" : ""}:`, error.message); return c.json({ changes: [], viewerIsRep: false, leftThisMonth: 0 }); }
    type Row = { public_id: number; body_z: string; created_at: string; cites: { story: { public_id: number; title: string; status: string } | null }[] };
    return c.json({
      viewerIsRep: !!rep, leftThisMonth: rep ? await changesLeft(viewer!.id) : 0, perMonth: CHANGES_PER_MONTH, maxCited: MAX_CITED,
      changes: ((data ?? []) as unknown as Row[]).map((r) => ({
        publicId: String(r.public_id), body: fromBytea(r.body_z), createdAt: r.created_at,
        stories: r.cites.map((x) => x.story).filter((s): s is NonNullable<typeof s> => !!s && s.status === "published").map((s) => ({ publicId: String(s.public_id), title: s.title })),
      })),
    });
  })

  .post("/companies/:slug/changes", requireAuth, rateLimit({ name: "change-post", max: 10, windowSeconds: 3600, by: "user" }), slugParam, validate("json", z.object({ body: text(30, 800), storyPublicIds: z.array(publicId).min(1).max(MAX_CITED) }).strict()), async (c) => {
    const co = await companyBySlug(c.req.valid("param").slug);
    if (!(await activeRep(me(c).id, co.id))) throw new ApiError(403, "not_rep", `Only verified representatives of ${co.name} can post a change note.`);
    ensureCanPost(me(c));
    if ((await changesLeft(me(c).id)) <= 0) throw new ApiError(429, "change_limit", `You've posted ${CHANGES_PER_MONTH} change notes this month, the limit. Make the next one count.`);
    const { body, storyPublicIds } = c.req.valid("json");
    const stories = await citedStories(co.id, storyPublicIds);
    const review = await reviewContent(me(c), "chitchat", body, co.name);
    refuseIfBlocked(review);
    const held = review.decision === "review";
    await createChange(me(c).id, co, toBytea(body), held, moderationRecord(review), stories);
    if (held) return c.json({ pending: true, message: "Saved. The note appears after a quick check by our moderators." }, 202);
    return c.json({ ok: true }, 201);
  })

  // ---------- Demand and the HR front door (demand.ts) ----------

  // "N candidates asked {company} to respond" (only from 3), and whether you did. Reps see the same.
  .get("/companies/:slug/demand", optionalAuth, rateLimit({ name: "demand", max: 180, windowSeconds: 60 }), slugParam, async (c) => {
    const co = await companyBySlug(c.req.valid("param").slug);
    const viewer = c.get("profile");
    const [n, mine, rep] = await Promise.all([
      askCount(co.id),
      viewer ? admin().from("response_requests").select("user_id", { count: "exact", head: true }).eq("company_id", co.id).eq("user_id", viewer.id) : Promise.resolve({ count: 0 }),
      viewer ? activeRep(viewer.id, co.id) : Promise.resolve(null),
    ]);
    return c.json({ count: floorCount(n), asked: (mine.count ?? 0) > 0, viewerIsRep: !!rep });
  })

  // One tap, one per member per company; a company's own reps (now or before) can't ask.
  .post("/companies/:slug/ask-response", requireAuth, rateLimit({ name: "ask-response", max: 30, windowSeconds: 3600, by: "user" }), slugParam, async (c) => {
    const co = await companyBySlug(c.req.valid("param").slug);
    if (await isEverRepOf(me(c).id, co.id)) throw new ApiError(403, "rep_conflict", "You represent this company, so you can't ask it to respond.");
    const { error } = await admin().from("response_requests").upsert({ company_id: co.id, user_id: me(c).id }, { onConflict: "company_id,user_id", ignoreDuplicates: true });
    if (error) dbFail("ask to respond (run the Demand section of init_database.sql)", error);
    later(hit("ask_response"));
    later(bump({ shared: [`company:${co.slug}`] }));
    return c.json({ asked: true, count: floorCount(await askCount(co.id)) });
  })
  .delete("/companies/:slug/ask-response", requireAuth, rateLimit({ name: "ask-response", max: 30, windowSeconds: 3600, by: "user" }), slugParam, async (c) => {
    const co = await companyBySlug(c.req.valid("param").slug);
    await admin().from("response_requests").delete().eq("company_id", co.id).eq("user_id", me(c).id);
    later(bump({ shared: [`company:${co.slug}`] }));
    return c.json({ asked: false, count: floorCount(await askCount(co.id)) });
  })

  // /for-hr?company=slug, public and signed out: who the company is, how many asked, and stage /
  // outcome counts. Never story text, never authors.
  .get("/hr/:slug", rateLimit({ name: "hr-page", max: 120, windowSeconds: 60 }), slugParam, async (c) => {
    const co = await companyBySlug(c.req.valid("param").slug);
    c.header("Cache-Control", "public, max-age=120");
    return c.json({ company: { slug: co.slug, name: co.name, domain: co.domain }, ...(await hrThemes(co.id)) });
  })

  // Company Pulse: aggregates for the company's verified reps only.
  .get("/companies/:slug/pulse", requireAuth, rateLimit({ name: "pulse", max: 60, windowSeconds: 60, by: "user" }), slugParam, async (c) => {
    const co = await companyBySlug(c.req.valid("param").slug);
    if (!(await activeRep(me(c).id, co.id))) throw new ApiError(403, "not_rep", `Company Pulse is only for verified representatives of ${co.name}.`);
    return c.json({ company: { slug: co.slug, name: co.name }, ...(await pulse(co.id)) });
  })

  // ---------- Reply pledges (pledges.ts, lib/pledge.ts) ----------

  .get("/companies/:slug/pledge", optionalAuth, rateLimit({ name: "pledge", max: 180, windowSeconds: 60 }), slugParam, async (c) => {
    const co = await companyBySlug(c.req.valid("param").slug);
    const viewer = c.get("profile");
    const [map, rep] = await Promise.all([pledgesFor([co.id]), viewer ? activeRep(viewer.id, co.id) : Promise.resolve(null)]);
    return c.json({ pledge: map.get(co.id) ?? null, viewerIsRep: !!rep });
  })
  .post("/companies/:slug/pledge", requireAuth, rateLimit({ name: "pledge-make", max: 5, windowSeconds: 86400, by: "user" }), slugParam, validate("json", z.object({ days: z.union([z.literal(7), z.literal(14), z.literal(30)]) }).strict()), async (c) => {
    const co = await companyBySlug(c.req.valid("param").slug);
    if (!(await activeRep(me(c).id, co.id))) throw new ApiError(403, "not_rep", `Only verified representatives of ${co.name} can make its pledge.`);
    await makePledge(me(c).id, co, c.req.valid("json").days);
    later(hit("pledge_made"));
    return c.json({ ok: true }, 201);
  })
  .post("/companies/:slug/pledge/withdraw", requireAuth, rateLimit({ name: "pledge-withdraw", max: 5, windowSeconds: 3600, by: "user" }), slugParam, async (c) => {
    const co = await companyBySlug(c.req.valid("param").slug);
    if (!(await activeRep(me(c).id, co.id))) throw new ApiError(403, "not_rep", `Only verified representatives of ${co.name} can withdraw its pledge.`);
    await withdrawPledge(co.id, co.slug, "rep");
    return c.json({ ok: true });
  })

  // ---------- Removal and factual-error requests ----------

  .post("/requests", optionalAuth, rateLimit({ name: "content-request", max: 5, windowSeconds: 3600 }), validate("json", requestBody), async (c) => {
    const b = c.req.valid("json");
    const viewer = c.get("profile");
    if (!viewer) await verifyChallenge(c, b.captchaToken);
    const url = new URL(b.targetUrl);
    const { data, error } = await admin().from("content_requests").insert({ kind: b.kind, target_url: url.toString(), requester_id: viewer?.id ?? null, email: b.email, relationship: b.relationship, details: b.details }).select("public_id").single();
    if (error) dbFail("content request (run the Ask candidates section of init_database.sql)", error);
    return c.json({ reference: String((data as { public_id: number }).public_id), acknowledgeHours: 24, resolveDays: 15 }, 201);
  });
