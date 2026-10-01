// The admin API (/v1/admin/*), used only by the separate admin app (admin/). Every route except
// sign-in sits behind requireAdmin (admin-auth.ts): allowed origin + live admin session, else 404.
// Every change is written to the append-only audit log.
//
// Privacy: moderators see what was posted and how the platform judged it, never who posted it
// beyond the public handle and 15-digit id. No emails, no real names, no IPs.
import { Hono } from "hono";
import { z } from "zod";
import { ApiError, dbFail } from "../errors.js";
import { randomInt } from "node:crypto";
import { ADMIN_COLS, adminOrigin, audit, burnTime, checkPassword, hashPassword, requireAdmin, rotateSession, sha256, syncAdminsFromEnv, type AdminEnv, type AdminUser } from "../admin-auth.js";
import { checkAdminSecondFactor, finishLogin, MFA_COLS, meDto, sendAdminMfaCode, type MfaRow } from "../admin-mfa.js";
import { need, type Permission } from "../admin-perms.js";
import { sealJson, unsealJson } from "../lib/sealed.js";
import { adminExtraRoutes } from "./admin-extra.js";
import { platform } from "../platform.js";
import { sendMail } from "../mail/mailer.js";
import { otpEmail } from "../mail/otp-email.js";
import { env } from "../env.js";
import { verifyChallenge } from "../captcha.js";
import { limitBy, ipKey } from "../security.js";
import { admin as db } from "../supabase.js";
import { validate } from "../validate.js";
import { fromBytea, toBytea } from "../lib/compression.js";
import { findPii } from "../algorithms/pii.js";
import { addNotification } from "../notify.js";
import { bump } from "../live.js";
import { loadLive } from "../automation.js";

const DAY = 86400_000;
// A random id the panel keeps in this browser, so signing in again replaces the old session.
const DEVICE = z.string().regex(/^[A-Za-z0-9-]{16,64}$/).optional();
const text = (z_: string | null | undefined) => { if (!z_) return ""; try { return fromBytea(z_); } catch { return ""; } };
const handleOf = (p: { handle?: string; public_id?: number } | null | undefined) => (p ? { handle: p.handle ?? "Former member", publicId: p.public_id ? String(p.public_id) : null } : { handle: "Former member", publicId: null });
const redactNames = (s: string) => { let out = s; for (const h of findPii(s).filter((x) => x.kind === "person").reverse()) out = out.slice(0, h.index) + h.text.replace(/[A-Z][a-z]+(\s+[A-Z][a-z]+)?$/, "[name]") + out.slice(h.index + h.text.length); return out; };
const owner = (a: AdminUser) => { if (a.role !== "owner") throw new ApiError(403, "owner_only", "Only the owner can do that."); };

export const adminRoutes = new Hono<AdminEnv>()
  // ---------- sign-in ----------
  .post("/login", adminOrigin, validate("json", z.object({ email: z.string().trim().toLowerCase().email().max(120), password: z.string().min(1).max(200), captchaToken: z.string().max(12000), device: DEVICE }).strict()), async (c) => {
    await limitBy(`admin-login:ip:${ipKey(c)}`, 10, 900, "Too many attempts. Wait 15 minutes and try again.");
    const { email, password, captchaToken } = c.req.valid("json");
    await verifyChallenge(c, captchaToken);
    await syncAdminsFromEnv();
    const wrong = new ApiError(401, "bad_credentials", "That email and password don't match. First time here? Use “Set your password” below.");
    const { data } = await db().from("admin_users").select(`${ADMIN_COLS}, password_hash, failed_attempts, locked_until, mfa_method`).eq("email", email).maybeSingle();
    const u = data as (AdminUser & { password_hash: string | null; failed_attempts: number; locked_until: string | null; mfa_method: "none" | "totp" | "email" }) | null;
    // Unknown email, or an admin who hasn't set a password yet: same answer, same time taken.
    if (!u || !u.password_hash) { await burnTime(password); throw wrong; }
    if (u.locked_until && new Date(u.locked_until).getTime() > Date.now()) throw new ApiError(423, "locked", "Too many wrong passwords. This account is locked for a few minutes.");
    if (!u.active || u.disabled_at || !(await checkPassword(password, u.password_hash))) {
      const n = (u.failed_attempts ?? 0) + 1;
      await db().from("admin_users").update({ failed_attempts: n >= 5 ? 0 : n, ...(n >= 5 && { locked_until: new Date(Date.now() + 15 * 60_000).toISOString() }) }).eq("id", u.id);
      throw wrong;
    }
    await db().from("admin_users").update({ failed_attempts: 0, locked_until: null }).eq("id", u.id);
    // Two-step sign-in: no session yet, just a sealed 5-minute ticket for the second step.
    if (u.mfa_method !== "none") {
      if (u.mfa_method === "email") await sendAdminMfaCode(u);
      return c.json({ mfaRequired: true, method: u.mfa_method, ticket: sealJson({ aid: u.id, exp: Date.now() + 5 * 60_000, dev: c.req.valid("json").device ?? null }).slice(2) });
    }
    return finishLogin(c, u, c.req.valid("json").device);
  })

  .post("/login/mfa", adminOrigin, validate("json", z.object({ ticket: z.string().min(40).max(4000).regex(/^[0-9a-f]+$/), code: z.string().trim().min(6).max(12) }).strict()), async (c) => {
    await limitBy(`admin-mfa:ip:${ipKey(c)}`, 15, 900, "Too many attempts. Wait 15 minutes and try again.");
    const { ticket, code } = c.req.valid("json");
    let t: { aid: string; exp: number; dev?: string | null } | null = null;
    try { t = unsealJson<{ aid: string; exp: number; dev?: string | null }>(`\\x${ticket}`); } catch { t = null; }
    if (!t || t.exp < Date.now()) throw new ApiError(401, "ticket_expired", "That took a while. Sign in again.");
    const { data } = await db().from("admin_users").select(`${ADMIN_COLS}, ${MFA_COLS}`).eq("id", t.aid).maybeSingle();
    const u = data as (AdminUser & MfaRow) | null;
    if (!u || !u.active || u.disabled_at) throw new ApiError(401, "ticket_expired", "Sign in again.");
    await checkAdminSecondFactor(u, code);
    return finishLogin(c, u, t.dev ?? null);
  })

  // A fresh access token for a refresh token (rotated every time). Anything off looks like a 404.
  .post("/refresh", adminOrigin, validate("json", z.object({ refreshToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict()), async (c) => {
    await limitBy(`admin-refresh:ip:${ipKey(c)}`, 120, 900, "Too many requests.");
    const next = await rotateSession(c, c.req.valid("json").refreshToken);
    if (!next) return c.json({ error: { code: "not_found", message: "No such endpoint." } }, 404);
    c.header("Cache-Control", "no-store");
    return c.json(next);
  })

  // ---------- set (or reset) your password with an emailed code ----------
  // Step 1: any email gets the same answer; only admins listed in ADMIN_EMAILS (or made with
  // admin:create) actually receive a code. 6 digits, hashed, 15 minutes, 5 tries.
  .post("/setup/start", adminOrigin, validate("json", z.object({ email: z.string().trim().toLowerCase().email().max(120), captchaToken: z.string().max(12000), theme: z.enum(["light", "dark"]).optional() }).strict()), async (c) => {
    await limitBy(`admin-setup:ip:${ipKey(c)}`, 6, 900, "Too many requests. Wait 15 minutes and try again.");
    const { email, captchaToken, theme } = c.req.valid("json");
    await verifyChallenge(c, captchaToken);
    // Same as the main app: only team emails (ADMIN_EMAILS, or added from the Team page) get anywhere.
    try { await syncAdminsFromEnv(true); } catch (e) { console.error("[admin] sync", (e as Error).message); }
    const { data, error } = await db().from("admin_users").select("id, name, active, disabled_at, tone").eq("email", email).maybeSingle();
    if (error) { console.error("[admin] setup lookup", error.message); throw new ApiError(500, "admin_db", /column/.test(error.message) ? "The admin tables are out of date. Initialize a fresh database with supabase/init_database.sql, then try again." : "Couldn't read the admin list. Try again in a minute."); }
    const u = data as { id: string; name: string; active: boolean; disabled_at: string | null; tone: "sassy" | "calm" } | null;
    if (u?.disabled_at) throw new ApiError(403, "disabled", "Sign-in for this admin has been switched off by an owner.");
    if (!u?.active) throw new ApiError(403, "not_admin", "That email isn't on the admin team.", { email: "That email isn't on the admin team" });
    {
      await limitBy(`admin-setup:email:${email}`, 3, 900, "A code was just sent. Check your inbox (and spam), or wait a few minutes.");
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const { error: saveErr } = await db().from("admin_users").update({ setup_code_hash: sha256(`${u.id}:${code}`), setup_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(), setup_attempts: 0 }).eq("id", u.id);
      if (saveErr) { console.error("[admin] setup save", saveErr.message); throw new ApiError(500, "admin_db", "The admin tables are out of date. Initialize a fresh database with supabase/init_database.sql, then try again."); }
      // The same themed template as the site's codes, in the panel's current light/dark theme.
      const mail = otpEmail({ purpose: "admin", code, name: u.name, appUrl: env().FRONTEND_URL, minutes: 15 });
      try { await sendMail(email, mail, { theme: theme ?? "light" }); }
      catch (e) { console.error("[admin] setup mail", (e as Error).message); throw new ApiError(502, "mail_failed", "Couldn't send the email. Check the API's mail settings and try again."); }
    }
    return c.json({ ok: true, message: `A 6-digit code is on its way to ${email}.` });
  })

  // Step 2: the code + the new password. Ends every existing session for that admin.
  .post("/setup/finish", adminOrigin, validate("json", z.object({ email: z.string().trim().toLowerCase().email().max(120), code: z.string().regex(/^\d{6}$/), password: z.string().min(14, "Use at least 14 characters").max(200) }).strict()), async (c) => {
    await limitBy(`admin-setup-finish:ip:${ipKey(c)}`, 15, 900, "Too many attempts. Wait 15 minutes and try again.");
    const { email, code, password } = c.req.valid("json");
    const bad = new ApiError(400, "bad_code", "That code isn't right or has expired. Ask for a new one.");
    const { data } = await db().from("admin_users").select("id, name, active, setup_code_hash, setup_expires_at, setup_attempts").eq("email", email).maybeSingle();
    const u = data as { id: string; name: string; active: boolean; setup_code_hash: string | null; setup_expires_at: string | null; setup_attempts: number } | null;
    if (!u?.active || !u.setup_code_hash || !u.setup_expires_at || new Date(u.setup_expires_at).getTime() < Date.now() || u.setup_attempts >= 5) throw bad;
    if (sha256(`${u.id}:${code}`) !== u.setup_code_hash) { await db().from("admin_users").update({ setup_attempts: u.setup_attempts + 1 }).eq("id", u.id); throw bad; }
    if (/^(.)\1+$/.test(password) || password.toLowerCase().includes(email.split("@")[0]!)) throw new ApiError(400, "weak_password", "Pick something harder to guess (not your email, not one repeated character).", { password: "Too easy to guess" });
    await db().from("admin_users").update({ password_hash: await hashPassword(password), setup_code_hash: null, setup_expires_at: null, setup_attempts: 0, failed_attempts: 0, locked_until: null }).eq("id", u.id);
    await db().from("admin_sessions").update({ revoked_at: new Date().toISOString() }).eq("admin_id", u.id).is("revoked_at", null);
    await db().from("admin_audit").insert({ admin_id: u.id, admin_name: u.name, action: "password_set", detail: { via: "emailed code" } });
    return c.json({ ok: true, message: "Password set. Sign in with it now." });
  })

  .use("*", requireAdmin)
  // Every section checks its permission (admin-perms.ts) before the handler runs.
  .use("*", async (c, next) => {
    const section = c.req.path.replace(/^.*\/v1\/admin\//, "").split("/")[0] ?? "";
    const write = c.req.method !== "GET";
    const p = ({ queue: "queue", reports: "reports", terms: "terms", goofy: write ? "platform" : null, feedback: "feedback", companies: "companies", donations: "donations", audit: "audit", platform: write ? "platform" : null, team: write ? "team" : null, members: "members", "ip-bans": "ban", mail: "members" } as Record<string, Permission | null>)[section];
    if (p) need(c.get("admin"), p);
    await next();
  })
  .route("/", adminExtraRoutes)

  .get("/me", async (c) => { const { data } = await db().from("admin_users").select("mfa_method").eq("id", c.get("admin").id).single(); return c.json({ admin: meDto({ ...c.get("admin"), mfa_method: (data as { mfa_method: string } | null)?.mfa_method ?? "none" }) }); })
  .post("/logout", async (c) => {
    await db().from("admin_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", c.get("adminSession"));
    await audit(c, "signed_out");
    return c.json({ ok: true });
  })

  // ---------- overview ----------
  .get("/overview", async (c) => {
    const since = new Date(Date.now() - DAY).toISOString(), week = new Date(Date.now() - 7 * DAY).toISOString();
    const n = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0);
    const [heldStories, heldChitchats, openReports, urgent, newFeedback, bugs, members, storiesWeek, paid, goofy] = await Promise.all([
      n(db().from("stories").select("id", { count: "exact", head: true }).eq("status", "pending")),
      n(db().from("comments").select("id", { count: "exact", head: true }).eq("status", "pending")),
      n(db().from("reports").select("id", { count: "exact", head: true }).eq("resolved", false)),
      n(db().from("reports").select("id", { count: "exact", head: true }).eq("resolved", false).gte("priority", 70)),
      n(db().from("feedback").select("id", { count: "exact", head: true }).eq("status", "new").neq("kind", "pulse")),
      n(db().from("feedback").select("id", { count: "exact", head: true }).eq("kind", "bug").in("status", ["new", "seen", "planned", "in_progress"])),
      n(db().from("profiles").select("id", { count: "exact", head: true }).eq("kind", "person")),
      n(db().from("stories").select("id", { count: "exact", head: true }).eq("status", "published").gte("created_at", week)),
      db().from("donations").select("amount_paise, paid_at").eq("status", "paid").limit(100000),
      db().from("goofy_actions").select("action").gte("created_at", since).limit(20000),
    ]);
    const donations = (paid.data ?? []) as { amount_paise: number; paid_at: string }[];
    const pulse = await db().from("feedback").select("rating").eq("kind", "pulse").gte("created_at", new Date(Date.now() - 30 * DAY).toISOString()).limit(20000);
    const ratings = ((pulse.data ?? []) as { rating: number | null }[]).map((r) => r.rating).filter((x): x is number => x != null);
    const g: Record<string, number> = {};
    for (const r of (goofy.data ?? []) as { action: string }[]) g[r.action] = (g[r.action] ?? 0) + 1;
    // Thirty days of activity, one bucket per day (IST), for the trend charts.
    const from = new Date(Date.now() - 29 * DAY); from.setHours(0, 0, 0, 0);
    const [sig, sto, chi, rep, recent, banned, ipb, top, plat, why] = await Promise.all([
      db().from("profiles").select("created_at").eq("kind", "person").gte("created_at", from.toISOString()).limit(50000),
      db().from("stories").select("created_at").gte("created_at", from.toISOString()).limit(50000),
      db().from("comments").select("created_at").gte("created_at", from.toISOString()).limit(50000),
      db().from("reports").select("created_at").gte("created_at", from.toISOString()).limit(50000),
      db().from("admin_audit").select("id, admin_name, action, target_kind, target_ref, created_at").order("id", { ascending: false }).limit(8),
      n(db().from("profiles").select("id", { count: "exact", head: true }).not("banned_at", "is", null)),
      n(db().from("ip_bans").select("ip_hash", { count: "exact", head: true })),
      db().from("stories").select("company:companies(name, slug)").eq("status", "published").gte("created_at", week).limit(5000),
      platform(true),
      db().from("reports").select("reason").gte("created_at", from.toISOString()).limit(50000),
    ]);
    const reasons: Record<string, number> = {};
    for (const r of (why.data ?? []) as { reason: string }[]) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
    const days = Array.from({ length: 30 }, (_, i) => new Date(from.getTime() + i * DAY).toISOString().slice(0, 10));
    const series = (rows: { created_at: string }[] | null) => { const m = new Map(days.map((d) => [d, 0])); for (const r of rows ?? []) { const d = new Date(new Date(r.created_at).getTime() + 5.5 * 3600_000).toISOString().slice(0, 10); if (m.has(d)) m.set(d, m.get(d)! + 1); } return days.map((d) => m.get(d)!); };
    const tally = new Map<string, { name: string; slug: string; stories: number }>();
    for (const r of (top.data ?? []) as unknown as { company: { name: string; slug: string } | null }[]) if (r.company) { const t = tally.get(r.company.slug) ?? { ...r.company, stories: 0 }; t.stories++; tally.set(r.company.slug, t); }
    return c.json({
      days, trend: { signups: series(sig.data as { created_at: string }[]), stories: series(sto.data as { created_at: string }[]), chitchats: series(chi.data as { created_at: string }[]), reports: series(rep.data as { created_at: string }[]) },
      reportReasons: Object.entries(reasons).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
      recent: recent.data ?? [], bans: { members: banned, ips: ipb }, topCompanies: [...tally.values()].sort((a, b) => b.stories - a.stories).slice(0, 5),
      platform: { readOnly: plat.readOnly, signupsOpen: plat.signupsOpen, postingOpen: plat.postingOpen, chitchatsOpen: plat.chitchatsOpen, announcement: !!plat.announcement },
      queue: { stories: heldStories, chitchats: heldChitchats }, reports: { open: openReports, urgent },
      feedback: { new: newFeedback, openBugs: bugs }, members, storiesThisWeek: storiesWeek,
      donations: { total: donations.reduce((s, d) => s + d.amount_paise, 0) / 100, count: donations.length, last30: donations.filter((d) => new Date(d.paid_at).getTime() > Date.now() - 30 * DAY).reduce((s, d) => s + d.amount_paise, 0) / 100 },
      mood: { average: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null, responses: ratings.length },
      goofy24h: g,
    });
  })

  // ---------- the held queue ----------
  .get("/queue", validate("query", z.object({ kind: z.enum(["story", "chitchat"]).default("story") })), async (c) => {
    const kind = c.req.valid("query").kind;
    const q = kind === "story"
      ? db().from("stories").select("id, public_id, title, body_z, outcome, stage, created_at, moderation, author:profiles!stories_author_id_fkey(handle, public_id), company:companies(name, slug)").eq("status", "pending").order("created_at").limit(100)
      : db().from("comments").select("id, public_id, body_z, created_at, moderation, author:profiles!comments_author_id_fkey(handle, public_id), story:stories(public_id, title)").eq("status", "pending").order("created_at").limit(100);
    const { data, error } = await q;
    if (error) dbFail("admin queue", error);
    type Row = { id: string; public_id: number; title?: string; body_z: string; outcome?: string; stage?: string; created_at: string; moderation: Record<string, unknown> | null; author: { handle: string; public_id: number } | null; company?: { name: string; slug: string } | null; story?: { public_id: number; title: string } | null };
    const rows = (data ?? []) as unknown as Row[];
    const table = kind === "story" ? "reports" : "comment_reports", col = kind === "story" ? "story_id" : "comment_id";
    const { data: reps } = rows.length ? await db().from(table).select(`${col}, reason, details, priority, auto_hidden`).in(col, rows.map((r) => r.id)).eq("resolved", false) : { data: [] };
    const byItem = new Map<string, { reason: string; details: string | null; priority: number }[]>();
    for (const r of (reps ?? []) as Record<string, unknown>[]) { const k = r[col] as string; (byItem.get(k) ?? byItem.set(k, []).get(k)!).push({ reason: r["reason"] as string, details: (r["details"] as string | null) ?? null, priority: (r["priority"] as number) ?? 0 }); }
    return c.json({ items: rows.map((r) => ({
      kind, publicId: String(r.public_id), title: r.title ?? null, body: text(r.body_z), outcome: r.outcome ?? null, stage: r.stage ?? null, createdAt: r.created_at,
      author: handleOf(r.author), company: r.company ?? null, story: r.story ? { publicId: String(r.story.public_id), title: r.story.title } : null,
      review: r.moderation ? { decision: r.moderation["decision"] ?? null, score: r.moderation["score"] ?? null, reasons: r.moderation["reasons"] ?? [], selfHarm: !!r.moderation["selfHarm"], askedAt: r.moderation["askedAt"] ?? null } : null,
      reports: byItem.get(r.id) ?? [],
    })) });
  })

  .post("/queue/:kind/:publicId", validate("param", z.object({ kind: z.enum(["story", "chitchat"]), publicId: z.string().regex(/^\d{15}$/) })), validate("json", z.object({ action: z.enum(["approve", "redact", "remove"]), note: z.string().trim().max(300).optional() }).strict()), async (c) => {
    const { kind, publicId } = c.req.valid("param");
    const { action, note } = c.req.valid("json");
    const table = kind === "story" ? "stories" : "comments";
    const { data: row } = await db().from(table).select(kind === "story" ? "id, author_id, title, body_z, moderation" : "id, author_id, body_z, moderation, story:stories(public_id)").eq("public_id", publicId).maybeSingle();
    const r = row as unknown as { id: string; author_id: string; title?: string; body_z: string; moderation: Record<string, unknown> | null; story?: { public_id: number } | null } | null;
    if (!r) throw new ApiError(404, "not_found", "That item is gone.");
    const mod = { ...(r.moderation ?? {}), reviewedBy: c.get("admin").name, reviewedAt: new Date().toISOString(), reviewNote: note ?? null };
    const what = kind === "story" ? "Your story" : "Your chitchat";
    const storyRef = kind === "story" ? publicId : r.story?.public_id;
    if (action === "approve" || action === "redact") {
      const patch: Record<string, unknown> = { status: "published", moderation: { ...mod, ...(action === "redact" && { redactedBy: "goofy" }) } };
      if (action === "redact") { patch["body_z"] = toBytea(redactNames(text(r.body_z))); if (kind === "story") patch["title"] = redactNames(r.title ?? "").slice(0, 90); }
      await db().from(table).update(patch).eq("id", r.id);
      await addNotification(r.author_id, "system", action === "redact" ? `${what} is live. A moderator replaced a person's name with [name] so nobody can be identified.` : `${what} was reviewed by a moderator and is live now.`, storyRef ?? undefined);
    } else {
      await db().from(table).update({ status: kind === "story" ? "hidden" : "removed", moderation: { ...mod, autoRemoved: false, removedBy: "moderator" } }).eq("id", r.id);
      await addNotification(r.author_id, "system", `${what} was reviewed by a moderator and won't be published${note ? `: ${note}` : "."} You're welcome to write it again within the community rules.`, storyRef ?? undefined);
    }
    // Any open reports on it are settled the same way.
    await db().from(kind === "story" ? "reports" : "comment_reports").update({ resolved: true, outcome: action === "remove" ? "upheld" : "dismissed", resolved_at: new Date().toISOString() }).eq(kind === "story" ? "story_id" : "comment_id", r.id).eq("resolved", false);
    await bump({ shared: ["feed", ...(storyRef ? [`story:${storyRef}`] : [])] });
    await audit(c, `queue_${action}`, { kind, ref: publicId }, note ? { note } : undefined);
    return c.json({ ok: true });
  })

  // ---------- reports (everything open, grouped by what's reported) ----------
  .get("/reports", async (c) => {
    const [s, cm, co, pr] = await Promise.all([
      db().from("reports").select("id, reason, details, priority, auto_hidden, created_at, story:stories(public_id, title, status, body_z, company:companies(name))").eq("resolved", false).order("priority", { ascending: false }).limit(300),
      db().from("comment_reports").select("id, reason, details, priority, auto_hidden, created_at, comment:comments(public_id, status, body_z, story:stories(public_id, title))").eq("resolved", false).order("priority", { ascending: false }).limit(300),
      db().from("company_reports").select("id, reason, details, created_at, company:companies(slug, name, status)").eq("resolved", false).order("created_at").limit(300),
      db().from("profile_reports").select("id, reason, details, created_at, profile:profiles!profile_reports_profile_id_fkey(handle, public_id)").eq("resolved", false).order("created_at").limit(300),
    ]);
    type G = { kind: string; ref: string; title: string; excerpt: string; status: string | null; priority: number; autoHidden: boolean; link: string | null; reports: { id: string; reason: string; details: string | null; at: string }[] };
    const groups = new Map<string, G>();
    const add = (key: string, base: Omit<G, "reports" | "priority" | "autoHidden">, r: { id: string; reason: string; details: string | null; created_at: string; priority?: number; auto_hidden?: boolean }) => {
      const g = groups.get(key) ?? { ...base, priority: 0, autoHidden: false, reports: [] };
      g.priority = Math.max(g.priority, r.priority ?? 0); g.autoHidden ||= !!r.auto_hidden;
      g.reports.push({ id: r.id, reason: r.reason, details: r.details, at: r.created_at });
      groups.set(key, g);
    };
    for (const r of (s.data ?? []) as unknown as { id: string; reason: string; details: string | null; priority: number; auto_hidden: boolean; created_at: string; story: { public_id: number; title: string; status: string; body_z: string; company: { name: string } | null } | null }[]) if (r.story)
      add(`story:${r.story.public_id}`, { kind: "story", ref: String(r.story.public_id), title: r.story.title, excerpt: `${r.story.company?.name ?? ""} · ${text(r.story.body_z).slice(0, 280)}`, status: r.story.status, link: `/s/${r.story.public_id}` }, r);
    for (const r of (cm.data ?? []) as unknown as { id: string; reason: string; details: string | null; priority: number; auto_hidden: boolean; created_at: string; comment: { public_id: number; status: string; body_z: string; story: { public_id: number; title: string } | null } | null }[]) if (r.comment)
      add(`chitchat:${r.comment.public_id}`, { kind: "chitchat", ref: String(r.comment.public_id), title: `On “${r.comment.story?.title ?? "a story"}”`, excerpt: text(r.comment.body_z).slice(0, 280), status: r.comment.status, link: r.comment.story ? `/s/${r.comment.story.public_id}` : null }, r);
    for (const r of (co.data ?? []) as unknown as { id: string; reason: string; details: string | null; created_at: string; company: { slug: string; name: string; status: string } | null }[]) if (r.company)
      add(`company:${r.company.slug}`, { kind: "company", ref: r.company.slug, title: r.company.name, excerpt: "Company listing", status: r.company.status, link: `/c/${r.company.slug}` }, r);
    for (const r of (pr.data ?? []) as unknown as { id: string; reason: string; details: string | null; created_at: string; profile: { handle: string; public_id: number } | null }[]) if (r.profile)
      add(`profile:${r.profile.public_id}`, { kind: "profile", ref: String(r.profile.public_id), title: r.profile.handle, excerpt: "Profile", status: null, link: `/u/${r.profile.public_id}` }, r);
    return c.json({ groups: [...groups.values()].sort((a, b) => b.priority - a.priority || b.reports.length - a.reports.length) });
  })

  .post("/reports/:kind/:ref", validate("param", z.object({ kind: z.enum(["story", "chitchat", "company", "profile"]), ref: z.string().regex(/^[a-z0-9-]{2,60}$|^\d{15}$/) })), validate("json", z.object({ outcome: z.enum(["upheld", "dismissed"]), note: z.string().trim().max(300).optional() }).strict()), async (c) => {
    const { kind, ref } = c.req.valid("param");
    const { outcome, note } = c.req.valid("json");
    const now = new Date().toISOString();
    if (kind === "story" || kind === "chitchat") {
      const table = kind === "story" ? "stories" : "comments";
      const { data: t } = await db().from(table).select("id, author_id").eq("public_id", ref).maybeSingle();
      if (!t) throw new ApiError(404, "not_found", "That item is gone.");
      const { id, author_id } = t as { id: string; author_id: string };
      await db().from(kind === "story" ? "reports" : "comment_reports").update({ resolved: true, outcome, resolved_at: now }).eq(kind === "story" ? "story_id" : "comment_id", id).eq("resolved", false);
      if (outcome === "upheld") {
        await db().from(table).update({ status: kind === "story" ? "hidden" : "removed" }).eq("id", id);
        await addNotification(author_id, "system", `Your ${kind === "story" ? "story" : "chitchat"} was taken down after reports and a moderator's review${note ? `: ${note}` : "."}`);
      } else await db().from(table).update({ status: "published" }).eq("id", id).eq("status", "pending");
      await bump({ shared: ["feed"] });
    } else if (kind === "company") {
      const { data: co } = await db().from("companies").select("id").eq("slug", ref).maybeSingle();
      if (!co) throw new ApiError(404, "not_found", "That company is gone.");
      await db().from("company_reports").update({ resolved: true }).eq("company_id", (co as { id: string }).id).eq("resolved", false);
      if (outcome === "upheld") await db().from("companies").update({ status: "hidden" }).eq("id", (co as { id: string }).id);
      await bump({ shared: ["companies"] });
    } else {
      const { data: p } = await db().from("profiles").select("id").eq("public_id", ref).maybeSingle();
      if (!p) throw new ApiError(404, "not_found", "That profile is gone.");
      await db().from("profile_reports").update({ resolved: true }).eq("profile_id", (p as { id: string }).id).eq("resolved", false);
    }
    await audit(c, `report_${outcome}`, { kind, ref }, note ? { note } : undefined);
    return c.json({ ok: true });
  })

  // ---------- feedback ----------
  .get("/feedback", validate("query", z.object({ kind: z.enum(["bug", "feature", "feedback", "all"]).default("all"), status: z.enum(["open", "new", "seen", "planned", "in_progress", "done", "wont_do", "all"]).default("open") })), async (c) => {
    const { kind, status } = c.req.valid("query");
    let q = db().from("feedback").select("public_id, kind, title, body, area, severity, rating, steps, device, status, reply, created_at, updated_at, author:profiles(handle, public_id)").neq("kind", "pulse").order("created_at", { ascending: false }).limit(200);
    if (kind !== "all") q = q.eq("kind", kind);
    if (status === "open") q = q.in("status", ["new", "seen", "planned", "in_progress"]); else if (status !== "all") q = q.eq("status", status);
    const { data, error } = await q;
    if (error) dbFail("admin feedback", error);
    return c.json({ items: ((data ?? []) as unknown as (Record<string, unknown> & { public_id: number; author: { handle: string; public_id: number } | null })[]).map((f) => ({ ...f, publicId: String(f.public_id), author: handleOf(f.author), public_id: undefined })) });
  })

  .patch("/feedback/:publicId", validate("param", z.object({ publicId: z.string().regex(/^\d{15}$/) })), validate("json", z.object({ status: z.enum(["new", "seen", "planned", "in_progress", "done", "wont_do"]).optional(), reply: z.string().trim().max(2000).optional() }).strict()), async (c) => {
    const { publicId } = c.req.valid("param");
    const b = c.req.valid("json");
    const { data, error } = await db().from("feedback").update({ ...(b.status && { status: b.status }), ...(b.reply !== undefined && { reply: b.reply || null }), updated_at: new Date().toISOString() }).eq("public_id", publicId).select("user_id, title").single();
    if (error) dbFail("update feedback", error);
    const f = data as { user_id: string | null; title: string | null };
    const LABEL: Record<string, string> = { seen: "has been read by the team", planned: "is planned", in_progress: "is being worked on", done: "is done", wont_do: "won't be done for now" };
    if (f.user_id && (b.reply || (b.status && LABEL[b.status]))) await addNotification(f.user_id, "system", b.reply ? `The Ghosted team replied to “${(f.title ?? "your feedback").slice(0, 60)}”: ${b.reply.slice(0, 160)}` : `Your “${(f.title ?? "feedback").slice(0, 60)}” ${LABEL[b.status!]}. Thank you!`);
    await audit(c, "feedback_update", { kind: "feedback", ref: publicId }, b);
    return c.json({ ok: true });
  })

  // ---------- companies ----------
  .get("/companies", validate("query", z.object({ status: z.enum(["listed", "hidden", "all"]).default("all"), q: z.string().trim().max(60).optional() })), async (c) => {
    const { status, q } = c.req.valid("query");
    let query = db().from("companies").select("slug, name, domain, website, logo_url, industry, size, hq_city, status, created_at, about").order("created_at", { ascending: false }).limit(200);
    if (status !== "all") query = query.eq("status", status);
    if (q) query = query.ilike("name", `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`);
    const { data, error } = await query;
    if (error) dbFail("admin companies", error);
    return c.json({ items: data ?? [] });
  })
  .patch("/companies/:slug", validate("param", z.object({ slug: z.string().regex(/^[a-z0-9-]{2,60}$/) })), validate("json", z.object({ status: z.enum(["listed", "hidden"]) }).strict()), async (c) => {
    const { slug } = c.req.valid("param");
    const { status } = c.req.valid("json");
    const { error } = await db().from("companies").update({ status }).eq("slug", slug);
    if (error) dbFail("update company", error);
    await bump({ shared: ["companies", `company:${slug}`] });
    await audit(c, `company_${status}`, { kind: "company", ref: slug });
    return c.json({ ok: true });
  })

  // ---------- donations ----------
  .get("/donations", async (c) => {
    const { data, error } = await db().from("donations").select("public_id, amount_paise, status, message, show_name, razorpay_order_id, razorpay_payment_id, created_at, paid_at, donor:profiles(handle, public_id)").order("created_at", { ascending: false }).limit(300);
    if (error) dbFail("admin donations", error);
    return c.json({ items: ((data ?? []) as unknown as (Record<string, unknown> & { public_id: number; amount_paise: number; donor: { handle: string; public_id: number } | null })[]).map((d) => ({ ...d, publicId: String(d.public_id), amount: d.amount_paise / 100, donor: handleOf(d.donor) })) });
  })

  // ---------- Goofy's word lists ----------
  .get("/terms", validate("query", z.object({ source: z.enum(["all", "learned", "variant", "dsojevic", "ldnoobw_en", "ldnoobw_hi"]).default("learned"), status: z.enum(["active", "retired", "all"]).default("active"), q: z.string().trim().max(40).optional() })), async (c) => {
    const { source, status, q } = c.req.valid("query");
    let query = db().from("moderation_terms").select("term, tier, source, weight, status, evidence, updated_at").order("updated_at", { ascending: false }).limit(300);
    if (source !== "all") query = query.eq("source", source);
    if (status !== "all") query = query.eq("status", status);
    if (q) query = query.ilike("term", `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`);
    const { data, error } = await query;
    if (error) dbFail("admin terms", error);
    return c.json({ items: data ?? [] });
  })
  .patch("/terms/:term", validate("param", z.object({ term: z.string().min(2).max(60) })), validate("json", z.object({ status: z.enum(["active", "retired"]).optional(), tier: z.enum(["slur", "severe", "profanity", "watch"]).optional(), allow: z.boolean().optional() }).strict()), async (c) => {
    const { term } = c.req.valid("param");
    const b = c.req.valid("json");
    if (b.allow) {
      // "This word is fine on Ghosted": retire it and put it on the allow-list so it can't come back.
      await db().from("moderation_allow").upsert({ term, reason: `allowed by ${c.get("admin").name}` }, { onConflict: "term" });
      await db().from("moderation_terms").update({ status: "retired", updated_at: new Date().toISOString() }).eq("term", term);
    } else {
      const { error } = await db().from("moderation_terms").update({ ...(b.status && { status: b.status }), ...(b.tier && { tier: b.tier }), updated_at: new Date().toISOString() }).eq("term", term);
      if (error) dbFail("update term", error);
    }
    await loadLive(true);
    await audit(c, "term_update", { kind: "term", ref: term }, b);
    return c.json({ ok: true });
  })
  .post("/terms", validate("json", z.object({ term: z.string().trim().toLowerCase().min(2).max(60), tier: z.enum(["slur", "severe", "profanity", "watch"]) }).strict()), async (c) => {
    const b = c.req.valid("json");
    const { error } = await db().from("moderation_terms").upsert({ term: b.term, tier: b.tier, source: "learned", weight: 1, pattern: b.term.includes("*"), exceptions: [], status: "active", evidence: { addedBy: c.get("admin").name }, updated_at: new Date().toISOString() }, { onConflict: "term" });
    if (error) dbFail("add term", error);
    await db().from("moderation_allow").delete().eq("term", b.term);
    await loadLive(true);
    await audit(c, "term_add", { kind: "term", ref: b.term }, { tier: b.tier });
    return c.json({ ok: true }, 201);
  })

  // ---------- the team and the log ----------
  // Page by page, newest first, filterable by area, person and words. Names come from the admin's
  // account when the row didn't store one (older rows, the password-setup step).
  .get("/audit", validate("query", z.object({
    page: z.coerce.number().int().min(1).max(100000).default(1), size: z.coerce.number().int().min(10).max(100).default(25),
    area: z.enum(["all", "moderation", "goofy", "members", "team", "platform", "account", "catalogue"]).default("all"),
    who: z.string().trim().toLowerCase().email().max(120).optional(), q: z.string().trim().max(60).optional(),
  })), async (c) => {
    const { page, size, area, who, q: text } = c.req.valid("query");
    const AREA: Record<string, string[]> = {
      moderation: ["queue_%", "report_%", "term_%"], goofy: ["goofy_%"], members: ["member_%", "ip_%"], team: ["team_%"], platform: ["platform_%"],
      account: ["signed_%", "password_%", "mfa_%", "settings_%", "revoked_%", "session_%"], catalogue: ["company_%", "feedback_%"],
    };
    let q = db().from("admin_audit").select("id, admin_name, action, target_kind, target_ref, detail, created_at, admin:admin_users(name, avatar_seed, email)", { count: "exact" }).order("id", { ascending: false }).range((page - 1) * size, page * size - 1);
    if (area !== "all") q = q.or(AREA[area]!.map((p) => `action.like.${p}`).join(","));
    if (who) { const { data: a } = await db().from("admin_users").select("id").eq("email", who).maybeSingle(); q = q.eq("admin_id", (a as { id: string } | null)?.id ?? "00000000-0000-0000-0000-000000000000"); }
    if (text) { const t = text.replace(/[%_\\,()]/g, ""); q = q.or(`action.ilike.%${t.replace(/\s+/g, "_")}%,target_ref.ilike.%${t}%,admin_name.ilike.%${t}%`); }
    const { data, error, count } = await q;
    if (error) dbFail("admin audit", error);
    const { data: team } = await db().from("admin_users").select("name, email").order("name");
    type Row = { id: number; admin_name: string | null; action: string; target_kind: string | null; target_ref: string | null; detail: Record<string, unknown> | null; created_at: string; admin: { name: string; avatar_seed: string; email: string } | null };
    return c.json({
      page, size, total: count ?? 0, pages: Math.max(1, Math.ceil((count ?? 0) / size)),
      people: (team ?? []) as { name: string; email: string }[],
      items: ((data ?? []) as unknown as Row[]).map((r) => ({ id: r.id, who: r.admin_name ?? r.admin?.name ?? "System", avatarSeed: r.admin?.avatar_seed ?? null, action: r.action, targetKind: r.target_kind, targetRef: r.target_ref, detail: r.detail, at: r.created_at })),
    });
  });
