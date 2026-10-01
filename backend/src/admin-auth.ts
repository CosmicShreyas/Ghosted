// Admin sign-in and sessions. Separate from Ghosted user accounts on purpose.
//
//   passwords   scrypt (N=2^15, r=8, p=1, 64-byte key, 16-byte salt), compared in constant time
//   lockout     5 wrong passwords → 15 minutes locked (per account), on top of an IP rate limit
//   sessions    a random 256-bit bearer token; only its SHA-256 is stored. 8 hours, revocable
//   gate        requireAdmin: the request must come from an ADMIN_ORIGINS origin AND carry a live
//               session for an active admin. Anything else is a plain 404, so the admin API
//               can't even be confirmed to exist.
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Context, MiddlewareHandler } from "hono";
import { env } from "./env.js";
import { ipKey } from "./security.js";
import { admin as db } from "./supabase.js";
import type { Role } from "./admin-perms.js";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const SESSION_HOURS = 8;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, 64, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}
export async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const want = Buffer.from(hash, "base64url");
  const got = await scrypt(password.normalize("NFKC"), Buffer.from(salt, "base64url"), want.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: PARAMS.maxmem });
  return got.length === want.length && timingSafeEqual(got, want);
}
// For unknown emails: spend the same time as a real check, so timing doesn't reveal who's an admin.
const DUMMY = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$" + "A".repeat(86);
export const burnTime = (password: string) => checkPassword(password, DUMMY).catch(() => false);

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export type AdminUser = { id: string; email: string; name: string; role: Role; active: boolean; permissions: string[] | null; avatar_seed: string; tone: "sassy" | "calm"; email_theme: "light" | "dark"; from_env: boolean; disabled_at: string | null };
export const ADMIN_COLS = "id, email, name, role, active, permissions, avatar_seed, tone, email_theme, from_env, disabled_at";
export type AdminEnv = { Variables: { admin: AdminUser; adminSession: string } };

// Access token: 15 minutes, kept only in the panel's memory. Refresh token: rotated on every use,
// kept for the tab's lifetime. The whole session ends SESSION_HOURS after sign-in, whatever happens.
export const ACCESS_MINUTES = 15;
const newToken = () => randomBytes(32).toString("base64url");
const pair = () => ({ token: newToken(), refreshToken: newToken(), expiresAt: new Date(Date.now() + ACCESS_MINUTES * 60_000).toISOString() });

export async function startSession(c: Context, adminId: string, device?: string | null) {
  const p = pair();
  const sessionExpiresAt = new Date(Date.now() + SESSION_HOURS * 3600_000).toISOString();
  // Same browser signing in again: its previous session ends, so Settings shows each browser once.
  const deviceHash = device ? sha256(`admin-device:${device}`) : null;
  if (deviceHash) await db().from("admin_sessions").update({ revoked_at: new Date().toISOString() }).eq("admin_id", adminId).eq("device_hash", deviceHash).is("revoked_at", null);
  const row = { admin_id: adminId, token_hash: sha256(p.token), refresh_hash: sha256(p.refreshToken), session_expires_at: sessionExpiresAt, ip_hash: ipKey(c), user_agent: (c.req.header("user-agent") ?? "").slice(0, 300), expires_at: p.expiresAt };
  let { error } = await db().from("admin_sessions").insert({ ...row, device_hash: deviceHash });
  // Compatibility for databases created before the consolidated initializer: sign-in still works without device replacement.
  if (error && /device_hash/.test(error.message)) ({ error } = await db().from("admin_sessions").insert(row));
  if (error) { console.error("[admin] session", error.message); throw new Error("Couldn't start the session (run supabase/init_database.sql on a fresh project)."); }
  return { ...p, sessionExpiresAt };
}

// Swaps a refresh token for a new pair. A refresh token that was already swapped means two parties
// hold it (it was copied): the session is revoked on the spot and both are signed out.
export async function rotateSession(c: Context, refreshToken: string) {
  const h = sha256(refreshToken);
  const { data } = await db().from("admin_sessions").select("id, admin_id, revoked_at, session_expires_at, rotations, admin:admin_users(active, disabled_at)").eq("refresh_hash", h).maybeSingle();
  const s = data as unknown as { id: string; admin_id: string; revoked_at: string | null; session_expires_at: string | null; rotations: number; admin: { active: boolean; disabled_at: string | null } | null } | null;
  if (!s) {
    const { data: reused } = await db().from("admin_sessions").select("id, admin_id").eq("prev_refresh_hash", h).is("revoked_at", null).maybeSingle();
    if (reused) {
      const r = reused as { id: string; admin_id: string };
      await db().from("admin_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", r.id);
      await db().from("admin_audit").insert({ admin_id: r.admin_id, action: "session_reuse_blocked", detail: { note: "an old refresh token was used again; session revoked" } });
    }
    return null;
  }
  if (s.revoked_at || !s.session_expires_at || new Date(s.session_expires_at).getTime() < Date.now() || !s.admin?.active || s.admin.disabled_at) return null;
  const p = pair();
  // Only succeeds if nobody rotated it in between (two tabs racing): the loser just signs in again.
  const { data: done } = await db().from("admin_sessions").update({ token_hash: sha256(p.token), expires_at: p.expiresAt, refresh_hash: sha256(p.refreshToken), prev_refresh_hash: h, rotations: s.rotations + 1, last_used_at: new Date().toISOString(), ip_hash: ipKey(c) }).eq("id", s.id).eq("refresh_hash", h).select("id");
  if (!done?.length) return null;
  return { ...p, sessionExpiresAt: s.session_expires_at };
}

const notFound = (c: Context) => c.json({ error: { code: "not_found", message: "No such endpoint." } }, 404);
export const fromAdminOrigin = (c: Context) => { const o = c.req.header("origin"); return !!o && env().ADMIN_ORIGINS.includes(o); };

// Origin first (cheap), then the session. Both failures look exactly like a missing route.
export const adminOrigin: MiddlewareHandler = async (c, next) => (fromAdminOrigin(c) ? next() : notFound(c));
export const requireAdmin: MiddlewareHandler<AdminEnv> = async (c, next) => {
  if (!fromAdminOrigin(c)) return notFound(c);
  // Someone taken out of ADMIN_EMAILS loses access within a minute, even mid-session.
  await syncAdminsFromEnv().catch(() => undefined);
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return notFound(c);
  const { data } = await db().from("admin_sessions").select(`id, expires_at, session_expires_at, revoked_at, admin:admin_users(${ADMIN_COLS})`).eq("token_hash", sha256(token)).maybeSingle();
  const s = data as unknown as { id: string; expires_at: string; session_expires_at: string | null; revoked_at: string | null; admin: AdminUser | null } | null;
  if (!s || s.revoked_at || new Date(s.expires_at).getTime() < Date.now() || (s.session_expires_at && new Date(s.session_expires_at).getTime() < Date.now()) || !s.admin?.active || s.admin.disabled_at) return notFound(c);
  c.set("admin", s.admin);
  c.set("adminSession", s.id);
  void db().from("admin_sessions").update({ last_used_at: new Date().toISOString() }).eq("id", s.id);
  c.header("Cache-Control", "no-store");
  await next();
};

// ADMIN_EMAILS → admin_users. Listed emails exist (name and role kept in sync); accounts that came
// from the setting and were taken out of it are switched off and signed out. Accounts made with
// `npm run admin:create` are left alone. Runs at most once a minute per server instance.
let syncedAt = 0;
export async function syncAdminsFromEnv(force = false) {
  if (!force && Date.now() - syncedAt < 60_000) return;
  syncedAt = Date.now();
  const listed = env().ADMIN_EMAILS;
  for (const a of listed) {
    const { data, error } = await db().from("admin_users").select("id").eq("email", a.email).maybeSingle();
    if (error) { syncedAt = 0; throw new Error(error.message); }
    // The role follows the setting; the name is only a starting point (admins can rename themselves).
    if (data) await db().from("admin_users").update({ role: a.role, active: true, from_env: true }).eq("id", (data as { id: string }).id);
    else await db().from("admin_users").insert({ email: a.email, name: a.name, role: a.role, active: true, from_env: true, password_hash: null, avatar_seed: a.email.split("@")[0]!.slice(0, 60) });
  }
  const { data: envMade } = await db().from("admin_users").select("id, email").eq("from_env", true).eq("active", true);
  for (const u of (envMade ?? []) as { id: string; email: string }[]) if (!listed.some((a) => a.email === u.email)) {
    await db().from("admin_users").update({ active: false }).eq("id", u.id);
    await db().from("admin_sessions").update({ revoked_at: new Date().toISOString() }).eq("admin_id", u.id).is("revoked_at", null);
  }
}

// Every admin action is append-only at the database layer.
export async function audit(c: Context<AdminEnv>, action: string, target: { kind?: string; ref?: string | number | null } = {}, detail?: Record<string, unknown>) {
  const a = c.get("admin");
  const { error } = await db().from("admin_audit").insert({ admin_id: a.id, admin_name: a.name, action, target_kind: target.kind ?? null, target_ref: target.ref != null ? String(target.ref) : null, detail: detail ?? null });
  if (error) console.error("[admin] audit", error.message);
}
