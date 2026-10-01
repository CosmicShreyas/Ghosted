import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "./env.js";
import { ApiError, dbFail } from "./errors.js";
import { otpEmail, type OtpPurpose, type Tone } from "./mail/otp-email.js";
import { sendMail } from "./mail/mailer.js";
import type { EmailTheme } from "./mail/theme.js";
import { admin } from "./supabase.js";
import { limitBy } from "./security.js";

export type { OtpPurpose };
export const OTP_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_SECONDS = 60;
const TOKEN_MINUTES = 20;

const hmac = (purpose: string, value: string) => createHmac("sha256", env().AUTH_TOKEN_SECRET).update(`${purpose}:${value}`).digest("hex");
// Purpose is part of the key, so a sign-up code can never be used to reset a password (or vice versa).
const otpKey = (purpose: OtpPurpose, email: string) => hmac(`otp-${purpose}`, email);
const codeHash = (purpose: OtpPurpose, email: string, code: string) => hmac(`code-${purpose}`, `${email}:${code}`);
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Per-email limits, on top of the per-IP route limits: they follow the address across IPs, so
// nobody can flood one inbox or farm fresh codes for extra guesses by rotating IPs.
const EMAIL_LIMITS = {
  send: [{ max: 5, windowSeconds: 3600 }, { max: 10, windowSeconds: 86400 }],
  verify: [{ max: 15, windowSeconds: 3600 }],
};

async function limitEmail(action: keyof typeof EMAIL_LIMITS, purpose: OtpPurpose, email: string) {
  for (const { max, windowSeconds } of EMAIL_LIMITS[action]) {
    const message = action === "send"
      ? `Too many codes sent to this email. Try again ${windowSeconds > 3600 ? "tomorrow" : "in an hour"}.`
      : "Too many attempts for this email. Try again in an hour.";
    await limitBy(`otp-${action}-${purpose}-${windowSeconds}:${hmac("limit", email)}`, max, windowSeconds, message);
  }
}

// Codes that were requested but never entered would otherwise linger. About 1 in 20 sends sweeps
// every expired code, so the table only ever holds codes that are still usable.
async function sweepExpired() {
  const { error } = await admin().from("email_otps").delete().lt("expires_at", new Date().toISOString());
  if (error) console.error("[otp] sweep failed", error.message);
}

export async function sendCode(purpose: OtpPurpose, email: string, name?: string, tone: Tone = "sassy", theme: EmailTheme | null = "light") {
  if (Math.random() < 0.05) await sweepExpired();
  const key = otpKey(purpose, email);
  const { data: existing, error } = await admin().from("email_otps").select("last_sent_at").eq("email_hash", key).maybeSingle();
  if (error) dbFail("otp lookup", error);
  if (existing) {
    const wait = RESEND_SECONDS - Math.floor((Date.now() - new Date(existing.last_sent_at).getTime()) / 1000);
    if (wait > 0) throw new ApiError(429, "otp_cooldown", `Please wait ${wait}s before asking for a new code.`);
  }
  await limitEmail("send", purpose, email);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { error: upErr } = await admin().from("email_otps").upsert({
    email_hash: key, code_hash: codeHash(purpose, email, code), attempts: 0,
    expires_at: new Date(Date.now() + OTP_MINUTES * 60_000).toISOString(), last_sent_at: new Date().toISOString(),
  });
  if (upErr) dbFail("otp save", upErr);
  try {
    await sendMail(email, otpEmail({ purpose, code, ...(name ? { name } : {}), appUrl: env().FRONTEND_URL, minutes: OTP_MINUTES, tone }), { theme });
  } catch (err) {
    console.error("[mail] otp send failed", (err as Error).message);
    await admin().from("email_otps").delete().eq("email_hash", key);
    throw new ApiError(502, "email_failed", "We couldn't send the code right now. Please check the address and try again.");
  }
}

// Checks the code and deletes it on success (single use). Throws a friendly error otherwise.
export async function consumeCode(purpose: OtpPurpose, email: string, code: string) {
  await limitEmail("verify", purpose, email);
  const key = otpKey(purpose, email);
  const { data: row, error } = await admin().from("email_otps").select("*").eq("email_hash", key).maybeSingle();
  if (error) dbFail("otp read", error);
  const invalid = new ApiError(400, "otp_invalid", "That code isn't right. Check the latest email and try again.");
  if (!row) throw invalid;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await admin().from("email_otps").delete().eq("email_hash", key); // dead code: free the row now
    throw new ApiError(400, "otp_expired", "That code has expired. Ask for a new one.");
  }
  if (row.attempts >= MAX_ATTEMPTS) throw new ApiError(429, "otp_locked", "Too many wrong codes. Ask for a new one.");
  if (!same(row.code_hash, codeHash(purpose, email, code))) {
    await admin().from("email_otps").update({ attempts: row.attempts + 1 }).eq("email_hash", key);
    throw invalid;
  }
  await admin().from("email_otps").delete().eq("email_hash", key);
}

// Sign-up: exchanges a valid code for a short-lived signed "email verified" token.
export async function verifySignupCode(email: string, code: string) {
  await consumeCode("signup", email, code);
  const payload = Buffer.from(JSON.stringify({ e: otpKey("signup", email), x: Date.now() + TOKEN_MINUTES * 60_000 })).toString("base64url");
  return `${payload}.${hmac("verified", payload)}`;
}

// True only if `token` was issued by verifySignupCode for this exact email and hasn't expired.
export function isVerified(email: string, token: string) {
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !same(sig, hmac("verified", payload))) return false;
  try {
    const { e, x } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { e: string; x: number };
    return same(e, otpKey("signup", email)) && x > Date.now();
  } catch { return false; }
}
