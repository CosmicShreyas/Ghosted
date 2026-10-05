import { createHmac, randomUUID } from "node:crypto";
import { isGeneratedHandle, randomHandle } from "./lib/handles.js";
import type { Context, MiddlewareHandler } from "hono";
import { env } from "./env.js";
import { ApiError, dbFail, unauthorized } from "./errors.js";
import { admin, auth } from "./supabase.js";
import { clearSession, issueSession, readSession } from "./session-cookies.js";
import { touchSession } from "./devices.js";
import { later } from "./live.js";
import { welcome } from "./goofy/index.js";
import { banOf, bannedError } from "./platform.js";
import { inviterByCode } from "./referral.js";

export type Profile = {
  id: string;
  public_id: number;
  handle: string;
  avatar_seed: string;
  pastel: string;
  show_real: boolean;
  details_z: string | null; // sealed personal details, see lib/sealed.ts
  shared_fields: string[];
  created_at: string;
  tone: "sassy" | "calm";
  notify: Notify;
  // Goofy schema: bots are "bot"; strikes can pause posting; one welcome per member.
  kind?: "person" | "bot";
  posting_paused_until?: string | null;
  goofy_welcomed?: boolean;
  mfa_method: "none" | "totp" | "email";
  totp_secret_z: string | null;
  totp_pending_z: string | null;
  totp_last_step: number | null;
  recovery_z: string | null;
  digest_sent_at: string | null;
  // Which palette this person's emails use (their theme on the site).
  email_theme?: "light" | "dark";
  // Set by an admin. banned_until null with banned_at set = permanent.
  banned_at?: string | null;
  banned_until?: string | null;
  ban_reason?: string | null;
};

export type Notify = { relatable: boolean; chitchatReplies: boolean; newFollowers: boolean; flaggedCompanies: boolean; weeklyDigest: boolean };

// `sessionRead`: this request looked at the caller's session, so its response may be personal.
export type AppEnv = { Variables: { profile: Profile | null; requestId: string; accessToken: string | undefined; sessionRead: boolean | undefined } };

// ---------- client identity ----------

// Vercel sets x-forwarded-for; the first entry is the real client. Raw IPs are never stored.
export function ipKey(c: Context) {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "unknown";
  return createHmac("sha256", env().IP_HASH_SECRET).update(ip).digest("hex").slice(0, 32);
}

// ---------- rate limiting ----------

type Limit = { name: string; max: number; windowSeconds: number; by?: "ip" | "user" };

// Fixed-window limiter backed by Postgres, so it holds across all serverless instances.
// Reads (GET/HEAD) count in this instance's memory: no database round trip in front of every page
// load. Writes, sign-in and anything sensitive still count in the shared database, so those limits
// hold across every server instance.
const memoryHits = new Map<string, { window: number; hits: number }>();
function memoryHit(key: string, windowSeconds: number) {
  const window = Math.floor(Date.now() / 1000 / windowSeconds);
  const cur = memoryHits.get(key);
  const hits = cur && cur.window === window ? cur.hits + 1 : 1;
  memoryHits.set(key, { window, hits });
  if (memoryHits.size > 50_000) for (const [k, v] of memoryHits) { if (v.window !== window) memoryHits.delete(k); }
  return hits;
}

export function rateLimit({ name, max, windowSeconds, by = "ip" }: Limit): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const who = by === "user" && c.get("profile") ? `u:${c.get("profile")!.id}` : `ip:${ipKey(c)}`;
    const key = `${name}:${who}`;
    let hits: number;
    if (c.req.method === "GET" || c.req.method === "HEAD") hits = memoryHit(key, windowSeconds);
    else {
      const { data, error } = await admin().rpc("rate_limit_hit", { p_key: key, p_window_seconds: windowSeconds });
      if (error) dbFail("rate_limit_hit", error);
      hits = Number(data);
    }
    const windowEnd = (Math.floor(Date.now() / 1000 / windowSeconds) + 1) * windowSeconds;
    c.header("RateLimit-Limit", String(max));
    c.header("RateLimit-Remaining", String(Math.max(0, max - hits)));
    c.header("RateLimit-Reset", String(windowEnd - Math.floor(Date.now() / 1000)));
    if (hits > max) {
      c.header("Retry-After", String(windowEnd - Math.floor(Date.now() / 1000)));
      throw new ApiError(429, "rate_limited", "Too many requests. Take a breather and try again shortly.");
    }
    await next();
  };
}

// Same limiter, called from inside a handler with any key (e.g. a hashed email address), so a limit
// can follow a target across IPs. Throws 429 with `message` once `max` is exceeded in the window.
export async function limitBy(key: string, max: number, windowSeconds: number, message: string) {
  const { data, error } = await admin().rpc("rate_limit_hit", { p_key: key, p_window_seconds: windowSeconds });
  if (error) dbFail("rate_limit_hit", error);
  if (Number(data) > max) throw new ApiError(429, "rate_limited", message);
}

// ---------- auth ----------

const AVATAR_SEED = /^[a-z0-9-]{1,64}$/;
const PASTELS = ["bg-avatar-mint", "bg-avatar-sky", "bg-avatar-pink", "bg-avatar-amber", "bg-avatar-lilac"];
export const isPastel = (v: string) => PASTELS.includes(v);
export const isAvatarSeed = (v: string) => AVATAR_SEED.test(v);

async function linkInviter(userId: string, code: string, ipHash: string | null) {
  try {
    const inviter = await inviterByCode(code);
    if (!inviter || inviter.id === userId) return;
    if (ipHash) {
      const { count } = await admin().from("session_devices").select("session_id", { count: "exact", head: true }).eq("user_id", inviter.id).eq("ip_hash", ipHash);
      if ((count ?? 0) > 0) return; // same connection as the inviter: not credited
    }
    const { data: linked } = await admin().from("profiles").update({ referred_by: inviter.id, referred_at: new Date().toISOString() }).eq("id", userId).is("referred_by", null).select("id");
    // A small XP thank-you for the join itself (the big one comes when they share a story).
    if (linked?.length) (await import("./levels.js")).award(inviter.id, "invite_join", userId);
  } catch (e) { console.error("[invite] link", (e as Error).message); }
}

// Verifies the JWT with Supabase, then loads the profile. The profile is created on first use from
// the handle/avatar chosen at sign-up (stored in user metadata), falling back to random ones.
// A token Supabase has verified is remembered for up to a minute (never past its own expiry), so
// back-to-back requests skip the round trip to Supabase Auth. Signing out clears it at once on this
// instance; elsewhere a revoked session lapses within VERIFIED_TTL. Bans are read from the profile,
// which is always loaded fresh, so they apply immediately.
const VERIFIED_TTL = 60_000;
type Verified = { userId: string; until: number; user?: { id: string; user_metadata?: Record<string, unknown> } };
const verified = new Map<string, Verified>();
const tokenKey = (token: string) => createHmac("sha256", "ghosted-token-cache").update(token).digest("base64url");
export function forgetUser(userId: string) { for (const [k, v] of verified) if (v.userId === userId) verified.delete(k); }

// The unverified `sub` claim, only used to start loading the profile while the token is verified.
function claimedUserId(token: string): string | null {
  try {
    const p = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()) as { sub?: unknown; exp?: unknown };
    return typeof p.sub === "string" ? p.sub : null;
  } catch { return null; }
}
function tokenExpiry(token: string) {
  try { const p = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()) as { exp?: unknown }; return typeof p.exp === "number" ? p.exp * 1000 : 0; } catch { return 0; }
}

async function verifyToken(token: string) {
  const key = tokenKey(token);
  const hit = verified.get(key);
  if (hit && hit.until > Date.now()) return hit;
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) { verified.delete(key); return null; }
  const v: Verified = { userId: data.user.id, until: Math.min(Date.now() + VERIFIED_TTL, tokenExpiry(token) || Date.now() + VERIFIED_TTL), user: data.user };
  if (verified.size > 20_000) verified.clear();
  verified.set(key, v);
  return v;
}

const profileRow = async (id: string) => {
  const { data, error } = await admin().from("profiles").select("*").eq("id", id).maybeSingle();
  if (error) dbFail("load profile", error);
  return data as Profile | null;
};

async function loadProfile(token: string): Promise<Profile | null> {
  // Verification and the profile read run side by side; the profile is only used if the verified
  // user matches the id the token claimed.
  const claimed = claimedUserId(token);
  const [v, early] = await Promise.all([verifyToken(token), claimed ? profileRow(claimed).catch(() => null) : Promise.resolve(null)]);
  if (!v) return null;
  const profile = v.userId === claimed ? early : await profileRow(v.userId);
  if (profile) {
    // Members from before Goofy existed get his welcome once, on their next visit.
    if (profile.goofy_welcomed === false) void welcome(profile).catch(() => undefined);
    return profile;
  }
  // First visit after sign-up: the profile is created from the auth user's metadata.
  if (v.user) return createProfile(v.user);
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) return null;
  return createProfile(data.user);
}

async function createProfile(user: { id: string; user_metadata?: Record<string, unknown> }): Promise<Profile> {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const handle = typeof meta.handle === "string" && isGeneratedHandle(meta.handle) ? meta.handle : randomHandle();
  const avatar_seed = typeof meta.avatar_seed === "string" && isAvatarSeed(meta.avatar_seed) ? meta.avatar_seed : `peep-${randomUUID().slice(0, 8)}`;
  const pastel = typeof meta.pastel === "string" && isPastel(meta.pastel) ? meta.pastel : PASTELS[Math.floor(Math.random() * PASTELS.length)]!;
  // The sealed full name travels in metadata only until the profile exists, then is wiped from auth.users.
  const details_z = typeof meta.details_z === "string" && /^\\x[0-9a-f]{58,4096}$/.test(meta.details_z) ? meta.details_z : null;
  const { data: created, error: cErr } = await admin().from("profiles").upsert({ id: user.id, handle, avatar_seed, pastel, details_z }, { onConflict: "id", ignoreDuplicates: false }).select("*").single();
  if (cErr) dbFail("create profile", cErr);
  const { error: mErr } = await admin().auth.admin.updateUserById(user.id, { user_metadata: { handle: null, avatar_seed: null, pastel: null, details_z: null, ref_code: null, ref_ip: null } });
  if (mErr) console.error("[auth] clear metadata", mErr.code);
  // Joined through an invite: link the inviter (never yourself, never from the inviter's own network).
  if (typeof meta.ref_code === "string") later(linkInviter(user.id, meta.ref_code, typeof meta.ref_ip === "string" ? meta.ref_ip : null));
  void welcome(created as Profile).catch(() => undefined); // Goofy says hi
  return created as Profile;
}

const bearer = (c: Context) => {
  const header = c.req.header("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
};

// Resolves the caller from the encrypted session cookies (or a Bearer token for non-browser clients).
// If the access token has expired but the refresh cookie is valid, it refreshes right here and sets
// new cookies on the response, so the user stays logged in without ever seeing an error.
async function authenticate(c: Context<AppEnv>): Promise<Profile | null> {
  c.set("sessionRead", true);
  const header = bearer(c);
  if (header) { c.set("accessToken", header); return loadProfile(header); }

  const { access, refresh, names } = readSession(c);
  if (access) {
    const profile = await loadProfile(access);
    if (profile) { c.set("accessToken", access); return profile; }
  }
  if (refresh) {
    const { data, error } = await auth().refreshSession({ refresh_token: refresh });
    if (!error && data.session) {
      issueSession(c, { accessToken: data.session.access_token, refreshToken: data.session.refresh_token });
      c.set("accessToken", data.session.access_token);
      later(touchSession(data.session.access_token)); // "last active" for Settings → Security
      return loadProfile(data.session.access_token);
    }
  }
  if (names.length) clearSession(c); // expired or revoked: tidy up so the browser stops sending them
  return null;
}

// Attaches the profile if the visitor is logged in; anonymous visitors pass through.
// A banned member browses as a visitor and can't do anything that needs an account.
export const optionalAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const profile = await authenticate(c);
  c.set("profile", profile && !banOf(profile) ? profile : null);
  await next();
};

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const profile = await authenticate(c);
  if (!profile) throw unauthorized();
  const ban = banOf(profile);
  if (ban) { clearSession(c); throw bannedError(ban); }
  c.set("profile", profile);
  await next();
};

export const me = (c: Context<AppEnv>) => {
  const profile = c.get("profile");
  if (!profile) throw unauthorized();
  return profile;
};



// ---------- input hygiene ----------

// Strips control characters (except newlines/tabs) and trims. Output is always rendered as text by the frontend.
export const clean = (value: string) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮]/g, "").trim();
