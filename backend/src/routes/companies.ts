import { Hono } from "hono";
import { z } from "zod";
import { dbFail, notFound } from "../errors.js";
import { companyDto, type CompanyScoreRow, type StoryRow } from "../dto.js";
import { hydrate, publishedStories } from "../stories.js";
import { ipKey, limitBy, me, optionalAuth, rateLimit, requireAuth, type AppEnv, type Profile } from "../security.js";
import { addNotification } from "../notify.js";
import { admin } from "../supabase.js";
import { clean } from "../security.js";
import { optionalText, validate } from "../validate.js";
import { ApiError } from "../errors.js";
import { verifyChallenge } from "../captcha.js";
import { bump, later } from "../live.js";
import { fetchImage, inspectWebsite, nameMatchesSite, registrableDomain, SiteCheckError } from "../lib/site-check.js";
import { gatherFacts } from "../lib/company-facts.js";
import { reviewText } from "../algorithms/index.js";
import { reportAs } from "../goofy/index.js";
import { goofyControls } from "../platform.js";
import { waitingCount } from "../interest.js";
import { award } from "../levels.js";

const COLORS = ["bg-logo-violet", "bg-logo-coral", "bg-logo-blue", "bg-logo-green", "bg-logo-pink", "bg-logo-amber", "bg-logo-red"];
const slugify = (name: string) => name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const MIN_ACCOUNT_AGE_MINUTES = 60;
// Logos fetched from company sites, kept in this instance's memory for a few hours (the CDN keeps
// them far longer). Bounded, oldest out first.
const LOGO_TTL = 6 * 3600_000;
const logoCache = new Map<string, { type: string; body: Buffer | Uint8Array; at: number }>();

const slugParam = validate("param", z.object({ slug: z.string().regex(/^[a-z0-9-]{2,60}$/) }));
const POSITIVE = 3.6, CRITICAL = 2.4; // average stars: at or above = positive, at or below = critical

// ---------- what a listing must look like ----------

const LINKISH = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|in|io|co|net|org|ai|app)\b)/i;
const CONTACT = /([\w.+-]+@[\w-]+\.[\w.]+|(\+?\d[\d\s-]{8,}\d))/;
const lettersShare = (s: string) => (s.match(/\p{L}/gu)?.length ?? 0) / Math.max(1, s.replace(/\s/g, "").length);

const companyName = z.string().transform(clean).pipe(z.string()
  .min(2, "Use the company's full name").max(80, "Keep the name under 80 characters")
  .refine((s) => /\p{L}/u.test(s), "The name needs letters")
  .refine((s) => lettersShare(s) >= 0.6, "That doesn't look like a company name")
  .refine((s) => !LINKISH.test(s) && !CONTACT.test(s), "Just the name, without links or contact details")
  .refine((s) => !/(.)\1{3,}/i.test(s), "That doesn't look like a company name")
  .refine((s) => s.length <= 6 || s !== s.toUpperCase(), "Write the name in normal case, not ALL CAPS"));

const about = z.string().transform(clean).pipe(z.string()
  .min(80, "Write at least 80 characters about what the company does").max(800, "Keep it under 800 characters")
  .refine((s) => s.split(/\s+/).filter((w) => w.length > 1).length >= 12, "Use at least a couple of full sentences")
  .refine((s) => !LINKISH.test(s), "No links in the description (the website goes in its own field)")
  .refine((s) => !CONTACT.test(s), "No email addresses or phone numbers, please")
  .refine((s) => lettersShare(s) >= 0.7, "Describe the company in words")
  .refine((s) => !/(.)\1{5,}/.test(s) && new Set(s.toLowerCase().split(/\s+/)).size >= 8, "That looks repetitive. Describe what the company actually does")
  .refine((s) => (s.match(/\p{Lu}/gu)?.length ?? 0) / Math.max(1, s.match(/\p{L}/gu)?.length ?? 1) < 0.5, "Please don't write in ALL CAPS"));

const INDUSTRIES = ["software", "it_services", "fintech", "ecommerce", "edtech", "healthtech", "media", "consulting", "manufacturing", "bfsi", "telecom", "gaming", "logistics", "other"] as const;
const SIZES = ["1-10", "11-50", "51-200", "201-1000", "1001-5000", "5000+"] as const;
const year = new Date().getFullYear();

const newCompany = z.object({
  name: companyName,
  website: z.string().trim().min(3, "Enter the company's website").max(200),
  about,
  industry: z.enum(INDUSTRIES, { error: "Pick an industry" }),
  size: z.enum(SIZES, { error: "Pick a size" }),
  hqCity: z.string().transform(clean).pipe(z.string().min(2, "Where is it headquartered?").max(60).refine((s) => /^[\p{L} .'-]+$/u.test(s), "Just the city name")),
  founded: z.number().int().min(1800, "That's a bit early").max(year, "That's in the future").optional(),
  careersUrl: z.string().trim().url("Use a full https:// link").max(300).refine((u) => u.startsWith("https://"), "Use an https:// link").optional(),
  // They must confirm they're describing a real company, accurately and in good faith.
  confirm: z.literal(true, { error: "Please confirm the details are accurate" }),
  captchaToken: z.string().max(12000).optional(),
}).strict();

export const companyRoutes = new Hono<AppEnv>()
  .get("/", rateLimit({ name: "companies", max: 180, windowSeconds: 60 }), validate("query", z.object({
    sort: z.enum(["score", "worst", "stories", "recent", "az"]).default("stories"),
    q: z.string().trim().max(60).optional(),
    // Up to 500 at once, so the full company index (pickers, logos on stories) loads in one request.
    limit: z.coerce.number().int().min(1).max(500).default(20),
    // Pages for endless scrolling: pass back `nextOffset` from the previous page.
    offset: z.coerce.number().int().min(0).max(10_000).default(0),
    // all=1: include companies with no stories yet (the "share a story" picker, the Companies page).
    all: z.enum(["0", "1"]).optional(),
  })), async (c) => {
    const { sort, q, limit, offset, all } = c.req.valid("query");
    let query = admin().from("company_scores").select("*").range(offset, offset + limit);
    // Search covers all companies (for the "share a story" picker); lists only show rated ones.
    if (q) query = query.ilike("name", `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`);
    else if (all !== "1") query = query.gt("story_count", 0);
    if (sort === "score") query = query.order("flag_score", { ascending: false, nullsFirst: false });
    if (sort === "worst") query = query.order("flag_score", { ascending: true, nullsFirst: false });
    if (sort === "stories") query = query.order("story_count", { ascending: false });
    if (sort === "recent") query = query.order("last_story_at", { ascending: false, nullsFirst: false });
    // A stable tie-break (and the A–Z order), so pages never repeat or skip a company.
    query = query.order("name", { ascending: true }).order("slug", { ascending: true });
    const { data, error } = await query;
    if (error) dbFail("list companies", error);
    const rows = (data ?? []) as CompanyScoreRow[];
    c.header("Cache-Control", "public, max-age=60, s-maxage=60");
    // One extra row was asked for, only to learn whether another page exists.
    return c.json({ companies: rows.slice(0, limit).map(companyDto), nextOffset: rows.length > limit ? offset + limit : null });
  })

  // Step 1 of "List a company": check the website, and gather what we can find about the company
  // (its own site, then Wikidata) to fill the form in. Also says if it's already listed, so people
  // add stories there instead of a duplicate. Registered before "/:slug", or that route would treat
  // "preview" as a company name and answer "Company not found".
  // Signed out works too ("Request it" from a search), so people can see what they'd list before
  // joining; those checks are limited per connection, and there's no quota to report.
  .get("/preview", optionalAuth, rateLimit({ name: "company-preview", max: 30, windowSeconds: 600, by: "user" }), validate("query", z.object({ website: z.string().trim().min(3).max(200) })), async (c) => {
    const viewer = c.get("profile");
    if (!viewer) await limitBy(`company-preview-anon:${ipKey(c)}`, 12, 600, "Too many website checks. Sign in to keep going, or try again in a few minutes.");
    try {
      const site = await inspectWebsite(c.req.valid("query").website);
      const [existing, facts, quota] = await Promise.all([byDomain(site.domain), gatherFacts(site), viewer ? listingQuota(viewer.id) : Promise.resolve(null)]);
      return c.json({ site, existing: existing ? companyDto(existing) : null, facts, quota });
    } catch (err) {
      if (err instanceof SiteCheckError) throw new ApiError(422, "website_invalid", err.message, { website: err.message });
      throw err;
    }
  })

  // A company's page: the listing, its numbers (including the positive vs critical split), the
  // best and worst experiences, your follow/bell state, and the first page of stories.
  .get("/:slug", optionalAuth, rateLimit({ name: "company", max: 180, windowSeconds: 60 }), slugParam, async (c) => {
    const { row, id } = await companyBySlug(c.req.valid("param").slug);
    const viewer = c.get("profile");
    const [stats, first, rel, waiting, mine] = await Promise.all([
      companyStats(id, viewer),
      companyStories(id, viewer, { limit: 10 }),
      viewer ? companyRelationship(viewer.id, id) : Promise.resolve(null),
      waitingCount(id),
      viewer ? admin().from("company_interest").select("user_id").eq("company_id", id).eq("user_id", viewer.id).is("notified_at", null).maybeSingle().then((r) => !!r.data) : Promise.resolve(false),
    ]);
    // "I want to know": how many members are waiting for this company's first story, and whether you are.
    return c.json({ company: companyDto(row), stats, relationship: rel, interest: { waiting, mine }, ...first });
  })

  .post("/:slug/interest", requireAuth, rateLimit({ name: "company-interest", max: 60, windowSeconds: 3600, by: "user" }), slugParam, async (c) => {
    const { id } = await companyBySlug(c.req.valid("param").slug);
    const { error } = await admin().from("company_interest").upsert({ company_id: id, user_id: me(c).id, notified_at: null }, { onConflict: "company_id,user_id" });
    if (error) dbFail("company interest (run the company_interest section of init_database.sql)", error);
    later(bump({ shared: [`company:${c.req.valid("param").slug}`] }));
    return c.json({ interest: { waiting: await waitingCount(id), mine: true } });
  })
  .delete("/:slug/interest", requireAuth, rateLimit({ name: "company-interest", max: 60, windowSeconds: 3600, by: "user" }), slugParam, async (c) => {
    const { id } = await companyBySlug(c.req.valid("param").slug);
    await admin().from("company_interest").delete().eq("company_id", id).eq("user_id", me(c).id);
    later(bump({ shared: [`company:${c.req.valid("param").slug}`] }));
    return c.json({ interest: { waiting: await waitingCount(id), mine: false } });
  })

  // The company's logo, passed through our server: pages can read its colours (for the banner) and
  // visitors' browsers never contact the company's site. Cached for a day. SVGs are served with a
  // no-script policy, so a logo can never run code even if opened directly.
  .get("/:slug/logo", rateLimit({ name: "company-logo", max: 600, windowSeconds: 600 }), slugParam, async (c) => {
    const slug = c.req.valid("param").slug;
    let logo = logoCache.get(slug);
    if (!logo || Date.now() - logo.at > LOGO_TTL) {
      const { row } = await companyBySlug(slug);
      const img = row.logo_url ? await fetchImage(row.logo_url) : null;
      if (!img) throw notFound("Logo");
      if (logoCache.size > 400) logoCache.delete(logoCache.keys().next().value!);
      logo = { ...img, at: Date.now() };
      logoCache.set(slug, logo);
    }
    c.header("Content-Type", logo.type);
    c.header("Cache-Control", "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400");
    // Note: the app-wide policy (app.ts) replaces this one on the way out; keep the two in step.
    c.header("Content-Security-Policy", "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Cross-Origin-Resource-Policy", "cross-origin");
    return c.body(new Uint8Array(logo.body));
  })

  // More stories, newest first; `sentiment` narrows to positive or critical ones.
  .get("/:slug/stories", optionalAuth, rateLimit({ name: "company-stories", max: 180, windowSeconds: 60 }), slugParam, validate("query", z.object({
    before: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(30).default(10),
    sentiment: z.enum(["all", "positive", "critical"]).default("all"),
    stage: z.enum(["application", "screening", "technical", "final", "offer"]).optional(),
    since: z.enum(["90d", "1y"]).optional(),
  })), async (c) => {
    const { id } = await companyBySlug(c.req.valid("param").slug);
    return c.json(await companyStories(id, c.get("profile"), c.req.valid("query")));
  })

  // Follow a company; `notify` is the bell (a notification for every new story about it).
  .post("/:slug/follow", requireAuth, rateLimit({ name: "company-follow", max: 60, windowSeconds: 3600, by: "user" }), slugParam, validate("json", z.object({ notify: z.boolean().optional() }).strict()), async (c) => {
    const { id } = await companyBySlug(c.req.valid("param").slug);
    const { data: existing } = await admin().from("company_follows").select("notify").eq("user_id", me(c).id).eq("company_id", id).maybeSingle();
    const { error } = await admin().from("company_follows").upsert({ user_id: me(c).id, company_id: id, notify: c.req.valid("json").notify ?? existing?.notify ?? false }, { onConflict: "user_id,company_id" });
    if (error) dbFail("follow company", error);
    if (!existing) award(me(c).id, "follow", `c:${id}`);
    later(bump({ user: me(c).id, topics: ["me"], shared: [`company:${c.req.valid("param").slug}`] }));
    return c.json({ relationship: await companyRelationship(me(c).id, id) });
  })

  .delete("/:slug/follow", requireAuth, rateLimit({ name: "company-unfollow", max: 60, windowSeconds: 3600, by: "user" }), slugParam, async (c) => {
    const { id } = await companyBySlug(c.req.valid("param").slug);
    const { error } = await admin().from("company_follows").delete().eq("user_id", me(c).id).eq("company_id", id);
    if (error) dbFail("unfollow company", error);
    later(bump({ user: me(c).id, topics: ["me"], shared: [`company:${c.req.valid("param").slug}`] }));
    return c.json({ relationship: await companyRelationship(me(c).id, id) });
  })

  // "Not listed yet? Request it" for someone who can't list it right now (listing limit reached, or
  // a brand-new account). The website is checked the same way; an already-listed company is
  // returned instead. You're notified once when anyone lists it (see notifyRequesters).
  .post("/requests", requireAuth, rateLimit({ name: "company-request", max: 15, windowSeconds: 86400, by: "user" }), validate("json", z.object({ website: z.string().trim().min(3).max(200), name: z.string().trim().max(80).optional() }).strict()), async (c) => {
    const b = c.req.valid("json");
    let site;
    try { site = await inspectWebsite(b.website); }
    catch (err) { if (err instanceof SiteCheckError) throw new ApiError(422, "website_invalid", err.message, { website: err.message }); throw err; }
    const existing = await byDomain(site.domain);
    if (existing) return c.json({ requested: false, existing: companyDto(existing) });
    const { error } = await admin().from("company_requests").upsert({ user_id: me(c).id, domain: site.domain, name: b.name ? clean(b.name) : null, notified_at: null }, { onConflict: "user_id,domain" });
    if (error) dbFail("company request (run the Company requests section of init_database.sql)", error);
    return c.json({ requested: true, domain: site.domain });
  })

  // Step 2: list it. Everything is re-checked here (the page's preview is only a convenience).
  .post("/", requireAuth,
    // Attempts (including ones that fail validation): generous, just stops hammering.
    rateLimit({ name: "company-create-try", max: 12, windowSeconds: 3600, by: "user" }),
    rateLimit({ name: "company-create-ip", max: 30, windowSeconds: 86400 }),
    validate("json", newCompany), async (c) => {
    const body = c.req.valid("json");
    // The real limit: companies actually listed, per rolling day and week (see listingQuota).
    const quota = await listingQuota(me(c).id);
    if (quota.remaining === 0) throw new ApiError(429, "listing_limit", quota.message!);
    // Brand-new accounts can't list companies straight away (throwaway spam accounts).
    const ageMinutes = (Date.now() - new Date(me(c).created_at).getTime()) / 60_000;
    if (ageMinutes < MIN_ACCOUNT_AGE_MINUTES) throw new ApiError(403, "account_too_new", `New accounts can list a company after ${MIN_ACCOUNT_AGE_MINUTES} minutes. Read a few stories in the meantime?`);
    await verifyChallenge(c, body.captchaToken);

    let site;
    try { site = await inspectWebsite(body.website); }
    catch (err) { if (err instanceof SiteCheckError) throw new ApiError(422, "website_invalid", err.message, { website: err.message }); throw err; }
    const dupe = await byDomain(site.domain);
    if (dupe) throw new ApiError(409, "company_exists", `${dupe.name} is already listed with this website. Share your story there.`, { website: "Already listed" });
    if (!nameMatchesSite(body.name, site)) throw new ApiError(422, "name_mismatch", "The name doesn't match that website. Use the company's name as it appears on its site.", { name: "Doesn't match the website" });
    if (body.careersUrl && registrableDomain(new URL(body.careersUrl).hostname) !== site.domain) throw new ApiError(422, "careers_mismatch", "The careers page must be on the company's own website.", { careersUrl: "Must be on the same website" });

    // Goofy reads the listing too: offensive names or descriptions are turned away; anything that
    // needs a second look is listed, then reported by Goofy for a human.
    const review = reviewText(`${body.name}\n${body.about}`, { kind: "story", companyName: body.name });
    const goofy = await goofyControls();
    if (goofy.enabled && goofy.blockVulgarity && review.decision === "block") throw new ApiError(422, "moderation_blocked", `Goofy: ${review.message ?? "This listing can't be published."}`, { about: review.message ?? "Can't be published" });

    let slug = slugify(body.name);
    if (slug.length < 2) throw new ApiError(400, "invalid_input", "Please use the company's real name.", { name: "Use the real name" });
    const { data: taken } = await admin().from("companies").select("id").eq("slug", slug).maybeSingle();
    if (taken) slug = slugify(`${body.name} ${site.domain.split(".")[0]}`); // same name, different company

    const { error } = await admin().from("companies").insert({
      slug, name: body.name, color: COLORS[Math.floor(Math.random() * COLORS.length)], created_by: me(c).id,
      domain: site.domain, website: site.homepage, logo_url: site.iconUrl, about: body.about, summary: body.about.slice(0, 157).replace(/\s+\S*$/, "") + (body.about.length > 157 ? "…" : ""),
      industry: body.industry, size: body.size, hq_city: body.hqCity, founded: body.founded ?? null, careers_url: body.careersUrl ?? null,
    });
    if (error?.code === "23505") throw new ApiError(409, "company_exists", "That company was just listed by someone else. Search for it.");
    if (error) dbFail("create company", error);
    const { data, error: rErr } = await admin().from("company_scores").select("*").eq("slug", slug).single();
    if (rErr) dbFail("read company", rErr);
    later(bump({ shared: ["companies"] }));
    later(notifyRequesters(site.domain, body.name, me(c).id));
    if (goofy.enabled && goofy.fileReports && review.decision === "review") later(reportAs("company", (data as { id: string }).id, review.reasons.map((r) => r.code), review.reasons[0]?.detail ?? "needs a second look", { companySlug: slug }));
    return c.json({ company: companyDto(data as CompanyScoreRow) }, 201);
  })

  // Anyone signed in can flag a listing (fake company, wrong website, duplicate…).
  .post("/:slug/report", requireAuth, rateLimit({ name: "company-report", max: 10, windowSeconds: 3600, by: "user" }), validate("param", z.object({ slug: z.string().regex(/^[a-z0-9-]{2,60}$/) })), validate("json", z.object({
    reason: z.enum(["fake", "wrong_website", "duplicate", "offensive", "other"]),
    details: optionalText(1000),
  }).strict()), async (c) => {
    const { data: company } = await admin().from("companies").select("id").eq("slug", c.req.valid("param").slug).maybeSingle();
    if (!company) throw notFound("Company");
    const { reason, details } = c.req.valid("json");
    const { error } = await admin().from("company_reports").insert({ company_id: company.id, reporter_id: me(c).id, reason, details: details ?? null });
    if (error) dbFail("report company", error);
    return c.json({ ok: true, message: "Thanks. Moderators will check this listing within 24 hours." }, 201);
  });

// ---------- company pages ----------

async function companyBySlug(slug: string) {
  const { data, error } = await admin().from("company_scores").select("*").eq("slug", slug).maybeSingle();
  if (error) dbFail("company", error);
  if (!data) throw notFound("Company");
  return { row: data as CompanyScoreRow & { id: string }, id: (data as { id: string }).id };
}

async function companyRelationship(userId: string, companyId: string) {
  const { data } = await admin().from("company_follows").select("notify").eq("user_id", userId).eq("company_id", companyId).maybeSingle();
  return { following: !!data, notify: !!data?.notify };
}

async function companyStories(companyId: string, viewer: Profile | null, { before, limit = 10, sentiment = "all", stage, since }: { before?: string | undefined; limit?: number; sentiment?: "all" | "positive" | "critical"; stage?: string | undefined; since?: "90d" | "1y" | undefined }) {
  let q = publishedStories().eq("company_id", companyId).order("created_at", { ascending: false }).limit(limit + 1);
  if (before) q = q.lt("created_at", before);
  if (stage) q = q.eq("stage", stage);
  if (since) q = q.gte("created_at", new Date(Date.now() - (since === "90d" ? 90 : 365) * 86400_000).toISOString());
  if (sentiment === "positive") q = q.gte("rating_avg", POSITIVE);
  if (sentiment === "critical") q = q.lte("rating_avg", CRITICAL);
  const { data, error } = await q;
  if (error) dbFail("company stories", error);
  const rows = (data ?? []) as unknown as StoryRow[];
  const page = rows.slice(0, limit);
  return { stories: await hydrate(page, viewer), nextCursor: rows.length > limit ? page.at(-1)!.created_at : null };
}

const PROCESS_MIN = 5; // stories before the "Typical process" card shows

async function companyStats(companyId: string, viewer: Profile | null) {
  const DAY = 86400_000, WEEKS = 8;
  const [{ data, error }, followers] = await Promise.all([
    admin().from("stories").select("id, outcome, stage, job_role, created_at, days_waited, salary_min_lpa, salary_max_lpa, rating_avg").eq("company_id", companyId).eq("status", "published").limit(3000),
    admin().from("company_follows").select("user_id", { count: "exact", head: true }).eq("company_id", companyId),
  ]);
  if (error) dbFail("company stats", error);
  type Row = { id: string; outcome: string; stage: string; job_role: string | null; created_at: string; days_waited: number | null; salary_min_lpa: number | null; salary_max_lpa: number | null; rating_avg: number | null };
  const rows = (data ?? []) as Row[];
  const ids = rows.map((r) => r.id);
  const { data: counts } = ids.length ? await admin().from("story_counts").select("story_id, relatable, flags, comments").in("story_id", ids.slice(0, 1000)) : { data: [] };
  const sum = (k: string) => (counts ?? []).reduce((n, c) => n + Number((c as Record<string, unknown>)[k] ?? 0), 0);
  // A story with no ratings at all counts as mixed, never as critical.
  const avg = (r: Row) => (r.rating_avg == null ? (POSITIVE + CRITICAL) / 2 : Number(r.rating_avg));
  const positive = rows.filter((r) => avg(r) >= POSITIVE), critical = rows.filter((r) => avg(r) <= CRITICAL);

  // Stories per week, split by sentiment (oldest first).
  const since = Date.now() - WEEKS * 7 * DAY;
  const weekly = Array.from({ length: WEEKS }, (_, i) => ({ week: new Date(since + i * 7 * DAY).toISOString().slice(0, 10), positive: 0, mixed: 0, critical: 0 }));
  for (const r of rows) {
    const i = Math.floor((new Date(r.created_at).getTime() - since) / (7 * DAY));
    if (i >= 0 && i < WEEKS) weekly[i]![avg(r) >= POSITIVE ? "positive" : avg(r) <= CRITICAL ? "critical" : "mixed"]++;
  }
  const byStage = ["application", "screening", "technical", "final", "offer"].map((s) => {
    const w = rows.filter((r) => r.stage === s && r.days_waited != null).map((r) => r.days_waited!);
    return { stage: s, avgDays: w.length ? Math.round(w.reduce((a, b) => a + b, 0) / w.length) : null, stories: rows.filter((r) => r.stage === s).length };
  });
  const roles = new Map<string, { role: string; mins: number[]; maxs: number[] }>();
  for (const r of rows) if (r.job_role && r.salary_min_lpa != null && r.salary_max_lpa != null) {
    const k = r.job_role.trim().toLowerCase(); const e = roles.get(k) ?? { role: r.job_role.trim(), mins: [], maxs: [] };
    e.mins.push(Number(r.salary_min_lpa)); e.maxs.push(Number(r.salary_max_lpa)); roles.set(k, e);
  }
  const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0;

  // "Typical process": only from real stories, and only once there are enough of them. Each figure
  // has its own minimum too, so a single number never stands in for a pattern. Ghosted doesn't record
  // a count of rounds or the posted salary, so the card says how far people usually got and what was
  // offered, never a rounds count or an offer-vs-posted gap.
  const STAGES = ["application", "screening", "technical", "final", "offer"];
  const process = (() => {
    if (rows.length < PROCESS_MIN) return { ready: false as const, stories: rows.length, needed: PROCESS_MIN - rows.length };
    const reach = rows.map((r) => STAGES.indexOf(r.stage)).filter((i) => i >= 0);
    const waits = rows.map((r) => r.days_waited).filter((d): d is number => d != null);
    const pays = rows.filter((r) => r.salary_min_lpa != null && r.salary_max_lpa != null).map((r) => (Number(r.salary_min_lpa) + Number(r.salary_max_lpa)) / 2);
    return {
      ready: true as const, stories: rows.length,
      usualStage: reach.length ? STAGES[median(reach)]! : null,
      stageCounts: STAGES.map((s) => ({ stage: s, count: rows.filter((r) => r.stage === s).length })),
      medianDays: waits.length >= 3 ? median(waits) : null, waitReports: waits.length,
      outcomes: ["ghosted", "rejected", "offer", "offer_revoked", "ghost_job"].map((o) => ({ outcome: o, share: Math.round((rows.filter((r) => r.outcome === o).length / rows.length) * 100) })),
      offerPay: pays.length >= 3 ? { median: Math.round(median(pays) * 10) / 10, reports: pays.length } : null,
    };
  })();

  // The best and the worst experience (by stars, most recent first), shown side by side.
  const pick = async (list: Row[], best: boolean) => {
    const top = [...list].sort((a, b) => (best ? avg(b) - avg(a) : avg(a) - avg(b)) || b.created_at.localeCompare(a.created_at))[0];
    if (!top) return null;
    const { data: s } = await publishedStories().eq("id", top.id).maybeSingle();
    return s ? (await hydrate([s as unknown as StoryRow], viewer))[0] ?? null : null;
  };
  const [bestStory, worstStory] = await Promise.all([pick(positive, true), pick(critical, false)]);

  return {
    stories: rows.length, relatableReceived: sum("relatable"), flagsReceived: sum("flags"), chitchats: sum("comments"), followers: followers.count ?? 0,
    sentiment: { positive: positive.length, mixed: rows.length - positive.length - critical.length, critical: critical.length },
    outcomes: ["ghosted", "rejected", "offer", "offer_revoked", "ghost_job"].map((o) => ({ outcome: o, count: rows.filter((r) => r.outcome === o).length })),
    weekly, byStage, process,
    salaries: [...roles.values()].sort((a, b) => b.mins.length - a.mins.length).slice(0, 4).map((e) => ({ role: e.role, range: [Math.min(...e.mins), Math.max(...e.maxs)] as [number, number], median: Math.round((median(e.mins) + median(e.maxs)) / 2), reports: e.mins.length })),
    bestStory, worstStory,
  };
}

// ---------- listing quota ----------

// How many companies one person can list: counted from listings that actually went live (failed
// attempts don't use it up), over rolling windows so it can't be gamed around midnight.
export const LISTING_LIMITS = { day: 3, week: 10 } as const;

async function listingQuota(userId: string) {
  const DAY = 86400_000;
  const since = new Date(Date.now() - 7 * DAY).toISOString();
  const { data, error } = await admin().from("companies").select("created_at").eq("created_by", userId).gte("created_at", since).order("created_at", { ascending: true }).limit(100);
  if (error) dbFail("listing quota", error);
  const times = (data ?? []).map((r) => new Date(r.created_at as string).getTime());
  const today = times.filter((t) => t >= Date.now() - DAY);
  const dayLeft = Math.max(0, LISTING_LIMITS.day - today.length);
  const weekLeft = Math.max(0, LISTING_LIMITS.week - times.length);
  const remaining = Math.min(dayLeft, weekLeft);
  // When the next slot frees up: 24 h (or 7 days) after the oldest listing still counted.
  const resetsAt = remaining > 0 ? null : new Date((weekLeft === 0 ? times[0]! + 7 * DAY : today[0]! + DAY)).toISOString();
  const wait = resetsAt ? Math.ceil((new Date(resetsAt).getTime() - Date.now()) / 3_600_000) : 0;
  return {
    remaining, dayLeft, weekLeft, limits: LISTING_LIMITS, resetsAt,
    message: remaining > 0 ? null : weekLeft === 0
      ? `You've listed ${LISTING_LIMITS.week} companies this week, the most allowed. You can list more in about ${Math.ceil(wait / 24)} day${Math.ceil(wait / 24) === 1 ? "" : "s"}.`
      : `You've listed ${LISTING_LIMITS.day} companies today, the most allowed. You can list another in about ${wait} hour${wait === 1 ? "" : "s"}.`,
  };
}

// A company just went live: everyone who requested its domain hears about it once (not the person
// who listed it). Best effort; a missing table (SQL not run yet) just skips it.
async function notifyRequesters(domain: string, name: string, listerId: string) {
  try {
    const { data, error } = await admin().from("company_requests").update({ notified_at: new Date().toISOString() }).eq("domain", domain).is("notified_at", null).select("user_id");
    if (error) return;
    for (const r of (data ?? []) as { user_id: string }[]) {
      if (r.user_id === listerId) continue;
      await addNotification(r.user_id, "company", `${name} is now on Ghosted, the company you asked for. Search for it to share your story or follow it for new ones.`);
    }
  } catch (e) { console.error("[company-request] notify", (e as Error).message); }
}

async function byDomain(domain: string) {
  const { data } = await admin().from("company_scores").select("*").eq("domain", domain).maybeSingle();
  return (data as CompanyScoreRow | null) ?? null;
}
