// Two-factor authentication: authenticator app (TOTP) or email codes, plus one-time recovery codes.
import type { Context } from "hono";
import { ApiError, dbFail } from "./errors.js";
import { hashRecovery, verifyTotp } from "./lib/totp.js";
import { sealJson, unsealJson } from "./lib/sealed.js";
import { consumeCode } from "./otp.js";
import { limitBy, type Profile } from "./security.js";
import { admin } from "./supabase.js";

const TICKET_SECONDS = 300;
const RECOVERY = /^[a-z0-9]{4}-[a-z0-9]{4}$/i;

export async function emailOf(userId: string) {
  const { data, error } = await admin().auth.admin.getUserById(userId);
  if (error || !data.user?.email) dbFail("user email", error);
  return data.user!.email!;
}

// Checks a second factor for `p`: a 6-digit code (authenticator or email, per their method) or a
// recovery code. Wrong attempts are capped per user, whichever IP they come from.
export async function verifySecondFactor(p: Profile, code: string) {
  await limitBy(`mfa-try:${p.id}`, 10, 900, "Too many attempts. Wait 15 minutes, or use a recovery code later.");
  const wrong = new ApiError(400, "mfa_invalid", "That code isn't right. Check your app or inbox and try again.");
  const input = code.trim();

  if (RECOVERY.test(input)) {
    const hashes = unsealJson<string[]>(p.recovery_z) ?? [];
    const h = hashRecovery(input);
    if (!hashes.includes(h)) throw wrong;
    const { error } = await admin().from("profiles").update({ recovery_z: sealJson(hashes.filter((x) => x !== h)) }).eq("id", p.id);
    if (error) dbFail("use recovery code", error);
    return "recovery" as const; // each recovery code works exactly once
  }

  if (p.mfa_method === "totp") {
    const secret = unsealJson<string>(p.totp_secret_z);
    if (!secret) throw wrong;
    const step = verifyTotp(secret, input, p.totp_last_step);
    if (step === null) throw wrong;
    const { error } = await admin().from("profiles").update({ totp_last_step: step }).eq("id", p.id);
    if (error) dbFail("totp step", error);
    return "totp" as const;
  }

  if (p.mfa_method === "email") {
    await consumeCode("mfa", await emailOf(p.id), input);
    return "email" as const;
  }
  throw wrong;
}

// Sign-in ticket: holds the already-issued Supabase session (encrypted) until the second factor passes.
// The browser can't read or alter it; it expires in 5 minutes.
type Ticket = { uid: string; a: string; r: string; exp: number };

export const makeTicket = (uid: string, access: string, refresh: string) =>
  sealJson({ uid, a: access, r: refresh, exp: Math.floor(Date.now() / 1000) + TICKET_SECONDS } satisfies Ticket).slice(2);

export function openTicket(ticket: string) {
  const t = unsealJson<Ticket>(`\\x${ticket}`);
  if (!t || t.exp < Date.now() / 1000) throw new ApiError(401, "mfa_ticket_expired", "That sign-in took too long. Please enter your password again.");
  return t;
}

export async function profileById(c: Context, id: string) {
  void c;
  const { data, error } = await admin().from("profiles").select("*").eq("id", id).maybeSingle();
  if (error) dbFail("profile by id", error);
  return data as Profile | null;
}
