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

export type AppEnv = { Variables: { profile: Profile | null; requestId: string; accessToken: string | undefined } };

// ---------- client identity ----------

// Vercel sets x-forwarded-for; the first entry is the real client. Raw IPs are never stored.
export function ipKey(c: Context) {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "unknown";
  return createHmac("sha256", env().IP_HASH_SECRET).update(ip).digest("hex").slice(0, 32);
}

// ---------- rate limiting ----------

type Limit = { name: string; max: number; windowSeconds: number; by?: "ip" | "user" };

// Fixed-window limiter backed by Postgres, so it holds across all serverless instances.
export function rateLimit({ name, max, windowSeconds, by = "ip" }: Limit): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const who = by === "user" && c.get("profile") ? `u:${c.get("profile")!.id}` : `ip:${ipKey(c)}`;
    const { data, error } = await admin().rpc("rate_limit_hit", { p_key: `${name}:${who}`, p_window_seconds: windowSeconds });
    if (error) dbFail("rate_limit_hit", error);
    const hits = Number(data);
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

// Verifies the JWT with Supabase, then loads the profile. The profile is created on first use from
// the handle/avatar chosen at sign-up (stored in user metadata), falling back to random ones.
async function loadProfile(token: string): Promise<Profile | null> {
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) return null;
  const user = data.user;
  const { data: profile, error: pErr } = await admin().from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (pErr) dbFail("load profile", pErr);
  if (profile) {
    // Members from before Goofy existed get his welcome once, on their next visit.
    if ((profile as Profile).goofy_welcomed === false) void welcome(profile as Profile).catch(() => undefined);
    return profile as Profile;
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const handle = typeof meta.handle === "string" && isGeneratedHandle(meta.handle) ? meta.handle : randomHandle();
  const avatar_seed = typeof meta.avatar_seed === "string" && isAvatarSeed(meta.avatar_seed) ? meta.avatar_seed : `peep-${randomUUID().slice(0, 8)}`;
  const pastel = typeof meta.pastel === "string" && isPastel(meta.pastel) ? meta.pastel : PASTELS[Math.floor(Math.random() * PASTELS.length)]!;
  // The sealed full name travels in metadata only until the profile exists, then is wiped from auth.users.
  const details_z = typeof meta.details_z === "string" && /^\\x[0-9a-f]{58,4096}$/.test(meta.details_z) ? meta.details_z : null;
  const { data: created, error: cErr } = await admin().from("profiles").upsert({ id: user.id, handle, avatar_seed, pastel, details_z }, { onConflict: "id", ignoreDuplicates: false }).select("*").single();
  if (cErr) dbFail("create profile", cErr);
  const { error: mErr } = await admin().auth.admin.updateUserById(user.id, { user_metadata: { handle: null, avatar_seed: null, pastel: null, details_z: null } });
  if (mErr) console.error("[auth] clear metadata", mErr.code);
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
