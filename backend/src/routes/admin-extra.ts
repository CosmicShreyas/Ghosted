// The admin API, part 2: your own settings and two-step sign-in, notifications, the team (roles,
// permissions, switching sign-in off), platform switches, members (suspend, ban, IP ban, emails).
// Mounted inside routes/admin.ts after requireAdmin and the permission check by section.
import { Hono, type Context } from "hono";
import { z } from "zod";
import { audit, checkPassword, hashPassword, sha256, ADMIN_COLS, type AdminEnv, type AdminUser } from "../admin-auth.js";
import { checkEmailCode, MFA_COLS, meDto, sendAdminMfaCode, type MfaRow } from "../admin-mfa.js";
import { ALL, effective, need, PERMISSIONS, ROLE_DEFAULTS, type Permission, type Role } from "../admin-perms.js";
import { env } from "../env.js";
import { ApiError, dbFail } from "../errors.js";
import { sealJson, unsealBytea, unsealJson } from "../lib/sealed.js";
import { hashRecovery, newRecoveryCodes, newSecret, otpauthUri, verifyTotp } from "../lib/totp.js";
import { fromBytea } from "../lib/compression.js";
import { bump } from "../live.js";
import { sendMail } from "../mail/mailer.js";
import { MEMBER_TEMPLATES, memberEmail, type MemberTemplate } from "../mail/member-email.js";
import { addNotification } from "../notify.js";
import { learn, refreshLists, sweep } from "../automation.js";
import { DEFAULTS, GOOFY_DEFAULTS, goofyControls, ipBans, platform, type GoofyControls, type Platform } from "../platform.js";
import { limitBy } from "../security.js";
import { admin as db } from "../supabase.js";
import { validate } from "../validate.js";
import { inspectWebsite, SiteCheckError } from "../lib/site-check.js";
import { gatherFacts } from "../lib/company-facts.js";
import { offsetQ, PAGE, paged } from "../admin-paging.js";

const DAY = 86400_000;
const pid = z.string().regex(/^\d{15}$/);
const seed = z.string().regex(/^[a-z0-9-]{1,64}$/);
const ROLES = ["owner", "admin", "moderator", "viewer"] as const;
const body = (s: string | null) => { if (!s) return ""; try { return fromBytea(s); } catch { return ""; } };
type Ctx = Context<AdminEnv>;
const isOwner = (a: AdminUser) => a.role === "owner";

async function mfaRow(id: string) {
  const { data, error } = await db().from("admin_users").select(`${MFA_COLS}, password_hash, totp_pending_z, notify, email`).eq("id", id).single();
  if (error) dbFail("admin mfa row", error);
  return data as MfaRow & { password_hash: string | null; totp_pending_z: string | null; notify: Record<string, boolean>; email: string };
}
async function confirmPassword(c: Ctx, password: string) {
  const r = await mfaRow(c.get("admin").id);
  if (!r.password_hash || !(await checkPassword(password, r.password_hash))) throw new ApiError(400, "bad_password", "That password isn't right.", { password: "That password isn't right" });
}
async function freshRecovery(id: string) {
  const codes = newRecoveryCodes();
  await db().from("admin_users").update({ recovery_z: sealJson(codes.map(hashRecovery)) }).eq("id", id);
  return codes;
}

// Members are looked up by their public id only.
async function member(publicId: string) {
  const { data, error } = await db().from("profiles").select("id, public_id, handle, avatar_seed, pastel, tone, email_theme, created_at, kind, posting_paused_until, banned_at, banned_until, ban_reason, details_z").eq("public_id", publicId).maybeSingle();
  if (error) dbFail("admin member", error);
  if (!data) throw new ApiError(404, "not_found", "No member with that id.");
  return data as { id: string; public_id: number; handle: string; avatar_seed: string; pastel: string; tone: "sassy" | "calm"; email_theme: "light" | "dark" | null; created_at: string; kind: string; posting_paused_until: string | null; banned_at: string | null; banned_until: string | null; ban_reason: string | null; details_z: string | null };
}
const statusOf = (m: { banned_at: string | null; banned_until: string | null; posting_paused_until: string | null }) =>
  m.banned_at && (!m.banned_until || new Date(m.banned_until).getTime() > Date.now()) ? "banned" as const
  : m.posting_paused_until && new Date(m.posting_paused_until).getTime() > Date.now() ? "paused" as const : "active" as const;
async function emailOfMember(id: string) {
  const { data, error } = await db().auth.admin.getUserById(id);
  if (error || !data.user?.email) throw new ApiError(404, "no_email", "That member has no email address on file.");
  return data.user.email;
}

const PLATFORM_SCHEMA = z.object({
  signupsOpen: z.boolean(), postingOpen: z.boolean(), chitchatsOpen: z.boolean(), donationsOpen: z.boolean(), reportsOpen: z.boolean(),
  readOnly: z.boolean(), readOnlyMessage: z.string().trim().min(10).max(240),
  storageLimitMb: z.number().int().min(50).max(1_000_000),
  announcement: z.object({ text: z.string().trim().min(3).max(200), tone: z.enum(["info", "warn", "good"]), link: z.string().trim().max(200).regex(/^(\/[\w\-/?=&#.%]*|https:\/\/[\w.-]+(\/[\w\-/?=&#.%]*)?)$/, "Use a path like /feedback or an https:// link").nullable() }).nullable(),
}).partial().strict();
const GOOFY_SCHEMA = z.object(Object.fromEntries(Object.keys(GOOFY_DEFAULTS).map((key) => [key, z.boolean()])) as Record<keyof GoofyControls, z.ZodBoolean>).partial().strict();

// ---------- growth: the weekly Ghosting Report and ready-made replies ----------
const REPORT_MIN = 20;
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2); };
const STAGE_NAME: Record<string, string> = { application: "applying", screening: "a screening call", technical: "a technical round", final: "a final round", offer: "the offer stage" };

// ---------- companies: listing by hand, one or many ----------
const INDUSTRIES = ["software", "it_services", "fintech", "ecommerce", "edtech", "healthtech", "media", "consulting", "manufacturing", "bfsi", "telecom", "gaming", "logistics", "other"] as const;
const SIZES = ["1-10", "11-50", "51-200", "201-1000", "1001-5000", "5000+"] as const;
const companyInput = z.object({
  name: z.string().trim().min(2).max(80),
  domain: z.string().trim().toLowerCase().max(120).optional().transform((d) => (d ? d.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0]! : undefined)).refine((d) => !d || /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d), "Use a domain like example.com"),
  industry: z.enum(INDUSTRIES).optional(),
  size: z.enum(SIZES).optional(),
  hqCity: z.string().trim().min(2).max(60).optional(),
  founded: z.number().int().min(1800).max(2100).optional(),
  about: z.string().trim().max(2000).optional(),
  // From the website fetch (same checks as listing on the main site).
  website: z.string().trim().url().startsWith("https://").max(300).optional(),
  logoUrl: z.string().trim().url().startsWith("https://").max(600).optional(),
  careersUrl: z.string().trim().url().startsWith("https://").max(300).optional(),
});
type CompanyInput = z.infer<typeof companyInput>;
const slugify = (name: string) => name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const PALETTE = ["bg-logo-violet", "bg-logo-coral", "bg-logo-sky", "bg-logo-mint", "bg-logo-amber", "bg-logo-pink"];

// Lists one company, skipping anything already on Ghosted (same domain, same name or same address).
async function listCompany(c: CompanyInput, by: string): Promise<{ name: string; status: "listed" | "skipped"; slug?: string; reason?: string }> {
  if (c.domain) { const { data } = await db().from("companies").select("slug").eq("domain", c.domain).maybeSingle(); if (data) return { name: c.name, status: "skipped", slug: (data as { slug: string }).slug, reason: "A company with this website is already listed" }; }
  const { data: same } = await db().from("companies").select("slug").ilike("name", c.name.replace(/[%_\\]/g, (m) => `\\${m}`)).maybeSingle();
  if (same) return { name: c.name, status: "skipped", slug: (same as { slug: string }).slug, reason: "Already listed under this name" };
  const base = slugify(c.name);
  if (base.length < 2) return { name: c.name, status: "skipped", reason: "The name needs letters or numbers" };
  let slug = base;
  for (let i = 2; i < 20; i++) { const { data } = await db().from("companies").select("id").eq("slug", slug).maybeSingle(); if (!data) break; slug = `${base.slice(0, 56)}-${i}`; }
  // About must be 80 to 800 characters: longer ones are trimmed at a sentence, shorter ones left out.
  const trimmed = c.about && c.about.length > 800 ? c.about.slice(0, 800).replace(/[^.!?]*$/, "").trim() || c.about.slice(0, 797) + "…" : c.about;
  const about = trimmed && trimmed.length >= 80 ? trimmed : null;
  const { error } = await db().from("companies").insert({
    slug, name: c.name, color: PALETTE[Math.floor(Math.random() * PALETTE.length)], domain: c.domain ?? null,
    website: c.website ?? (c.domain ? `https://${c.domain}` : null), logo_url: c.logoUrl ?? (c.domain ? `https://unavatar.io/${c.domain}?fallback=false` : null),
    about, summary: about ? about.slice(0, 157).replace(/\s+\S*$/, "") + (about.length > 157 ? "…" : "") : null,
    industry: c.industry ?? null, size: c.size ?? null, hq_city: c.hqCity ?? null, founded: c.founded ?? null, careers_url: c.careersUrl ?? null, status: "listed",
  });
  if (error) return { name: c.name, status: "skipped", reason: error.message.includes("duplicate") ? "Already listed" : "Couldn't save this one" };
  void by;
  return { name: c.name, status: "listed", slug };
}

// ---------- storage: how much of the database plan is used, and how long it lasts ----------
// Rough sizes per row, used only when the storage function (init_database.sql) isn't installed yet.
const ROW_BYTES: Record<string, number> = { stories: 2200, comments: 700, reactions: 120, notifications: 400, profiles: 900, companies: 1500, story_counts: 100, session_devices: 350, rate_limits: 120, feedback: 900, applications: 400, admin_audit: 400, company_follows: 90, follows: 90 };

export const adminExtraRoutes = new Hono<AdminEnv>()
  .get("/storage", async (c) => {
    const p = await platform(true);
    const limit = p.storageLimitMb * 1024 * 1024;
    const DAY = 86400_000;
    const n = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0, () => 0);
    const [stories, storiesMonth, rpc] = await Promise.all([
      n(db().from("stories").select("id", { count: "exact", head: true })),
      n(db().from("stories").select("id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 30 * DAY).toISOString())),
      db().rpc("admin_storage_stats"),
    ]);
    type T = { table_name: string; row_estimate: number; total_bytes: number; index_bytes: number; database_bytes: number };
    let tables: { name: string; rows: number; bytes: number; indexBytes: number }[];
    let used: number, exact = true;
    if (!rpc.error && Array.isArray(rpc.data) && rpc.data.length) {
      const rows = rpc.data as T[];
      tables = rows.map((r) => ({ name: r.table_name, rows: Number(r.row_estimate), bytes: Number(r.total_bytes), indexBytes: Number(r.index_bytes) }));
      used = Number(rows[0]!.database_bytes);
    } else {
      // Estimate from row counts (run the storage section of init_database.sql for exact numbers).
      exact = false;
      const names = Object.keys(ROW_BYTES);
      const counts = await Promise.all(names.map((t) => n(db().from(t).select("*", { count: "exact", head: true }))));
      tables = names.map((t, i) => ({ name: t, rows: counts[i]!, bytes: Math.round(counts[i]! * ROW_BYTES[t]! * 1.6), indexBytes: Math.round(counts[i]! * ROW_BYTES[t]! * 0.6) })).sort((a, b) => b.bytes - a.bytes);
      used = tables.reduce((s, t) => s + t.bytes, 0) + 12 * 1024 * 1024; // Postgres and Supabase's own tables
    }
    // What one story costs: the story plus what grows with it (reactions, chitchats, counts, notifications).
    const per = ["stories", "comments", "reactions", "story_counts", "notifications"].reduce((s, t) => s + (tables.find((x) => x.name === t)?.bytes ?? 0), 0);
    const bytesPerStory = stories > 0 ? Math.max(1024, Math.round(per / stories)) : 6 * 1024;
    const remaining = Math.max(0, limit - used);
    const perDay = storiesMonth / 30;
    return c.json({
      exact, limitMb: p.storageLimitMb, usedBytes: used, limitBytes: limit, remainingBytes: remaining, percent: Math.min(100, Math.round((used / limit) * 1000) / 10),
      stories, storiesLast30: storiesMonth, bytesPerStory, storiesThatFit: Math.floor(remaining / bytesPerStory),
      daysLeft: perDay > 0 ? Math.round(remaining / (bytesPerStory * perDay)) : null,
      tables: tables.slice(0, 20),
    });
  })
  // Paste website links: each is checked and read exactly like listing on the main site (the site
  // must exist over HTTPS; name, logo, about, industry, size, city, founded and careers page are
  // gathered from it and Wikidata). Up to 10 per call; the panel sends batches and shows a preview.
  .post("/companies/fetch", validate("json", z.object({ websites: z.array(z.string().trim().min(3).max(200)).min(1).max(10) }).strict()), async (c) => {
    const one = async (input: string) => {
      try {
        const site = await inspectWebsite(input);
        const [{ data: dupe }, facts] = await Promise.all([db().from("companies").select("name, slug").eq("domain", site.domain).maybeSingle(), gatherFacts(site)]);
        const enumOr = <T extends readonly string[]>(list: T, v: string | null) => (v && (list as readonly string[]).includes(v) ? v : undefined);
        return {
          input, ok: true as const, existing: (dupe as { name: string; slug: string } | null) ?? null,
          draft: {
            name: (facts.name ?? site.siteName ?? site.title ?? site.domain.split(".")[0]!).trim().slice(0, 80),
            domain: site.domain, website: site.homepage, logoUrl: site.iconUrl ?? undefined,
            about: facts.about ?? site.description ?? undefined, industry: enumOr(INDUSTRIES, facts.industry), size: enumOr(SIZES, facts.size),
            hqCity: facts.hqCity ?? undefined, founded: facts.founded ?? undefined, careersUrl: facts.careersUrl ?? undefined,
          },
        };
      } catch (e) {
        return { input, ok: false as const, error: e instanceof SiteCheckError ? e.message : "Couldn't reach that website." };
      }
    };
    return c.json({ items: await Promise.all(c.req.valid("json").websites.map(one)) });
  })
  .post("/companies", validate("json", companyInput), async (c) => {
    const r = await listCompany(c.req.valid("json"), c.get("admin").name);
    if (r.status === "listed") { await bump({ shared: ["companies"] }); await audit(c, "company_added", { kind: "company", ref: r.slug ?? null }); }
    return c.json(r, r.status === "listed" ? 201 : 409);
  })
  .post("/companies/bulk", validate("json", z.object({ companies: z.array(companyInput).min(1).max(500) }).strict()), async (c) => {
    const results = [];
    for (const row of c.req.valid("json").companies) results.push(await listCompany(row, c.get("admin").name));
    const listed = results.filter((r) => r.status === "listed").length;
    if (listed) { await bump({ shared: ["companies"] }); await audit(c, "companies_bulk_added", {}, { listed, skipped: results.length - listed }); }
    return c.json({ listed, skipped: results.length - listed, results });
  })
  // Findings from real published stories, each with a LinkedIn post and an X post that link back
  // to a company page. Withheld until there are enough stories to mean something.
  .get("/growth/report", async (c) => {
    const site = env().FRONTEND_URL;
    const [{ data: rows }, { data: cos }] = await Promise.all([
      db().from("stories").select("outcome, stage, days_waited, created_at, company:companies(name, slug)").eq("status", "published").limit(20000),
      db().from("company_scores").select("name, slug, story_count, ghosted_count, avg_days_waited, flag_score").gt("story_count", 0).limit(5000),
    ]);
    const all = (rows ?? []) as unknown as { outcome: string; stage: string; days_waited: number | null; created_at: string; company: { name: string; slug: string } | null }[];
    const companies = (cos ?? []) as { name: string; slug: string; story_count: number; ghosted_count: number; avg_days_waited: number | null; flag_score: number | null }[];
    if (all.length < REPORT_MIN) return c.json({ ready: false, stories: all.length, needed: REPORT_MIN, findings: [] });
    const link = (slug?: string) => (slug ? `${site}/c/${slug}` : site);
    const tag = "#GhostedReceipts";
    type F = { id: string; headline: string; detail: string; link: string; linkedin: string; x: string };
    const out: F[] = [];
    const add = (id: string, headline: string, detail: string, url: string) => out.push({
      id, headline, detail, link: url,
      linkedin: `${headline}\n\n${detail}\n\nFrom ${all.length} anonymous candidate experiences on Ghosted. See the details: ${url}\n\n${tag} #hiring #jobsearch #India`,
      x: `${headline} ${detail}`.slice(0, 200) + ` ${url} ${tag}`,
    });
    const replied = all.filter((r) => r.outcome !== "ghosted" && r.outcome !== "ghost_job").length;
    add("reply-rate", `Only ${Math.round((replied / all.length) * 100)}% of candidates got any reply.`, `${all.length - replied} of ${all.length} candidates on Ghosted were ghosted or applied to a ghost job.`, site);
    for (const stage of ["final", "technical", "screening"]) {
      const w = all.filter((r) => r.stage === stage && r.days_waited != null).map((r) => r.days_waited!);
      if (w.length >= 5) { add(`wait-${stage}`, `Median wait after ${STAGE_NAME[stage]}: ${median(w)} days.`, `Based on ${w.length} candidates who shared how long they waited.`, site); break; }
    }
    const ghostiest = [...companies].filter((c) => c.story_count >= 3).sort((a, b) => b.ghosted_count / b.story_count - a.ghosted_count / a.story_count)[0];
    if (ghostiest && ghostiest.ghosted_count > 0) add("ghostiest", `${ghostiest.ghosted_count} of ${ghostiest.story_count} candidates say ${ghostiest.name} ghosted them.`, `Read what happened before you apply.`, link(ghostiest.slug));
    const slowest = [...companies].filter((c) => c.story_count >= 2 && c.avg_days_waited != null).sort((a, b) => b.avg_days_waited! - a.avg_days_waited!)[0];
    if (slowest) add("slowest", `Candidates waited ${slowest.avg_days_waited} days on average to hear back from ${slowest.name}.`, `The slowest reply time on Ghosted right now.`, link(slowest.slug));
    const best = [...companies].filter((c) => c.story_count >= 3 && c.flag_score != null).sort((a, b) => b.flag_score! - a.flag_score!)[0];
    if (best) add("best", `${best.name} has the best candidate experience on Ghosted: a Flag Score of ${best.flag_score}/100.`, `Good hiring deserves a shout-out too.`, link(best.slug));
    const ghostJobs = all.filter((r) => r.outcome === "ghost_job").length;
    if (ghostJobs >= 3) add("ghost-jobs", `${ghostJobs} candidates applied to roles that never really existed.`, `Ghost jobs are real. Check the company before you spend a weekend on the application.`, site);
    return c.json({ ready: true, stories: all.length, needed: REPORT_MIN, findings: out });
  })
  // "Anyone interviewed at X recently?": a ready reply linking to the company page.
  .get("/growth/reply", validate("query", z.object({ q: z.string().trim().min(2).max(60) })), async (c) => {
    const site = env().FRONTEND_URL;
    const q = c.req.valid("query").q.replace(/[%_\\]/g, (m) => `\\${m}`);
    const { data } = await db().from("company_scores").select("name, slug, story_count, ghosted_count, avg_days_waited, flag_score").ilike("name", `%${q}%`).order("story_count", { ascending: false }).limit(6);
    const items = ((data ?? []) as { name: string; slug: string; story_count: number; ghosted_count: number; avg_days_waited: number | null; flag_score: number | null }[]).map((co) => {
      const url = `${site}/c/${co.slug}`;
      const facts = co.story_count ? [`${co.story_count} candidate ${co.story_count === 1 ? "experience" : "experiences"}`, ...(co.avg_days_waited != null ? [`an average wait of ${co.avg_days_waited} days`] : []), ...(co.ghosted_count ? [`${co.ghosted_count} ghosted`] : [])].join(", ") : null;
      const reply = facts
        ? `There are ${facts} for ${co.name} on Ghosted, shared anonymously by people who went through their hiring: rounds, waiting time and how it ended. Might help before you decide: ${url}`
        : `Nobody has shared a ${co.name} experience on Ghosted yet. If you go through their process, adding yours anonymously would help the next person: ${url}`;
      return { name: co.name, slug: co.slug, stories: co.story_count, url, reply };
    });
    return c.json({ items });
  })
  // ================= you =================
  .get("/me/settings", async (c) => {
    const a = c.get("admin");
    const r = await mfaRow(a.id);
    const { data: sessions } = await db().from("admin_sessions").select("id, user_agent, created_at, last_used_at, expires_at, session_expires_at").eq("admin_id", a.id).is("revoked_at", null).order("created_at", { ascending: false }).limit(20);
    const live = ((sessions ?? []) as { id: string; user_agent: string | null; created_at: string; last_used_at: string | null; session_expires_at: string | null }[]).map((s) => ({ ...s, session_expires_at: s.session_expires_at ?? new Date(new Date(s.created_at).getTime() + 8 * 3600_000).toISOString() })).filter((s) => new Date(s.session_expires_at).getTime() > Date.now());
    return c.json({
      me: meDto({ ...a, mfa_method: r.mfa_method }), notify: r.notify, recoveryLeft: (unsealJson<string[]>(r.recovery_z) ?? []).length,
      sessions: live.map((s) => ({ current: s.id === c.get("adminSession"), device: s.user_agent ?? "Unknown browser", startedAt: s.created_at, lastUsedAt: s.last_used_at, endsAt: s.session_expires_at })),
      permissions: effective(a).map((p) => ({ id: p, label: PERMISSIONS[p] })),
    });
  })
  .patch("/me", validate("json", z.object({
    name: z.string().trim().min(1).max(60).optional(), avatarSeed: seed.optional(), tone: z.enum(["sassy", "calm"]).optional(), emailTheme: z.enum(["light", "dark"]).optional(),
    notify: z.object({ dailyBrief: z.boolean(), urgentReports: z.boolean(), newBugs: z.boolean(), donations: z.boolean(), teamChanges: z.boolean() }).partial().optional(),
  }).strict()), async (c) => {
    const b = c.req.valid("json");
    const a = c.get("admin");
    const patch: Record<string, unknown> = {};
    if (b.name) patch["name"] = b.name;
    if (b.avatarSeed) patch["avatar_seed"] = b.avatarSeed;
    if (b.tone) patch["tone"] = b.tone;
    if (b.emailTheme) patch["email_theme"] = b.emailTheme;
    if (b.notify) patch["notify"] = { ...(await mfaRow(a.id)).notify, ...b.notify };
    const { data, error } = await db().from("admin_users").update(patch).eq("id", a.id).select(`${ADMIN_COLS}, mfa_method`).single();
    if (error) dbFail("admin me update", error);
    await audit(c, "settings_update", {}, { fields: Object.keys(patch) });
    return c.json({ me: meDto(data as AdminUser & { mfa_method: string }) });
  })
  .post("/me/password", validate("json", z.object({ current: z.string().min(1).max(200), next: z.string().min(14, "Use at least 14 characters").max(200) }).strict()), async (c) => {
    const { current, next } = c.req.valid("json");
    await limitBy(`admin-pw:${c.get("admin").id}`, 5, 900, "Too many attempts. Wait 15 minutes.");
    await confirmPassword(c, current);
    if (/^(.)\1+$/.test(next) || next.toLowerCase().includes(c.get("admin").email.split("@")[0]!)) throw new ApiError(400, "weak_password", "Pick something harder to guess.", { next: "Too easy to guess" });
    await db().from("admin_users").update({ password_hash: await hashPassword(next) }).eq("id", c.get("admin").id);
    // Every other session ends; this one stays.
    await db().from("admin_sessions").update({ revoked_at: new Date().toISOString() }).eq("admin_id", c.get("admin").id).is("revoked_at", null).neq("id", c.get("adminSession"));
    await audit(c, "password_changed");
    return c.json({ ok: true });
  })
  .post("/me/sessions/revoke-all", async (c) => {
    await db().from("admin_sessions").update({ revoked_at: new Date().toISOString() }).eq("admin_id", c.get("admin").id).is("revoked_at", null).neq("id", c.get("adminSession"));
    await audit(c, "revoked_other_sessions");
    return c.json({ ok: true });
  })

  // ---------- two-step sign-in ----------
  .post("/me/mfa/totp/start", async (c) => {
    const a = c.get("admin");
    const secret = newSecret();
    await db().from("admin_users").update({ totp_pending_z: sealJson(secret) }).eq("id", a.id);
    return c.json({ secret, uri: otpauthUri(secret, `admin ${a.email}`) });
  })
  .post("/me/mfa/totp/confirm", validate("json", z.object({ code: z.string().regex(/^\d{6}$/) }).strict()), async (c) => {
    const a = c.get("admin");
    const r = await mfaRow(a.id);
    const secret = unsealJson<string>(r.totp_pending_z);
    const step = secret ? verifyTotp(secret, c.req.valid("json").code, null) : null;
    if (!secret || step === null) throw new ApiError(400, "mfa_invalid", "That code isn't right. Check the time on your phone and try the newest code.");
    await db().from("admin_users").update({ mfa_method: "totp", totp_secret_z: sealJson(secret), totp_pending_z: null, totp_last_step: step }).eq("id", a.id);
    await audit(c, "mfa_on", {}, { method: "totp" });
    return c.json({ recoveryCodes: await freshRecovery(a.id) });
  })
  .post("/me/mfa/email/start", async (c) => {
    await limitBy(`admin-mfa-setup:${c.get("admin").id}`, 4, 900, "A code was just sent. Check your inbox.");
    await sendAdminMfaCode(c.get("admin"), "mfa-setup");
    return c.json({ ok: true });
  })
  .post("/me/mfa/email/confirm", validate("json", z.object({ code: z.string().regex(/^\d{6}$/) }).strict()), async (c) => {
    const a = c.get("admin");
    await checkEmailCode({ id: a.id, ...(await mfaRow(a.id)) }, c.req.valid("json").code);
    await db().from("admin_users").update({ mfa_method: "email", totp_secret_z: null }).eq("id", a.id);
    await audit(c, "mfa_on", {}, { method: "email" });
    return c.json({ recoveryCodes: await freshRecovery(a.id) });
  })
  .post("/me/mfa/disable", validate("json", z.object({ password: z.string().min(1).max(200) }).strict()), async (c) => {
    await confirmPassword(c, c.req.valid("json").password);
    await db().from("admin_users").update({ mfa_method: "none", totp_secret_z: null, totp_pending_z: null, recovery_z: null }).eq("id", c.get("admin").id);
    await audit(c, "mfa_off");
    return c.json({ ok: true });
  })
  .post("/me/mfa/recovery", validate("json", z.object({ password: z.string().min(1).max(200) }).strict()), async (c) => {
    await confirmPassword(c, c.req.valid("json").password);
    const codes = await freshRecovery(c.get("admin").id);
    await audit(c, "mfa_recovery_regenerated");
    return c.json({ recoveryCodes: codes });
  })

  // ================= notifications (built from what's happening, filtered by your settings) =================
  .get("/notifications", async (c) => {
    const a = c.get("admin");
    const perms = effective(a);
    const r = await mfaRow(a.id);
    const { data: me } = await db().from("admin_users").select("notif_seen_at").eq("id", a.id).single();
    const seen = new Date((me as { notif_seen_at: string } | null)?.notif_seen_at ?? 0).getTime();
    const since = new Date(Date.now() - 7 * DAY).toISOString();
    type N = { kind: string; title: string; detail: string; at: string; go: string };
    const out: N[] = [];
    const jobs: Promise<void>[] = [];
    if (perms.includes("reports") && r.notify["urgentReports"] !== false) jobs.push((async () => {
      const { data } = await db().from("reports").select("reason, priority, created_at, story:stories(title)").eq("resolved", false).gte("priority", 70).gte("created_at", since).order("created_at", { ascending: false }).limit(15);
      for (const x of (data ?? []) as unknown as { reason: string; priority: number; created_at: string; story: { title: string } | null }[]) out.push({ kind: "report", title: `Urgent report: ${x.reason.replace(/_/g, " ")}`, detail: x.story?.title ?? "A story", at: x.created_at, go: "reports" });
    })());
    if (perms.includes("queue")) jobs.push((async () => {
      const { data } = await db().from("stories").select("title, created_at").eq("status", "pending").gte("created_at", since).order("created_at", { ascending: false }).limit(10);
      for (const x of (data ?? []) as { title: string; created_at: string }[]) out.push({ kind: "held", title: "Story held for review", detail: x.title, at: x.created_at, go: "queue" });
    })());
    if (perms.includes("feedback") && r.notify["newBugs"] !== false) jobs.push((async () => {
      const { data } = await db().from("feedback").select("kind, title, created_at").in("kind", ["bug", "feature"]).eq("status", "new").gte("created_at", since).order("created_at", { ascending: false }).limit(10);
      for (const x of (data ?? []) as { kind: string; title: string | null; created_at: string }[]) out.push({ kind: x.kind, title: x.kind === "bug" ? "New bug report" : "New feature idea", detail: x.title ?? "", at: x.created_at, go: "feedback" });
    })());
    if (perms.includes("donations") && r.notify["donations"]) jobs.push((async () => {
      const { data } = await db().from("donations").select("amount_paise, paid_at").eq("status", "paid").gte("paid_at", since).order("paid_at", { ascending: false }).limit(10);
      for (const x of (data ?? []) as { amount_paise: number; paid_at: string }[]) out.push({ kind: "donation", title: "New donation", detail: `₹${(x.amount_paise / 100).toLocaleString("en-IN")}`, at: x.paid_at, go: "donations" });
    })());
    if (r.notify["teamChanges"] !== false) jobs.push((async () => {
      const { data } = await db().from("admin_audit").select("admin_name, action, target_ref, created_at").like("action", "team_%").gte("created_at", since).order("id", { ascending: false }).limit(10);
      for (const x of (data ?? []) as { admin_name: string | null; action: string; target_ref: string | null; created_at: string }[]) out.push({ kind: "team", title: `${x.admin_name ?? "Someone"}: ${x.action.replace(/^team_/, "").replace(/_/g, " ")}`, detail: x.target_ref ?? "", at: x.created_at, go: "team" });
    })());
    await Promise.all(jobs);
    out.sort((x, y) => y.at.localeCompare(x.at));
    const items = out.slice(0, 30).map((n) => ({ ...n, unread: new Date(n.at).getTime() > seen }));
    return c.json({ items, unread: items.filter((i) => i.unread).length });
  })
  .post("/notifications/seen", async (c) => {
    await db().from("admin_users").update({ notif_seen_at: new Date().toISOString() }).eq("id", c.get("admin").id);
    return c.json({ ok: true });
  })

  // ================= the team =================
  .get("/team", async (c) => {
    const { data, error } = await db().from("admin_users").select("name, email, role, active, permissions, avatar_seed, from_env, disabled_at, disabled_by, mfa_method, password_hash, last_login_at, created_at, added_by").order("created_at");
    if (error) dbFail("admin team", error);
    const canSeeEmail = effective(c.get("admin")).includes("team");
    return c.json({
      roles: Object.fromEntries(ROLES.map((r) => [r, ROLE_DEFAULTS[r]])), permissions: ALL.map((p) => ({ id: p, label: PERMISSIONS[p] })),
      items: ((data ?? []) as (Record<string, unknown> & { email: string; role: Role; permissions: string[] | null; password_hash: string | null })[]).map((u) => ({
        name: u["name"], email: canSeeEmail || u.email === c.get("admin").email ? u.email : null, role: u.role, custom: !!u.permissions, permissions: effective(u),
        avatarSeed: u["avatar_seed"], fromEnv: u["from_env"], active: u["active"], disabled: !!u["disabled_at"], disabledBy: u["disabled_by"] ?? null,
        mfa: u["mfa_method"] !== "none", ready: !!u.password_hash, lastLoginAt: u["last_login_at"], addedBy: u["added_by"] ?? null, you: u.email === c.get("admin").email,
      })),
    });
  })
  .post("/team", validate("json", z.object({ email: z.string().trim().toLowerCase().email().max(120), name: z.string().trim().min(1).max(60), role: z.enum(ROLES) }).strict()), async (c) => {
    const b = c.req.valid("json");
    const me = c.get("admin");
    if (b.role === "owner" && !isOwner(me)) throw new ApiError(403, "owner_only", "Only an owner can add another owner.");
    const { data: existing } = await db().from("admin_users").select("id, active").eq("email", b.email).maybeSingle();
    if (existing && (existing as { active: boolean }).active) throw new ApiError(409, "exists", "That person is already on the team.");
    const row = { email: b.email, name: b.name, role: b.role, active: true, from_env: false, added_by: me.name, avatar_seed: b.email.split("@")[0]!.replace(/[^a-z0-9-]/g, "").slice(0, 60) || "admin", disabled_at: null };
    const { error } = existing ? await db().from("admin_users").update(row).eq("id", (existing as { id: string }).id) : await db().from("admin_users").insert({ ...row, password_hash: null });
    if (error) dbFail("add admin", error);
    await audit(c, "team_added", { kind: "admin", ref: b.email }, { role: b.role });
    return c.json({ ok: true, message: `${b.name} is on the team. They open the panel and choose “First time here” to set a password.` }, 201);
  })
  .patch("/team/:email", validate("param", z.object({ email: z.string().toLowerCase().email().max(120) })), validate("json", z.object({
    role: z.enum(ROLES).optional(), permissions: z.array(z.enum(ALL as [Permission, ...Permission[]])).max(ALL.length).nullable().optional(), disabled: z.boolean().optional(),
  }).strict()), async (c) => {
    const { email } = c.req.valid("param");
    const b = c.req.valid("json");
    const me = c.get("admin");
    const { data } = await db().from("admin_users").select("id, role, from_env, name").eq("email", email).maybeSingle();
    const t = data as { id: string; role: Role; from_env: boolean; name: string } | null;
    if (!t) throw new ApiError(404, "not_found", "No admin with that email.");
    if (email === me.email) throw new ApiError(400, "self", "You can't change your own access. Ask another owner.");
    if (t.role === "owner" && !isOwner(me)) throw new ApiError(403, "owner_only", "Only an owner can change another owner.");
    if (b.role && t.from_env) throw new ApiError(400, "env_role", "This person's role comes from ADMIN_EMAILS on the server. Change it there.");
    if (b.role === "owner" && !isOwner(me)) throw new ApiError(403, "owner_only", "Only an owner can make someone an owner.");
    if (b.permissions?.includes("team") && !isOwner(me)) throw new ApiError(403, "owner_only", "Only an owner can hand out team access.");
    const patch: Record<string, unknown> = {};
    if (b.role) patch["role"] = b.role;
    if (b.permissions !== undefined) patch["permissions"] = b.permissions;
    if (b.disabled !== undefined) Object.assign(patch, b.disabled ? { disabled_at: new Date().toISOString(), disabled_by: me.name } : { disabled_at: null, disabled_by: null });
    const { error } = await db().from("admin_users").update(patch).eq("id", t.id);
    if (error) dbFail("update admin", error);
    if (b.disabled) await db().from("admin_sessions").update({ revoked_at: new Date().toISOString() }).eq("admin_id", t.id).is("revoked_at", null);
    await audit(c, b.disabled === true ? "team_sign_in_off" : b.disabled === false ? "team_sign_in_on" : "team_access_changed", { kind: "admin", ref: email }, b);
    return c.json({ ok: true });
  })
  .post("/team/:email/sign-out", validate("param", z.object({ email: z.string().toLowerCase().email().max(120) })), async (c) => {
    const { email } = c.req.valid("param");
    const { data } = await db().from("admin_users").select("id, role").eq("email", email).maybeSingle();
    if (!data) throw new ApiError(404, "not_found", "No admin with that email.");
    if ((data as { role: Role }).role === "owner" && !isOwner(c.get("admin"))) throw new ApiError(403, "owner_only", "Only an owner can sign out another owner.");
    await db().from("admin_sessions").update({ revoked_at: new Date().toISOString() }).eq("admin_id", (data as { id: string }).id).is("revoked_at", null);
    await audit(c, "team_signed_out", { kind: "admin", ref: email });
    return c.json({ ok: true });
  })
  .delete("/team/:email", validate("param", z.object({ email: z.string().toLowerCase().email().max(120) })), async (c) => {
    const { email } = c.req.valid("param");
    const { data } = await db().from("admin_users").select("id, role, from_env").eq("email", email).maybeSingle();
    const t = data as { id: string; role: Role; from_env: boolean } | null;
    if (!t) throw new ApiError(404, "not_found", "No admin with that email.");
    if (email === c.get("admin").email) throw new ApiError(400, "self", "You can't remove yourself.");
    if (t.from_env) throw new ApiError(400, "env_admin", "This person is listed in ADMIN_EMAILS. Take them out there, or switch their sign-in off here.");
    if (t.role === "owner" && !isOwner(c.get("admin"))) throw new ApiError(403, "owner_only", "Only an owner can remove an owner.");
    await db().from("admin_users").update({ active: false }).eq("id", t.id);
    await db().from("admin_sessions").update({ revoked_at: new Date().toISOString() }).eq("admin_id", t.id).is("revoked_at", null);
    await audit(c, "team_removed", { kind: "admin", ref: email });
    return c.json({ ok: true });
  })

  // ================= platform switches =================
  .get("/platform", async (c) => {
    const p = await platform(true);
    const [{ data }, { data: hist }] = await Promise.all([
      db().from("platform_settings").select("key, updated_by, updated_at"),
      db().from("admin_audit").select("id, admin_name, detail, created_at, admin:admin_users(name, avatar_seed)").eq("action", "platform_update").order("id", { ascending: false }).limit(100),
    ]);
    // Every change ever made, newest first: who, when, and exactly what was set.
    const history = ((hist ?? []) as unknown as { id: number; admin_name: string | null; detail: Record<string, unknown> | null; created_at: string; admin: { name: string; avatar_seed: string } | null }[]).map((h) => ({ id: h.id, who: h.admin_name ?? h.admin?.name ?? "Someone", avatarSeed: h.admin?.avatar_seed ?? null, at: h.created_at, changes: h.detail ?? {} }));
    return c.json({ settings: p, defaults: DEFAULTS, history, changed: Object.fromEntries(((data ?? []) as { key: string; updated_by: string | null; updated_at: string }[]).map((r) => [r.key, { by: r.updated_by, at: r.updated_at }])) });
  })
  .patch("/platform", validate("json", PLATFORM_SCHEMA), async (c) => {
    const b = c.req.valid("json") as Partial<Platform>;
    const entries = Object.entries(b);
    if (!entries.length) return c.json({ settings: await platform() });
    // "Nothing" (taking the announcement down) removes the row, so the default applies again.
    const cleared = entries.filter(([, v]) => v === null).map(([k]) => k);
    const rows = entries.filter(([, v]) => v !== null).map(([key, value]) => ({ key, value: value as unknown, updated_by: c.get("admin").name, updated_at: new Date().toISOString() }));
    if (cleared.length) { const { error } = await db().from("platform_settings").delete().in("key", cleared); if (error) dbFail("platform settings", error); }
    if (rows.length) { const { error } = await db().from("platform_settings").upsert(rows, { onConflict: "key" }); if (error) dbFail("platform settings", error); }
    await audit(c, "platform_update", {}, b as Record<string, unknown>);
    await bump({ shared: ["platform"] });
    return c.json({ settings: await platform(true) });
  })
  .get("/goofy", async (c) => {
    const since24 = new Date(Date.now() - DAY).toISOString(), since7 = new Date(Date.now() - 7 * DAY).toISOString();
    const [{ data: actions }, { data: runs }, { data: recent }, { data: terms }] = await Promise.all([
      db().from("goofy_actions").select("action, created_at").gte("created_at", since7).limit(50000),
      db().from("automation_runs").select("job, last_run, stats").in("job", ["refresh_lists", "learn", "sweep", "goofy_weekly", "goofy_daily"]),
      db().from("goofy_actions").select("public_id, action, target_kind, story_public_id, company_slug, reason, created_at").order("created_at", { ascending: false }).limit(20),
      db().from("moderation_terms").select("tier, status").limit(30000),
    ]);
    const count = (since: string) => { const out: Record<string, number> = {}; for (const x of (actions ?? []) as { action: string; created_at: string }[]) if (x.created_at >= since) out[x.action] = (out[x.action] ?? 0) + 1; return out; };
    const termCounts: Record<string, number> = {}; for (const x of (terms ?? []) as { tier: string; status: string }[]) termCounts[`${x.status}:${x.tier}`] = (termCounts[`${x.status}:${x.tier}`] ?? 0) + 1;
    return c.json({ controls: await goofyControls(true), activity24h: count(since24), activity7d: count(since7), runs: runs ?? [], recent: recent ?? [], termCounts });
  })
  .patch("/goofy", validate("json", GOOFY_SCHEMA), async (c) => {
    const controls = { ...(await goofyControls(true)), ...c.req.valid("json") };
    const now = new Date().toISOString();
    const { error } = await db().from("platform_settings").upsert({ key: "goofy", value: controls, updated_by: c.get("admin").name, updated_at: now }, { onConflict: "key" });
    if (error) dbFail("Goofy controls", error);
    await audit(c, "goofy_controls_update", { kind: "automation", ref: "goofy" }, c.req.valid("json"));
    return c.json({ controls: await goofyControls(true) });
  })
  .post("/goofy/run/:job", validate("param", z.object({ job: z.enum(["refresh_lists", "learn", "sweep"]) })), async (c) => {
    const job = c.req.valid("param").job;
    const controls = await goofyControls();
    if (!controls.enabled) throw new ApiError(409, "goofy_paused", "Goofy is paused. Turn on his master control before running a job.");
    if (job === "refresh_lists" && !controls.refreshWordLists) throw new ApiError(409, "job_disabled", "Word-list refresh is switched off in Goofy's controls.");
    if (job === "learn" && !controls.learnFromOutcomes) throw new ApiError(409, "job_disabled", "Learning from outcomes is switched off in Goofy's controls.");
    if (job === "sweep" && !controls.queueSweep) throw new ApiError(409, "job_disabled", "Held-queue review is switched off in Goofy's controls.");
    const result = job === "refresh_lists" ? await refreshLists() : job === "learn" ? await learn() : await sweep();
    await audit(c, "goofy_job_run", { kind: "automation", ref: job }, { job });
    return c.json({ ok: true, result });
  })

  // ================= members =================
  .get("/members", validate("query", z.object({ q: z.string().trim().max(60).optional(), filter: z.enum(["all", "banned", "paused", "new"]).default("all"), offset: offsetQ })), async (c) => {
    const { q, filter, offset } = c.req.valid("query");
    let query = db().from("profiles").select("public_id, handle, avatar_seed, pastel, created_at, posting_paused_until, banned_at, banned_until").eq("kind", "person").order("created_at", { ascending: false }).order("public_id").range(offset, offset + PAGE);
    if (q && /^\d{15}$/.test(q)) query = query.eq("public_id", q);
    else if (q) query = query.ilike("handle", `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`);
    if (filter === "banned") query = query.not("banned_at", "is", null);
    if (filter === "paused") query = query.gt("posting_paused_until", new Date().toISOString());
    if (filter === "new") query = query.gte("created_at", new Date(Date.now() - 7 * DAY).toISOString());
    const { data, error } = await query;
    if (error) dbFail("admin members", error);
    return c.json(paged(((data ?? []) as { public_id: number; handle: string; avatar_seed: string; pastel: string; created_at: string; posting_paused_until: string | null; banned_at: string | null; banned_until: string | null }[]).map((m) => ({ publicId: String(m.public_id), handle: m.handle, avatarSeed: m.avatar_seed, pastel: m.pastel, joinedAt: m.created_at, status: statusOf(m) })), offset));
  })
  .get("/members/:publicId", validate("param", z.object({ publicId: pid })), async (c) => {
    const m = await member(c.req.valid("param").publicId);
    const a = c.get("admin");
    const n = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0);
    const [published, held, hidden, chitchats, reported, strikes, recent, devices] = await Promise.all([
      n(db().from("stories").select("id", { count: "exact", head: true }).eq("author_id", m.id).eq("status", "published")),
      n(db().from("stories").select("id", { count: "exact", head: true }).eq("author_id", m.id).eq("status", "pending")),
      n(db().from("stories").select("id", { count: "exact", head: true }).eq("author_id", m.id).eq("status", "hidden")),
      n(db().from("comments").select("id", { count: "exact", head: true }).eq("author_id", m.id)),
      db().from("stories").select("id").eq("author_id", m.id).limit(1000).then(async (r) => { const ids = ((r.data ?? []) as { id: string }[]).map((x) => x.id); return ids.length ? n(db().from("reports").select("id", { count: "exact", head: true }).in("story_id", ids)) : 0; }),
      n(db().from("goofy_actions").select("id", { count: "exact", head: true }).eq("user_id", m.id).in("action", ["removed_story", "removed_chitchat", "took_down"]).gte("created_at", new Date(Date.now() - 30 * DAY).toISOString())),
      db().from("stories").select("public_id, title, status, created_at, company:companies(name)").eq("author_id", m.id).order("created_at", { ascending: false }).limit(6),
      db().from("session_devices").select("kind, browser, os, city, region, country, ip_masked, ip_hash, last_seen_at").eq("user_id", m.id).order("last_seen_at", { ascending: false }).limit(12),
    ]);
    const bans = await ipBans(true);
    const priv = effective(a).includes("private");
    let privateInfo: { email: string | null; name: string | null; details: Record<string, unknown> } | null = null;
    if (priv) {
      const details = (() => { try { return unsealBytea(m.details_z) as Record<string, unknown>; } catch { return {}; } })();
      privateInfo = { email: await emailOfMember(m.id).catch(() => null), name: (details["name"] as string | undefined) ?? null, details };
      // One entry per admin per member every 15 minutes, not one per refresh.
      const { data: recentLook } = await db().from("admin_audit").select("id").eq("admin_id", a.id).eq("action", "member_private_viewed").eq("target_ref", String(m.public_id)).gte("created_at", new Date(Date.now() - 15 * 60_000).toISOString()).limit(1);
      if (!recentLook?.length) await audit(c, "member_private_viewed", { kind: "profile", ref: m.public_id });
    }
    return c.json({
      publicId: String(m.public_id), handle: m.handle, avatarSeed: m.avatar_seed, pastel: m.pastel, joinedAt: m.created_at, tone: m.tone, status: statusOf(m),
      pausedUntil: m.posting_paused_until, ban: m.banned_at ? { at: m.banned_at, until: m.banned_until, reason: m.ban_reason } : null,
      stats: { published, held, hidden, chitchats, reported, strikes30d: strikes },
      recent: ((recent.data ?? []) as unknown as { public_id: number; title: string; status: string; created_at: string; company: { name: string } | null }[]).map((s) => ({ publicId: String(s.public_id), title: s.title, status: s.status, at: s.created_at, company: s.company?.name ?? null })),
      // Devices only with the "private" permission; the IP is masked and its keyed hash is the ban handle.
      devices: priv ? ((devices.data ?? []) as { kind: string; browser: string; os: string; city: string | null; region: string | null; country: string | null; ip_masked: string | null; ip_hash: string | null; last_seen_at: string }[]).map((d) => ({ kind: d.kind, browser: d.browser, os: d.os, place: [d.city, d.region, d.country].filter(Boolean).join(", ") || null, ip: d.ip_masked, ipRef: d.ip_hash, ipBanned: !!d.ip_hash && bans.has(d.ip_hash), lastSeenAt: d.last_seen_at })) : null,
      private: privateInfo, canBan: effective(a).includes("ban"), canSeePrivate: priv,
    });
  })
  .post("/members/:publicId/pause", validate("param", z.object({ publicId: pid })), validate("json", z.object({ days: z.number().int().min(0).max(365), reason: z.string().trim().max(300).optional() }).strict()), async (c) => {
    need(c.get("admin"), "ban");
    const m = await member(c.req.valid("param").publicId);
    const { days, reason } = c.req.valid("json");
    await db().from("profiles").update({ posting_paused_until: days ? new Date(Date.now() + days * DAY).toISOString() : null }).eq("id", m.id);
    await addNotification(m.id, "system", days ? `A moderator paused posting on your account for ${days} day${days === 1 ? "" : "s"}${reason ? `: ${reason}` : "."} You can still read and react.` : "Posting on your account is back on. Welcome back.");
    await audit(c, days ? "member_paused" : "member_unpaused", { kind: "profile", ref: m.public_id }, { days, reason });
    return c.json({ ok: true });
  })
  .post("/members/:publicId/ban", validate("param", z.object({ publicId: pid })), validate("json", z.object({ days: z.number().int().min(1).max(3650).nullable(), reason: z.string().trim().min(3).max(300), hideContent: z.boolean().default(false), banIps: z.boolean().default(false) }).strict()), async (c) => {
    need(c.get("admin"), "ban");
    const m = await member(c.req.valid("param").publicId);
    if (m.kind === "bot") throw new ApiError(400, "bot", "Goofy can't be banned. He'd only find a way back.");
    const { days, reason, hideContent, banIps } = c.req.valid("json");
    const until = days ? new Date(Date.now() + days * DAY).toISOString() : null;
    const { error } = await db().from("profiles").update({ banned_at: new Date().toISOString(), banned_until: until, ban_reason: reason }).eq("id", m.id);
    if (error) dbFail("ban (run supabase/init_database.sql on a fresh project)", error);
    if (hideContent) {
      await db().from("stories").update({ status: "hidden" }).eq("author_id", m.id).in("status", ["published", "pending"]);
      await db().from("comments").update({ status: "removed" }).eq("author_id", m.id).in("status", ["published", "pending"]);
    }
    let ips = 0;
    if (banIps) {
      const { data } = await db().from("session_devices").select("ip_hash, ip_masked").eq("user_id", m.id).not("ip_hash", "is", null);
      const rows = [...new Map(((data ?? []) as { ip_hash: string; ip_masked: string | null }[]).map((d) => [d.ip_hash, d])).values()];
      if (rows.length) await db().from("ip_bans").upsert(rows.map((d) => ({ ip_hash: d.ip_hash, ip_masked: d.ip_masked, reason, user_ref: m.public_id, banned_by: c.get("admin").name, expires_at: until })), { onConflict: "ip_hash" });
      ips = rows.length;
      await ipBans(true);
    }
    // Their devices are signed out: every session record goes, and the ban blocks any token left.
    await db().from("session_devices").delete().eq("user_id", m.id);
    await bump({ shared: ["feed"] });
    await audit(c, "member_banned", { kind: "profile", ref: m.public_id }, { days, reason, hideContent, ips });
    return c.json({ ok: true, ips });
  })
  .post("/members/:publicId/unban", validate("param", z.object({ publicId: pid })), validate("json", z.object({ restoreContent: z.boolean().default(false), liftIps: z.boolean().default(true) }).strict()), async (c) => {
    need(c.get("admin"), "ban");
    const m = await member(c.req.valid("param").publicId);
    const { restoreContent, liftIps } = c.req.valid("json");
    await db().from("profiles").update({ banned_at: null, banned_until: null, ban_reason: null }).eq("id", m.id);
    if (restoreContent) await db().from("stories").update({ status: "published" }).eq("author_id", m.id).eq("status", "hidden");
    if (liftIps) { await db().from("ip_bans").delete().eq("user_ref", m.public_id); await ipBans(true); }
    await addNotification(m.id, "system", "Your account has been restored. Welcome back.");
    await audit(c, "member_unbanned", { kind: "profile", ref: m.public_id }, { restoreContent, liftIps });
    return c.json({ ok: true });
  })

  // ================= IP bans =================
  .get("/ip-bans", validate("query", z.object({ offset: offsetQ })), async (c) => {
    const { offset } = c.req.valid("query");
    const { data, error } = await db().from("ip_bans").select("ip_hash, ip_masked, reason, user_ref, banned_by, expires_at, created_at").order("created_at", { ascending: false }).range(offset, offset + PAGE);
    if (error) dbFail("ip bans (run supabase/init_database.sql on a fresh project)", error);
    return c.json(paged(((data ?? []) as { ip_hash: string; ip_masked: string | null; reason: string | null; user_ref: number | null; banned_by: string; expires_at: string | null; created_at: string }[]).map((b) => ({ ref: b.ip_hash, ip: b.ip_masked, reason: b.reason, member: b.user_ref ? String(b.user_ref) : null, by: b.banned_by, until: b.expires_at, at: b.created_at })), offset));
  })
  .post("/ip-bans", validate("json", z.object({ ref: z.string().regex(/^[0-9a-f]{16,64}$/), reason: z.string().trim().min(3).max(300), days: z.number().int().min(1).max(3650).nullable(), member: pid.optional() }).strict()), async (c) => {
    const b = c.req.valid("json");
    const { data } = await db().from("session_devices").select("ip_masked").eq("ip_hash", b.ref).limit(1).maybeSingle();
    if (!data) throw new ApiError(404, "not_found", "That connection isn't one we've seen.");
    await db().from("ip_bans").upsert({ ip_hash: b.ref, ip_masked: (data as { ip_masked: string | null }).ip_masked, reason: b.reason, user_ref: b.member ?? null, banned_by: c.get("admin").name, expires_at: b.days ? new Date(Date.now() + b.days * DAY).toISOString() : null }, { onConflict: "ip_hash" });
    await ipBans(true);
    await audit(c, "ip_banned", { kind: "ip", ref: (data as { ip_masked: string | null }).ip_masked ?? b.ref.slice(0, 12) }, { reason: b.reason, days: b.days, member: b.member });
    return c.json({ ok: true }, 201);
  })
  .delete("/ip-bans/:ref", validate("param", z.object({ ref: z.string().regex(/^[0-9a-f]{16,64}$/) })), async (c) => {
    const { ref } = c.req.valid("param");
    await db().from("ip_bans").delete().eq("ip_hash", ref);
    await ipBans(true);
    await audit(c, "ip_unbanned", { kind: "ip", ref: ref.slice(0, 12) });
    return c.json({ ok: true });
  })

  // ================= emails to members =================
  .get("/mail/templates", (c) => c.json({ items: Object.entries(MEMBER_TEMPLATES).map(([id, t]) => ({ id, label: t.label, description: t.description })) }))
  .post("/mail/preview", validate("json", z.object({ template: z.enum(Object.keys(MEMBER_TEMPLATES) as [MemberTemplate, ...MemberTemplate[]]), member: pid.optional(), tone: z.enum(["sassy", "calm"]).optional(), note: z.string().max(3000).optional(), subject: z.string().max(120).optional() }).strict()), async (c) => {
    const b = c.req.valid("json");
    const m = b.member ? await member(b.member) : null;
    const mail = memberEmail({ template: b.template, handle: m?.handle ?? "there", tone: b.tone ?? m?.tone ?? "sassy", appUrl: env().FRONTEND_URL, note: b.note, subject: b.subject });
    // The preview shows the embedded logo as plain text (cid: images only exist inside the email).
    return c.json({ subject: mail.subject, html: mail.html.replace(/<img src="cid:[^"]+"[^>]*>/, "") });
  })
  .post("/mail/send", validate("json", z.object({ template: z.enum(Object.keys(MEMBER_TEMPLATES) as [MemberTemplate, ...MemberTemplate[]]), member: pid, tone: z.enum(["sassy", "calm"]).optional(), note: z.string().max(3000).optional(), subject: z.string().max(120).optional() }).strict()), async (c) => {
    const b = c.req.valid("json");
    if (b.template === "custom" && !b.note?.trim()) throw new ApiError(400, "empty", "Write the message first.", { note: "Write the message" });
    await limitBy(`admin-mail:${c.get("admin").id}`, 30, 3600, "That's a lot of emails in an hour. Wait a bit.");
    const m = await member(b.member);
    const mail = memberEmail({ template: b.template, handle: m.handle, tone: b.tone ?? m.tone, appUrl: env().FRONTEND_URL, note: b.note, subject: b.subject });
    try { await sendMail(await emailOfMember(m.id), mail, { theme: m.email_theme ?? "light" }); }
    catch (e) { if (e instanceof ApiError) throw e; console.error("[admin] member mail", (e as Error).message); throw new ApiError(502, "mail_failed", "Couldn't send the email. Check the API's mail settings."); }
    await audit(c, "member_emailed", { kind: "profile", ref: m.public_id }, { template: b.template, subject: mail.subject });
    return c.json({ ok: true, message: `Sent “${mail.subject}” to ${m.handle}.` });
  });
