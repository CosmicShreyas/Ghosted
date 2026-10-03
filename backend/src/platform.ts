// Platform switches the admin panel controls (signups, posting, chitchats, donations, read-only mode,
// a site-wide announcement), plus IP bans and member bans. Read on hot paths, so both are cached
// per server instance for 30 seconds; the admin panel refreshes the cache on every change.
import type { Context, MiddlewareHandler } from "hono";
import { ApiError } from "./errors.js";
import { ipKey } from "./security.js";
import { admin as db } from "./supabase.js";

export type Announcement = { text: string; tone: "info" | "warn" | "good"; link: string | null } | null;
export type GoofyControls = {
  enabled: boolean; blockVulgarity: boolean; holdRisky: boolean; fileReports: boolean; strikes: boolean;
  redactNames: boolean; queueSweep: boolean; welcomeMembers: boolean; rescanPublished: boolean;
  ghostJobAlerts: boolean; weeklyReports: boolean; dailyBriefs: boolean; refreshWordLists: boolean; learnFromOutcomes: boolean;
};
export const GOOFY_DEFAULTS: GoofyControls = {
  enabled: true, blockVulgarity: true, holdRisky: true, fileReports: true, strikes: true,
  redactNames: true, queueSweep: true, welcomeMembers: true, rescanPublished: true,
  ghostJobAlerts: true, weeklyReports: true, dailyBriefs: true, refreshWordLists: true, learnFromOutcomes: true,
};
export type Platform = {
  signupsOpen: boolean; postingOpen: boolean; chitchatsOpen: boolean; donationsOpen: boolean; reportsOpen: boolean;
  readOnly: boolean; readOnlyMessage: string; announcement: Announcement; goofy: GoofyControls;
  // The database plan's storage limit, for the admin Storage page (Supabase free tier: 500 MB).
  storageLimitMb: number;
};
export const DEFAULTS: Platform = {
  signupsOpen: true, postingOpen: true, chitchatsOpen: true, donationsOpen: true, reportsOpen: true,
  readOnly: false, readOnlyMessage: "Ghosted is in read-only mode for a little while. You can still read everything.", announcement: null, goofy: GOOFY_DEFAULTS,
  storageLimitMb: 500,
};

let cache: { at: number; value: Platform } | null = null;
export async function platform(fresh = false): Promise<Platform> {
  if (!fresh && cache && Date.now() - cache.at < 30_000) return cache.value;
  const { data, error } = await db().from("platform_settings").select("key, value");
  if (error) return cache?.value ?? DEFAULTS; // uninitialized database: everything stays open safely
  const value = { ...DEFAULTS } as Record<string, unknown>;
  for (const r of (data ?? []) as { key: string; value: unknown }[]) if (r.key in DEFAULTS) value[r.key] = r.key === "goofy" ? { ...GOOFY_DEFAULTS, ...(r.value as Partial<GoofyControls>) } : r.value;
  cache = { at: Date.now(), value: value as Platform };
  return cache.value;
}
export async function goofyControls(fresh = false) { return (await platform(fresh)).goofy; }

const CLOSED: Record<"signupsOpen" | "postingOpen" | "chitchatsOpen" | "donationsOpen" | "reportsOpen", string> = {
  signupsOpen: "New sign-ups are paused for now. Please try again later.",
  postingOpen: "New stories are paused for a little while. Your drafts are safe.",
  chitchatsOpen: "Chitchats are paused for a little while.",
  donationsOpen: "Donations are paused right now. Thank you for thinking of us.",
  reportsOpen: "Reports are paused for a moment. Please try again shortly.",
};
export async function ensureOpen(k: keyof typeof CLOSED) {
  const p = await platform();
  if (p.readOnly) throw new ApiError(503, "read_only", p.readOnlyMessage);
  if (!p[k]) throw new ApiError(503, "paused", CLOSED[k]);
}

// ---------- IP bans ----------
let bans: { at: number; set: Map<string, number | null> } | null = null;
export async function ipBans(fresh = false) {
  if (!fresh && bans && Date.now() - bans.at < 30_000) return bans.set;
  const { data, error } = await db().from("ip_bans").select("ip_hash, expires_at");
  const set = new Map<string, number | null>();
  if (!error) for (const r of (data ?? []) as { ip_hash: string; expires_at: string | null }[]) set.set(r.ip_hash, r.expires_at ? new Date(r.expires_at).getTime() : null);
  bans = { at: Date.now(), set };
  return set;
}

// Every public API request: banned connections get nothing; read-only mode blocks writes other than
// signing in and out. The admin API is never affected.
const AUTH_OK = /^\/v1\/auth\/(login|logout|refresh|login\/mfa)$/;
export const platformGate: MiddlewareHandler = async (c: Context, next) => {
  const path = c.req.path;
  if (path.startsWith("/v1/admin") || path === "/v1/donations/webhook" || path.startsWith("/v1/cron")) return next();
  const until = (await ipBans()).get(ipKey(c));
  if (until !== undefined && (until === null || until > Date.now())) throw new ApiError(403, "ip_banned", "Access to Ghosted from this connection has been blocked for breaking the community rules.");
  if (c.req.method !== "GET" && c.req.method !== "OPTIONS" && !AUTH_OK.test(path)) {
    const p = await platform();
    if (p.readOnly) throw new ApiError(503, "read_only", p.readOnlyMessage);
  }
  await next();
};

// ---------- member bans ----------
export function banOf(p: { banned_at?: string | null; banned_until?: string | null; ban_reason?: string | null }) {
  if (!p.banned_at) return null;
  if (p.banned_until && new Date(p.banned_until).getTime() <= Date.now()) return null;
  return { until: p.banned_until ?? null, reason: p.ban_reason ?? null };
}
export function bannedError(b: { until: string | null; reason: string | null }) {
  const when = b.until ? ` until ${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(b.until))}` : "";
  return new ApiError(403, "account_banned", `This account has been suspended${when} for breaking the community rules${b.reason ? `: ${b.reason}` : "."} If you think this is a mistake, write to the team from the contact page.`);
}
