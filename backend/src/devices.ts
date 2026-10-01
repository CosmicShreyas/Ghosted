// Signed-in devices (Settings → Security) and the "new sign-in" security email.
//
// Every Supabase sign-in has a session id inside its access token. At sign-in we record which device,
// browser and rough location it came from, keyed by that id. Signing
// one device out deletes its Supabase session, which ends it everywhere on its next request.
import { createHmac, randomBytes } from "node:crypto";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { env } from "./env.js";
import { newSignInEmail } from "./mail/security-email.js";
import { sendMail } from "./mail/mailer.js";
import { ipKey, type Profile } from "./security.js";
import { admin } from "./supabase.js";

export type DeviceKind = "mobile" | "tablet" | "desktop";
export type Device = { kind: DeviceKind; browser: string; os: string; city: string | null; region: string | null; country: string | null };

// Reads the session id from a Supabase access token. The token has already been issued or verified
// by Supabase when this runs, so decoding (not verifying) the payload is enough.
export function sessionIdOf(accessToken: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString()) as { session_id?: unknown };
    return typeof payload.session_id === "string" ? payload.session_id : null;
  } catch { return null; }
}

// Friendly names from the browser's own request headers. Client hints (sec-ch-ua-*) are more
// reliable than the user agent where Chromium sends them; the user agent covers everything else.
export function deviceOf(c: Context): Device {
  const ua = c.req.header("user-agent") ?? "";
  const hintMobile = c.req.header("sec-ch-ua-mobile");
  const hintPlatform = c.req.header("sec-ch-ua-platform")?.replace(/"/g, "");

  const browser =
    /Edg(A|iOS)?\//.test(ua) ? "Edge" :
    /OPR\/|Opera/.test(ua) ? "Opera" :
    /SamsungBrowser\//.test(ua) ? "Samsung Internet" :
    /Firefox\/|FxiOS\//.test(ua) ? "Firefox" :
    /Chrome\/|CriOS\//.test(ua) ? "Chrome" :
    /Safari\//.test(ua) ? "Safari" : "Browser";

  const os =
    /iPad/.test(ua) ? "iPadOS" :
    /iPhone|iPod/.test(ua) ? "iOS" :
    /Android/.test(ua) ? "Android" :
    hintPlatform === "Windows" || /Windows/.test(ua) ? "Windows" :
    hintPlatform === "macOS" || /Mac OS X/.test(ua) ? "macOS" :
    hintPlatform === "Chrome OS" || /CrOS/.test(ua) ? "ChromeOS" :
    /Linux/.test(ua) ? "Linux" : "Unknown OS";

  const kind: DeviceKind =
    /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? "tablet" :
    hintMobile === "?1" || /Mobile|iPhone|iPod|Android/.test(ua) ? "mobile" : "desktop";

  // Vercel adds a city-level location (from the public IP) to every request; locate() fills the gap
  // when it's missing. Nothing more precise than the city is ever kept.
  const geo = (name: string) => { const v = c.req.header(name); try { return v ? decodeURIComponent(v).slice(0, 80) : null; } catch { return null; } };
  return { kind, browser, os, city: geo("x-vercel-ip-city"), region: geo("x-vercel-ip-country-region"), country: geo("x-vercel-ip-country") };
}

// ---------- recognising the same device ----------

const DEVICE_COOKIE = "gdv";
const DEVICE_TTL_SECONDS = 400 * 86400; // the longest browsers allow
// Every browser gets a random device id in an HttpOnly cookie on its first sign-in and keeps it. Only
// a keyed hash reaches the database, so a leaked table can't be matched back to a cookie.
export function deviceKey(c: Context): string {
  let id = getCookie(c, DEVICE_COOKIE);
  if (!id || !/^[A-Za-z0-9_-]{22}$/.test(id)) id = randomBytes(16).toString("base64url");
  const secure = Boolean(env().VERCEL_ENV) || new URL(c.req.url).protocol === "https:" || /^(localhost|127\.0\.0\.1)(:|$)/.test(c.req.header("host") ?? "");
  setCookie(c, DEVICE_COOKIE, id, { httpOnly: true, secure, sameSite: "Lax", path: "/", maxAge: DEVICE_TTL_SECONDS }); // renewed on every sign-in
  return createHmac("sha256", env().SESSION_COOKIE_KEY).update(`device:${id}`).digest("hex");
}

export const clientIp = (c: Context) => c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "";
// 49.36.118.20 → "49.36.x.x"; 2401:4900:1c2a:5e10:… → "2401:4900:1c2a:5e10:x:x:x:x". Only this is stored.
export function maskIp(ip: string): string | null {
  const v4 = ip.replace(/^::ffff:/i, "").match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (v4) return `${v4[1]}.${v4[2]}.x.x`;
  if (ip.includes(":")) {
    const [head = "", tail = ""] = ip.split("::");
    const groups = [...head.split(":").filter(Boolean), ...Array(Math.max(0, 8 - head.split(":").filter(Boolean).length - tail.split(":").filter(Boolean).length)).fill("0"), ...tail.split(":").filter(Boolean)];
    if (groups.length === 8 && groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return `${groups.slice(0, 4).join(":").toLowerCase()}:x:x:x:x`;
  }
  return null;
}

const PRIVATE_IP =/^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80:|::ffff:(10|127|192\.168)\.)/i;

// City-level location from the device's public IP, via ipwho.is (HTTPS, no key). The IP is sent for
// this one lookup and not stored. Behind Wi-Fi or mobile data the public IP is the router's or the
// carrier's, so the city is the connection's, which can be off by a city or two.
//
// In local development the API only sees a private address (your phone and PC share the Wi-Fi's
// public IP), so it looks up this network's own public IP instead. Never done on Vercel.
async function locate(c: Context): Promise<Pick<Device, "city" | "region" | "country">> {
  const ip = clientIp(c);
  const publicIp = ip && !PRIVATE_IP.test(ip) ? ip : null;
  if (!publicIp && env().VERCEL_ENV) return { city: null, region: null, country: null };
  try {
    const res = await fetch(`https://ipwho.is/${publicIp ?? ""}?fields=success,city,region,country_code`, { signal: AbortSignal.timeout(2500) });
    const g = (await res.json()) as { success?: boolean; city?: string; region?: string; country_code?: string };
    if (!g.success) return { city: null, region: null, country: null };
    const clip = (s?: string) => (s ? s.slice(0, 80) : null);
    return { city: clip(g.city), region: clip(g.region), country: clip(g.country_code) };
  } catch { return { city: null, region: null, country: null }; }
}

export const placeOf = (d: Pick<Device, "city" | "region" | "country">) => [d.city, d.region, d.country].filter(Boolean).join(", ") || null;

// Records a fresh sign-in, replaces the same device's older session (so Settings shows each device
// once), then sends the security email. Best-effort: a failure here never blocks the sign-in itself.
// `deviceHash` comes from deviceKey(), which has to run before the response is sent (it sets a cookie).
export async function recordSignIn(c: Context, profile: Pick<Profile, "id" | "handle" | "tone" | "email_theme">, accessToken: string, email: string | null, deviceHash: string | null) {
  const sessionId = sessionIdOf(accessToken);
  if (!sessionId) return;
  const seen = deviceOf(c);
  const ipMasked = maskIp(clientIp(c));
  // Runs after the response (see later() in auth.ts), so this lookup never slows the sign-in.
  const device = seen.city || seen.country ? seen : { ...seen, ...(await locate(c)) };
  const { error } = await admin().from("session_devices").upsert({ session_id: sessionId, user_id: profile.id, ...device, device_hash: deviceHash, ip_masked: ipMasked, ip_hash: ipKey(c) }, { onConflict: "session_id" });
  if (error) console.error("[devices] record (run supabase/init_database.sql on a fresh project)", error.code, error.message);
  else {
    const { error: e2 } = await admin().rpc("replace_device_sessions", { p_user: profile.id, p_keep: sessionId, p_hash: deviceHash, p_browser: device.browser, p_os: device.os, p_kind: device.kind, p_ip: ipMasked });
    if (e2) console.error("[devices] replace", e2.message);
  }
  if (email) {
    try { await sendMail(email, newSignInEmail({ appUrl: env().FRONTEND_URL, tone: profile.tone, handle: profile.handle, device, place: placeOf(device), at: new Date() }), { theme: profile.email_theme ?? null }); }
    catch (err) { console.error("[devices] sign-in email", (err as Error).message); }
  }
}

// Marks a session as recently active. Called when its tokens refresh (about hourly), so "last active"
// stays meaningful without a database write on every request.
export async function touchSession(accessToken: string) {
  const sessionId = sessionIdOf(accessToken);
  if (!sessionId) return;
  const { error } = await admin().from("session_devices").update({ last_seen_at: new Date().toISOString() }).eq("session_id", sessionId);
  if (error) console.error("[devices] touch", error.code);
}

type Row = Device & { session_id: string; public_id: number; created_at: string; last_seen_at: string; ip_masked?: string | null };

// The list shown in Settings. Internal session ids stay on the server; the page gets public ids.
export async function listDevices(userId: string, currentToken: string | undefined) {
  const current = currentToken ? sessionIdOf(currentToken) : null;
  const { data, error } = await admin().rpc("live_sessions", { p_user: userId });
  if (error) { console.error("[devices] list (run supabase/init_database.sql on a fresh project)", error.message); return []; }
  return ((data ?? []) as Row[]).map((r) => ({
    publicId: String(r.public_id),
    kind: r.kind, browser: r.browser, os: r.os, place: placeOf(r), ip: r.ip_masked ?? null,
    signedInAt: r.created_at, lastSeenAt: r.last_seen_at,
    current: r.session_id === current,
  })).sort((a, b) => Number(b.current) - Number(a.current));
}

export async function revokeDevice(userId: string, publicId: string) {
  const { data, error } = await admin().rpc("revoke_session", { p_user: userId, p_public_id: publicId });
  if (error) { console.error("[devices] revoke", error.message); return false; }
  return data === true;
}
