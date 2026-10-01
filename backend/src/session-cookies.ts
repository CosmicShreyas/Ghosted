// Session storage in the browser: two HttpOnly cookies (access + refresh), each AES-256-GCM encrypted.
//
// - HttpOnly: page JavaScript (and any injected script) can't read them. This is what stops token theft.
// - Encrypted + authenticated: the browser only ever holds ciphertext; a modified byte fails the GCM tag.
// - Random name + random IV on every issue: the cookie is named and encoded differently for each
//   user and each refresh, so there's no fixed "access_token" to find. The server recognises its cookies
//   by whether they decrypt, not by name.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { env } from "./env.js";

export const ACCESS_TTL_SECONDS = 3 * 86400; // access cookie: 3 days
export const REFRESH_TTL_SECONDS = 30 * 86400; // refresh cookie: 30 days, renewed on every refresh

type Kind = "a" | "r";
type Payload = { k: Kind; t: string; iat: number; exp: number };
export type SessionTokens = { accessToken: string; refreshToken: string };

const VERSION = 1;
const key = () => Buffer.from(env().SESSION_COOKIE_KEY, "hex");
// Cookie names are a single token of base64url characters, which is always valid.
const randomName = () => randomBytes(9).toString("base64url");

function seal(p: Payload) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(`ghosted-session-v${VERSION}`));
  const body = Buffer.concat([cipher.update(JSON.stringify(p)), cipher.final()]);
  return Buffer.concat([Buffer.of(VERSION), iv, cipher.getAuthTag(), body]).toString("base64url");
}

function open(value: string): Payload | null {
  try {
    const data = Buffer.from(value, "base64url");
    if (data.length < 30 || data[0] !== VERSION) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(), data.subarray(1, 13));
    decipher.setAAD(Buffer.from(`ghosted-session-v${VERSION}`));
    decipher.setAuthTag(data.subarray(13, 29));
    const p = JSON.parse(Buffer.concat([decipher.update(data.subarray(29)), decipher.final()]).toString()) as Payload;
    return (p.k === "a" || p.k === "r") && typeof p.t === "string" && p.exp * 1000 > Date.now() ? p : null;
  } catch {
    return null; // not ours, tampered with, or expired
  }
}

// Secure cookies are fine on http://localhost in modern browsers, and deployments are HTTPS. The one
// exception is local development opened from a phone over the LAN (http://192.168.x.x), where browsers
// silently drop Secure cookies; only there, off Vercel and over plain http, are they sent without it.
const secureFor = (c: Context) => Boolean(env().VERCEL_ENV) || new URL(c.req.url).protocol === "https:" || /^(localhost|127\.0\.0\.1)(:|$)/.test(c.req.header("host") ?? "");
const cookieOptions = (c: Context, maxAge: number) => ({ httpOnly: true, secure: secureFor(c), sameSite: "Lax" as const, path: "/", maxAge });

// Finds this API's session cookies among everything the browser sent, by trying to decrypt each one.
export function readSession(c: Context) {
  let access: string | null = null, refresh: string | null = null;
  const names: string[] = [];
  for (const [name, value] of Object.entries(getCookie(c))) {
    const p = open(value);
    if (!p) continue;
    names.push(name);
    if (p.k === "a") access = p.t; else refresh = p.t;
  }
  return { access, refresh, names };
}

function clearNames(c: Context, names: string[]) {
  for (const name of names) deleteCookie(c, name, { path: "/", secure: secureFor(c) });
}

// Replaces any existing session cookies with freshly named, freshly encrypted ones.
export function issueSession(c: Context, tokens: SessionTokens) {
  clearNames(c, readSession(c).names);
  const now = Math.floor(Date.now() / 1000);
  setCookie(c, randomName(), seal({ k: "a", t: tokens.accessToken, iat: now, exp: now + ACCESS_TTL_SECONDS }), cookieOptions(c, ACCESS_TTL_SECONDS));
  setCookie(c, randomName(), seal({ k: "r", t: tokens.refreshToken, iat: now, exp: now + REFRESH_TTL_SECONDS }), cookieOptions(c, REFRESH_TTL_SECONDS));
}

export function clearSession(c: Context) {
  clearNames(c, readSession(c).names);
}
