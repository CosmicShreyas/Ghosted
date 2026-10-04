import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { env } from "./env.js";
import { admin } from "./supabase.js";
import { storyScore } from "./score.js";
import { inviterByCode } from "./referral.js";
import { hit, type FunnelEvent } from "./funnel.js";
// The preview-image renderer (satori + resvg, which has a native binary) is loaded only when an
// image is requested. If it can't load on the server, only /v1/og fails; the rest of the API is
// unaffected (importing it here at start-up once took every endpoint down).
const og = () => import("./og.js");
import { ApiError } from "./errors.js";
import { authRoutes } from "./routes/auth.js";
import { applicationRoutes } from "./routes/applications.js";
import { companyRoutes } from "./routes/companies.js";
import { meRoutes } from "./routes/me.js";
import { mfaRoutes } from "./routes/mfa.js";
import { statsRoutes } from "./routes/stats.js";
import { storyRoutes } from "./routes/stories.js";
import { searchRoutes } from "./routes/search.js";
import { feedbackRoutes } from "./routes/feedback.js";
import { donationRoutes } from "./routes/donations.js";
import { adminRoutes } from "./routes/admin.js";
import { peopleRoutes } from "./routes/people.js";
import { ipKey, limitBy, optionalAuth, rateLimit, type AppEnv } from "./security.js";
import { createChallenge } from "./captcha.js";
import { later, versions } from "./live.js";
import { runDigest } from "./notify.js";
import { runAll } from "./automation.js";
import { platform, platformGate } from "./platform.js";

const LAN_ORIGIN = /^http:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):\d{2,5}$/;
// Public topics a page may watch: the feed, one story's reactions and chitchats, or one person's page.
const SHARED_TOPIC = /^(feed|companies|story:\d{15}|person:\d{15}|company:[a-z0-9-]{2,60})$/;

export const app = new Hono<AppEnv>();

app.use(requestId());
// JSON API: no HTML, so the strictest CSP and no framing.
app.use(secureHeaders({
  contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
  strictTransportSecurity: "max-age=63072000; includeSubDomains; preload",
  referrerPolicy: "no-referrer",
  // Set per response below instead, so a route (company logos) can allow cross-site embedding.
  crossOriginResourcePolicy: false,
}));
// Same-site unless the route chose otherwise (only the logo pass-through allows cross-origin).
app.use(async (c, next) => {
  await next();
  if (!c.res.headers.has("Cross-Origin-Resource-Policy")) c.res.headers.set("Cross-Origin-Resource-Policy", "same-site");
});
app.use(cors({
  // Local development also accepts the dev site opened from a phone on the same Wi-Fi (private LAN
  // addresses over http). Never on Vercel, where only the configured origins are allowed.
  // The admin app (ADMIN_ORIGINS) is allowed too; its routes then check the origin again themselves.
  origin: (origin) => (env().ALLOWED_ORIGINS.includes(origin) || env().ADMIN_ORIGINS.includes(origin) || (!env().VERCEL_ENV && LAN_ORIGIN.test(origin)) ? origin : null),
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-Ghosted-Client"],
  exposeHeaders: ["RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset", "Retry-After", "X-Request-Id"],
  credentials: true, // session cookies travel with requests from allowed origins only
  maxAge: 600,
}));
// CSRF guard: cookies are sent automatically, so every state-changing request must carry a custom
// header. Other sites can't add it without passing the CORS allow-list above.
app.use(async (c, next) => {
  // Razorpay's webhook is server-to-server and proves itself with a signature instead.
  if (c.req.path === "/v1/donations/webhook") return next();
  if (["POST", "PATCH", "DELETE"].includes(c.req.method) && c.req.header("x-ghosted-client") !== "web" && !c.req.header("authorization")) {
    return c.json({ error: { code: "csrf_blocked", message: "Request blocked for your safety." } }, 403);
  }
  await next();
});
// IP bans and read-only mode (platform.ts), set from the admin panel.
app.use("/v1/*", platformGate);
app.get("/v1/platform", async (c) => { const p = await platform(); c.header("Cache-Control", "public, max-age=30"); return c.json({ announcement: p.announcement, signupsOpen: p.signupsOpen, postingOpen: p.postingOpen && !p.readOnly, chitchatsOpen: p.chitchatsOpen && !p.readOnly, donationsOpen: p.donationsOpen && !p.readOnly, readOnly: p.readOnly, readOnlyMessage: p.readOnlyMessage }); });
app.use(bodyLimit({ maxSize: 48 * 1024, onError: (c) => c.json({ error: { code: "payload_too_large", message: "That request is too large." } }, 413) }));
// Mutations that carry a body must send JSON; blocks form-encoded cross-site posts outright.
// Body-less requests (unfollow, unmute, delete…) send no Content-Length at all, so "has a body"
// means a non-zero Content-Length or a chunked Transfer-Encoding, not merely a missing header.
app.use(async (c, next) => {
  const length = c.req.header("content-length");
  const hasBody = (length !== undefined && length !== "0") || !!c.req.header("transfer-encoding");
  if (["POST", "PATCH", "DELETE"].includes(c.req.method) && hasBody && !c.req.header("content-type")?.startsWith("application/json")) {
    return c.json({ error: { code: "unsupported_media_type", message: "Send JSON." } }, 415);
  }
  await next();
});
// Authenticated responses must never be cached by a CDN. A response that never looked at the session
// (logos, the company list, public stats) is the same for everyone, so it keeps its own caching even
// when the browser happens to send cookies; anything that read the session, or has no caching rule
// of its own, is private.
app.use(async (c, next) => {
  await next();
  const personal = !!c.req.header("authorization") || !!c.get("sessionRead") || !!c.get("profile");
  const sharedCache = (c.res.headers.get("Cache-Control") ?? "").includes("public");
  if (personal || (c.req.header("cookie") && !sharedCache)) c.header("Cache-Control", "private, no-store");
});

app.get("/", (c) => c.json({ name: "Ghosted API", status: "ok" }));
app.get("/health", (c) => c.json({ ok: true }));

// A fresh human-check puzzle (see captcha.ts). Never cached: every puzzle is single-use.
// The rate-limit hit and the strike lookup run in parallel (one database round trip of waiting
// instead of two), since this sits in front of every form on slow mobile networks.
app.get("/v1/captcha", async (c) => {
  c.header("Cache-Control", "no-store");
  const [, challenge] = await Promise.all([
    limitBy(`captcha:ip:${ipKey(c)}`, 40, 600, "Too many requests. Take a breather and try again shortly."),
    createChallenge(c, c.req.query("level") === "hard" ? "hard" : "normal"),
  ]);
  return c.json(challenge);
});

// Live updates (see live.ts): the current version of each topic. Pages poll this every few seconds
// while visible, so it's cheap: one small read, no bodies. Signed in, your own topics come along too;
// a signed-out answer (e.g. this device was just removed) tells the page to log out.
app.get("/v1/live", optionalAuth, rateLimit({ name: "live", max: 400, windowSeconds: 600 }), async (c) => {
  c.header("Cache-Control", "no-store");
  const shared = (c.req.query("topics") ?? "").split(",").filter((t) => SHARED_TOPIC.test(t)).slice(0, 20);
  const profile = c.get("profile");
  return c.json({ signedIn: !!profile, versions: await versions(profile?.id ?? null, shared) });
});

app.route("/v1/auth", authRoutes);
// Weekly digest, triggered by Vercel Cron (see vercel.json). Only callable with CRON_SECRET.
app.get("/v1/cron/digest", async (c) => {
  const secret = env().CRON_SECRET;
  if (!secret || c.req.header("authorization") !== `Bearer ${secret}`) return c.json({ error: { code: "forbidden", message: "Nope." } }, 403);
  return c.json(await runDigest());
});
// Daily self-maintenance (automation.ts): refresh word lists, learn from the platform, sweep the
// held queue. Same CRON_SECRET guard.
app.get("/v1/cron/automation", async (c) => {
  const secret = env().CRON_SECRET;
  if (!secret || c.req.header("authorization") !== `Bearer ${secret}`) return c.json({ error: { code: "forbidden", message: "Nope." } }, 403);
  return c.json(await runAll());
});

// Sitemap for search engines: the public pages plus every listed company with at least one published
// story (empty company pages are thin content). Served on the site's own domain through the
// rewrite in the root vercel.json (/sitemap.xml). Story and person pages are never listed.
app.get("/v1/sitemap.xml", rateLimit({ name: "sitemap", max: 30, windowSeconds: 60 }), async (c) => {
  const site = env().FRONTEND_URL;
  const { data } = await admin().from("company_scores").select("slug, story_count, last_story_at").gt("story_count", 0).order("story_count", { ascending: false }).limit(5000);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const urls = [
    { loc: `${site}/`, freq: "daily", pri: "1.0" },
    ...["about", "community", "privacy", "terms"].map((p) => ({ loc: `${site}/${p}`, freq: "monthly", pri: "0.3" })),
    ...((data ?? []) as { slug: string; last_story_at: string | null }[]).map((r) => ({ loc: `${site}/c/${r.slug}`, freq: "weekly", pri: "0.8", mod: r.last_story_at?.slice(0, 10) })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc>${"mod" in u && u.mod ? `<lastmod>${u.mod}</lastmod>` : ""}<changefreq>${u.freq}</changefreq><priority>${u.pri}</priority></url>`).join("\n")}\n</urlset>\n`;
  c.header("Content-Type", "application/xml; charset=utf-8");
  c.header("Cache-Control", "public, max-age=3600, s-maxage=3600");
  return c.body(xml);
});

// Funnel counters from the browser (only these events; sign-ups and first stories are counted on
// the server). Anonymous daily totals, nothing about the visitor is stored.
const CLIENT_EVENTS = ["visit", "ghostometer", "timeline_check", "followup", "company_search", "invite_open"] as const;
app.post("/v1/track", rateLimit({ name: "track", max: 120, windowSeconds: 600 }), async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { event?: string };
  if ((CLIENT_EVENTS as readonly string[]).includes(body.event ?? "")) later(hit(body.event as FunnelEvent));
  return c.body(null, 204);
});

// An invite link's code → who invited you (their public handle and avatar only, never more).
app.get("/v1/invite/:code", rateLimit({ name: "invite-lookup", max: 60, windowSeconds: 60 }), async (c) => {
  const p = await inviterByCode(c.req.param("code").toUpperCase()).catch(() => null);
  return c.json(p ? { valid: true, inviter: { handle: p.handle, avatarSeed: p.avatar_seed, pastel: p.pastel } } : { valid: false });
});

// Link-preview images (see og.ts), served on the site's domain through the /og rewrite. Anything
// missing, unpublished or failing falls back to the generic site card, so a share never breaks.
const OG_OUTCOME: Record<string, string> = { ghosted: "Ghosted", rejected: "Rejected", offer: "Got an offer", offer_revoked: "Offer revoked", ghost_job: "Ghost job" };
const waitWords = (d: number) => (d < 7 ? "under a week" : d <= 14 ? "1 to 2 weeks" : d <= 30 ? "2 to 4 weeks" : d <= 60 ? "1 to 2 months" : "over 2 months");
// The generic site card; if even that can't be drawn, the platform's square icon (never a 500).
const fallback = async (c: Context, site: string) => {
  try { return png(c, await (await og()).siteCard(site)); }
  catch (e) { console.error("[og] renderer unavailable", (e as Error).message); return c.redirect(`${site}/icon-512.png`, 302); }
};
const png = (c: Context, buf: Buffer) => { c.header("Content-Type", "image/png"); c.header("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"); return c.body(new Uint8Array(buf)); };
// The ".png" is part of the file segment (Hono can't put a suffix after a patterned parameter, which
// made these routes 404), so the id or slug is taken from the whole segment and checked here.
const ogParam = (c: Context, re: RegExp) => { const m = c.req.param("file")?.match(re); return m ? m[1]! : null; };
app.get("/v1/og/s/:file", rateLimit({ name: "og", max: 120, windowSeconds: 60 }), async (c) => {
  const site = env().FRONTEND_URL;
  const id = ogParam(c, /^([0-9]{15})\.png$/);
  if (!id) return fallback(c, site);
  try {
    const { data } = await admin().from("stories").select("id, title, outcome, days_waited, quick, rating_hiring, rating_communication, rating_culture, rating_pay, rating_growth, company:companies(name)").eq("public_id", id).eq("status", "published").maybeSingle();
    const s = data as unknown as { id: string; title: string; outcome: string; days_waited: number | null; quick: boolean | null; rating_hiring: number | null; rating_communication: number | null; rating_culture: number | null; rating_pay: number | null; rating_growth: number | null; company: { name: string } | null } | null;
    if (!s) return fallback(c, site);
    const { storyCard } = await og();
    const { data: counts } = await admin().from("story_counts").select("relatable").eq("story_id", s.id).maybeSingle();
    return png(c, await storyCard({ title: s.title, company: s.company?.name ?? "a company", outcome: OG_OUTCOME[s.outcome] ?? s.outcome, wait: s.days_waited != null ? waitWords(s.days_waited) : null, score: storyScore({ hiring: s.rating_hiring, communication: s.rating_communication, culture: s.rating_culture, pay: s.rating_pay, growth: s.rating_growth }), quick: !!s.quick, relatable: Number((counts as { relatable?: number } | null)?.relatable ?? 0) }, site));
  } catch (e) { console.error("[og] story", (e as Error).message); return fallback(c, site); }
});
app.get("/v1/og/c/:file", rateLimit({ name: "og", max: 120, windowSeconds: 60 }), async (c) => {
  const site = env().FRONTEND_URL;
  const slug = ogParam(c, /^([a-z0-9-]{2,60})\.png$/);
  if (!slug) return fallback(c, site);
  try {
    const { data } = await admin().from("company_scores").select("name, story_count, flag_score, ghosted_count, avg_days_waited, hq_city").eq("slug", slug).maybeSingle();
    const r = data as { name: string; story_count: number; flag_score: number | null; ghosted_count: number; avg_days_waited: number | null; hq_city: string | null } | null;
    if (!r) return fallback(c, site);
    const { companyCard } = await og();
    return png(c, await companyCard({ name: r.name, stories: r.story_count, score: r.flag_score, ghosted: r.ghosted_count, avgWait: r.avg_days_waited, city: r.hq_city }, site));
  } catch (e) { console.error("[og] company", (e as Error).message); return fallback(c, site); }
});
app.get("/v1/og/site.png", rateLimit({ name: "og", max: 120, windowSeconds: 60 }), (c) => fallback(c, env().FRONTEND_URL));

app.route("/v1/me/2fa", mfaRoutes);
app.route("/v1/me/applications", applicationRoutes);
app.route("/v1/me", meRoutes);
app.route("/v1/stats", statsRoutes);
app.route("/v1/companies", companyRoutes);
app.route("/v1/stories", storyRoutes);
app.route("/v1/search", searchRoutes);
app.route("/v1/feedback", feedbackRoutes);
app.route("/v1/donations", donationRoutes);
// The admin panel's API: 404 for anything that isn't the admin app with a live admin session.
app.route("/v1/admin", adminRoutes);
app.route("/v1/profiles", peopleRoutes);

app.notFound((c) => c.json({ error: { code: "not_found", message: "No such endpoint." } }, 404));

app.onError((err, c) => {
  if (err instanceof ApiError) return c.json({ error: { code: err.code, message: err.message, ...(err.fields && { fields: err.fields }) } }, err.status);
  if (err instanceof HTTPException) return c.json({ error: { code: "http_error", message: err.message } }, err.status);
  console.error(`[${c.get("requestId")}]`, err);
  return c.json({ error: { code: "server_error", message: "Something went wrong on our side.", requestId: c.get("requestId") } }, 500);
});

// Vercel's zero-config Hono builder detects src/app.ts before src/index.ts and
// requires the detected module itself to provide the Hono app as its default export.
export default app;
