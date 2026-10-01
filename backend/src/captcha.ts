// Ghosted Shield: our own layered human check.
//
// Layer 1 (always): signed proof-of-work. The server picks a salt and a secret number n and sends
//   challenge = SHA-256(salt + n); the browser searches for n. One person pays ~1 s; a bot farm pays it
//   on every single attempt. SHA-256 is the primitive on purpose: hand-rolled hashes are weaker.
//   The signature binds the puzzle to the requester's IP (hashed) and issue time, so puzzles can't be
//   farmed on one machine and spent on another, and "too fast to be a browser" solves are caught.
// Layer 2 (always): environment + behaviour scoring. Automation markers are blocked outright; robotic
//   pointer paths, machine-regular typing, instant submits, missing browser features and zero input
//   raise a risk score.
// Layer 3 (on suspicion): escalation. A ~5x harder puzzle AND a "hide the ghost" drag to a signed,
//   random target whose trajectory is checked. Repeat offenders (3 strikes / 30 min per IP) start at
//   this level for every check.
//
// Honest limits: signals come from the browser, so a determined, custom-built bot can fake them.
// Together with rate limits, the aim is to make abuse slow, expensive and noisy.
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import { env } from "./env.js";
import { ApiError, dbFail } from "./errors.js";
import { ipKey, limitBy } from "./security.js";
import { admin } from "./supabase.js";

const TTL_SECONDS = 300;
export const LEVELS = { normal: 150_000, hard: 800_000 } as const;
export type Level = keyof typeof LEVELS;
const ESCALATE_AT = 30; // risk score that triggers the extra check
const STRIKES = { max: 3, windowSeconds: 1800 };
// Fastest plausible in-browser hashing: the widget's Web Worker solver does ~0.5M hashes/s per core,
// up to 4 cores, so ~2M/s on a fast laptop. 20M/s leaves generous headroom for fast machines while
// native/GPU solvers (hundreds of millions to billions per second) still stand out.
const MAX_BROWSER_HASHES_PER_SEC = 20_000_000;
const MIN_SOLVE_MS = 400; // the widget never hands over a token sooner than this

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
// Everything the browser must not change, plus who it was issued to, is covered by the signature.
const sign = (parts: (string | number)[]) => createHmac("sha256", env().AUTH_TOKEN_SECRET).update(`shield:v2:${parts.join(":")}`).digest("hex");

// ---------- strikes (per IP) ----------

const strikeKey = (c: Context) => `shield-strike:${ipKey(c)}`;

async function strikes(c: Context) {
  const { data, error } = await admin().rpc("rate_limit_peek", { p_key: strikeKey(c), p_window_seconds: STRIKES.windowSeconds });
  if (error) { console.error("[shield] peek failed (run supabase/init_database.sql on a fresh project)", error.message); return 0; }
  return Number(data) || 0;
}

async function strike(c: Context, why: string) {
  console.warn("[shield] strike", why);
  const { error } = await admin().rpc("rate_limit_hit", { p_key: strikeKey(c), p_window_seconds: STRIKES.windowSeconds });
  if (error) dbFail("shield strike", error);
}

// ---------- challenges ----------

export async function createChallenge(c: Context, requested: Level = "normal") {
  // Repeat offenders don't get the easy path.
  const level: Level = requested === "hard" || (await strikes(c)) >= STRIKES.max ? "hard" : "normal";
  const salt = randomBytes(12).toString("hex");
  const iat = Date.now();
  const expires = Math.floor(iat / 1000) + TTL_SECONDS;
  const maxNumber = LEVELS[level];
  const challenge = sha256(`${salt}${randomInt(0, maxNumber)}`);
  // Hard challenges also carry a random hiding spot for the ghost (fraction of the track width).
  const target = level === "hard" ? +(0.55 + Math.random() * 0.35).toFixed(3) : 0;
  return { algorithm: "SHA-256", level, salt, challenge, maxNumber, target, iat, expires, signature: sign([challenge, maxNumber, target, iat, expires, ipKey(c)]) };
}

// ---------- behaviour scoring ----------

type Env = {
  webdriver: boolean; ua: string; brands: string; langs: number; cores: number; touchPoints: number; screen: number[]; outer: number[];
  renderer: string; finePointer: boolean; plugins?: number; chromeObj?: boolean; hiddenMs?: number; tz?: string;
};
type Signals = { v: number; dwell: number; moves: number; path: number; straightness: number; turns: number; speedCv: number; keys: number; keyCv: number; keyMean: number; clicks: number; touches: number; scrolls: number; focus: number; untrusted: number; trusted: number; env: Env };
type Gesture = { pts: [number, number, number][]; end: number }; // [x 0..1, y px, t ms]

const AUTOMATION = /HeadlessChrome|PhantomJS|Puppeteer|Playwright|Selenium|Electron|Cypress|jsdom|WebDriver|Nightmare|Zombie|slimerjs|python-requests|curl|wget|httpclient|okhttp|axios|node-fetch|Go-http-client|Scrapy|bot\b|crawler|spider/i;

export function assess(s: Signals | undefined) {
  const reasons: string[] = [];
  if (!s || s.v !== 1 || typeof s.env !== "object" || s.env === null) return { block: true, risk: 100, reasons: ["no signals"] };
  const e = s.env;
  // Hard blocks: unmistakable automation.
  if (e.webdriver) return { block: true, risk: 100, reasons: ["webdriver"] };
  if (AUTOMATION.test(e.ua) || /HeadlessChrome/i.test(e.brands)) return { block: true, risk: 100, reasons: ["automation user agent"] };
  if (s.untrusted > 3 && s.untrusted > s.trusted) return { block: true, risk: 100, reasons: ["synthetic events"] };
  if (s.dwell < 400) return { block: true, risk: 100, reasons: ["submitted before the page could be read"] };

  let risk = 0;
  const add = (points: number, why: string) => { risk += points; reasons.push(why); };
  const chromeUa = /Chrome\/\d/.test(e.ua) && !/Edg\/|OPR\//.test(e.ua);
  const mobileUa = /Android|iPhone|iPad|Mobile/i.test(e.ua);
  // Environment: what real browsers always have.
  if (/SwiftShader|llvmpipe|Mesa OffScreen|Software Rasterizer/i.test(e.renderer)) add(35, "software renderer");
  if (!e.renderer) add(10, "no WebGL");
  if (e.langs === 0) add(25, "no languages");
  if (e.outer[0] === 0 || e.outer[1] === 0) add(25, "zero-size window");
  if ((e.outer[0] ?? 0) > (e.screen[0] ?? 0) + 50 || (e.outer[1] ?? 0) > (e.screen[1] ?? 0) + 50) add(15, "window larger than screen");
  if (e.cores === 0) add(10, "no cores reported");
  if (chromeUa && !mobileUa && e.plugins === 0) add(20, "desktop Chrome without plugins");
  // Desktop only: several mobile Chromium browsers (Samsung Internet, in-app browsers) lack window.chrome.
  if (chromeUa && !mobileUa && e.chromeObj === false) add(20, "Chrome without window.chrome");
  if (mobileUa && e.touchPoints === 0) add(20, "mobile UA without touch");
  // Behaviour: how the page was actually used.
  // Phones autofill email + password and submit in one tap, so "fast" and "little input" weigh less there.
  if (s.dwell < 2500) add(mobileUa ? 10 : 25, "submitted fast");
  const inputs = s.moves + s.keys + s.touches + s.clicks;
  if (inputs === 0) add(45, "no input at all");
  else if (inputs < 4 && !mobileUa) add(15, "barely any input");
  if (e.hiddenMs !== undefined && s.dwell > 0 && e.hiddenMs / s.dwell > 0.95 && s.keys > 0) add(20, "typed while the page was hidden");
  // Pointer: humans curve, wobble and vary speed. Scripts move in straight lines at constant speed.
  if (s.moves >= 15) {
    if (s.straightness > 0.97 && s.turns < 2) add(25, "perfectly straight pointer path");
    if (s.speedCv < 0.12) add(20, "constant pointer speed");
    if (s.turns === 0) add(10, "pointer never changed direction");
  }
  if (e.finePointer && !mobileUa && s.moves === 0 && s.clicks > 0) add(20, "clicked without ever moving the mouse");
  // Typing: human key gaps are uneven. (Paste and password managers produce no keys, which is fine.)
  if (s.keys >= 8 && (s.keyCv < 0.1 || s.keyMean < 15)) add(25, "machine-regular typing");
  return { block: false, risk, reasons };
}

// The escalation drag: ends on the signed target, took human time, and moved like a hand.
export function gestureOk(g: Gesture | undefined, target: number) {
  if (!g || !Array.isArray(g.pts) || g.pts.length < 8 || g.pts.length > 120) return false;
  if (Math.abs(g.end - target) > 0.06) return false;
  const first = g.pts[0]!, last = g.pts[g.pts.length - 1]!;
  const duration = last[2] - first[2];
  if (duration < 250 || duration > 20_000) return false;
  const speeds: number[] = [];
  let wobble = 0, backtrack = 0;
  for (let i = 1; i < g.pts.length; i++) {
    const [x0, y0, t0] = g.pts[i - 1]!, [x1, y1, t1] = g.pts[i]!;
    if (t1 <= t0) return false; // time must move forward
    speeds.push(Math.abs(x1 - x0) / (t1 - t0));
    wobble += Math.abs(y1 - y0);
    if (x1 < x0) backtrack++;
  }
  const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
  const cv = mean ? Math.sqrt(speeds.reduce((a, b) => a + (b - mean) ** 2, 0) / speeds.length) / mean : 0;
  // Uneven speed and a little vertical drift: a hand, not a tween. A path that only ever goes straight
  // right at exactly regular steps is a script; a few tiny corrections are normal.
  return cv > 0.15 && wobble > 1 && backtrack < g.pts.length / 2;
}

// ---------- verification ----------

type Solution = { salt: string; number: number; challenge: string; maxNumber: number; target: number; iat: number; expires: number; signature: string; signals?: Signals; gesture?: Gesture };

// Throws unless `token` is a valid, unexpired, never-used solution from a human-looking session,
// issued to this same client.
export async function verifyChallenge(c: Context, token: string | undefined) {
  const fail = new ApiError(400, "captcha_failed", "Nice try, recruiter. We couldn't confirm you're human. Please run the check again.");
  if (!token) throw new ApiError(400, "captcha_required", "Please complete the human check first.");
  let s: Solution;
  try { s = JSON.parse(Buffer.from(token, "base64url").toString()) as Solution; } catch { await strike(c, "garbled token"); throw fail; }
  if (typeof s.salt !== "string" || typeof s.challenge !== "string" || typeof s.signature !== "string" || ![s.number, s.maxNumber, s.expires, s.iat].every(Number.isInteger) || typeof s.target !== "number") { await strike(c, "malformed token"); throw fail; }
  if (s.expires < Date.now() / 1000) throw new ApiError(400, "captcha_expired", "The human check went stale. It's re-running itself now.");
  // Wrong signature = forged, altered, or issued to a different IP (e.g. your network changed).
  if (!same(s.signature, sign([s.challenge, s.maxNumber, s.target, s.iat, s.expires, ipKey(c)]))) throw new ApiError(400, "captcha_expired", "Your connection changed mid-check. It's re-running itself now.");
  if (s.number < 0 || s.number > s.maxNumber || !same(sha256(`${s.salt}${s.number}`), s.challenge)) { await strike(c, "wrong answer"); throw fail; }

  // Solved faster than any browser could hash: a native or GPU solver.
  const elapsed = Date.now() - s.iat;
  if (elapsed < MIN_SOLVE_MS || elapsed < (s.number / MAX_BROWSER_HASHES_PER_SEC) * 1000) {
    await strike(c, `solved in ${elapsed} ms`);
    throw new ApiError(400, "captcha_escalate", "That was suspiciously fast. Even our servers can't type that quick.");
  }

  const verdict = assess(s.signals);
  if (verdict.block) {
    await strike(c, verdict.reasons.join(", "));
    throw new ApiError(403, "captcha_blocked", "Automated browsers can't use Ghosted. If you're a human, try a regular browser window.");
  }
  const hard = s.maxNumber >= LEVELS.hard;
  // Single use: the same solution can't be replayed. Marked used in parallel with the strike lookup
  // (one database wait instead of two); a token that fails below is spent either way, and the widget
  // always fetches a fresh puzzle after a submit.
  const [strikeCount, used] = await Promise.all([
    strikes(c),
    limitBy(`captcha-used:${s.challenge}`, 1, TTL_SECONDS, "That human check was already used. It's re-running itself now.").then(() => null, (err: unknown) => err),
  ]);
  if (used) throw used;
  if ((verdict.risk >= ESCALATE_AT || strikeCount >= STRIKES.max) && !hard) {
    await strike(c, `risk ${verdict.risk}: ${verdict.reasons.join(", ")}`);
    throw new ApiError(400, "captcha_escalate", "Hmm, you move a bit like a recruiter's script. One quick extra check.");
  }
  if (hard && !gestureOk(s.gesture, s.target)) { await strike(c, "failed drag"); throw new ApiError(400, "captcha_escalate", "The recruiter spotted you. Drag the ghost all the way into the bushes."); }
}
