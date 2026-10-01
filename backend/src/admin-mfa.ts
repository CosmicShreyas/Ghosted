// Two-step sign-in for admins: an authenticator app (TOTP) or a code emailed at sign-in, plus
// one-time recovery codes. Same algorithms as members' two-step sign-in (lib/totp.ts).
import { randomInt } from "node:crypto";
import type { Context } from "hono";
import { audit, sha256, startSession, type AdminEnv, type AdminUser } from "./admin-auth.js";
import { effective } from "./admin-perms.js";
import { env } from "./env.js";
import { ApiError } from "./errors.js";
import { sealJson, unsealJson } from "./lib/sealed.js";
import { hashRecovery, verifyTotp } from "./lib/totp.js";
import { sendMail } from "./mail/mailer.js";
import { otpEmail } from "./mail/otp-email.js";
import { admin as db } from "./supabase.js";

export const MFA_COLS = "mfa_method, totp_secret_z, totp_last_step, recovery_z, mfa_code_hash, mfa_expires_at, mfa_attempts";
export type MfaRow = { mfa_method: "none" | "totp" | "email"; totp_secret_z: string | null; totp_last_step: number | null; recovery_z: string | null; mfa_code_hash: string | null; mfa_expires_at: string | null; mfa_attempts: number };

// What the panel knows about the signed-in admin.
export const meDto = (a: AdminUser & { mfa_method?: string }) => ({
  name: a.name, email: a.email, role: a.role, permissions: effective(a), avatarSeed: a.avatar_seed, tone: a.tone, emailTheme: a.email_theme,
  mfaMethod: (a.mfa_method ?? "none") as "none" | "totp" | "email", fromEnv: a.from_env,
});

export async function finishLogin(c: Context, u: AdminUser & { mfa_method?: string }, device?: string | null) {
  await db().from("admin_users").update({ last_login_at: new Date().toISOString(), mfa_code_hash: null, mfa_attempts: 0 }).eq("id", u.id);
  const session = await startSession(c, u.id, device);
  c.set("admin", u);
  await audit(c as Context<AdminEnv>, "signed_in");
  return c.json({ ...session, admin: meDto(u) });
}

export async function sendAdminMfaCode(u: Pick<AdminUser, "id" | "email" | "name" | "tone" | "email_theme">, purpose: "mfa" | "mfa-setup" = "mfa") {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db().from("admin_users").update({ mfa_code_hash: sha256(`${u.id}:mfa:${code}`), mfa_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(), mfa_attempts: 0 }).eq("id", u.id);
  try { await sendMail(u.email, otpEmail({ purpose, code, name: u.name, appUrl: env().FRONTEND_URL, minutes: 10, tone: u.tone }), { theme: u.email_theme }); }
  catch (e) { console.error("[admin] mfa mail", (e as Error).message); throw new ApiError(502, "mail_failed", "Couldn't send the code email. Check the API's mail settings."); }
}

const wrong = () => new ApiError(400, "mfa_invalid", "That code isn't right. Check your app or inbox and try again.");

// An emailed code (what sendAdminMfaCode stored), checked with a 5-try cap.
export async function checkEmailCode(u: { id: string } & Pick<MfaRow, "mfa_code_hash" | "mfa_expires_at" | "mfa_attempts">, code: string) {
  if (!u.mfa_code_hash || !u.mfa_expires_at || new Date(u.mfa_expires_at).getTime() < Date.now() || u.mfa_attempts >= 5) throw new ApiError(400, "mfa_expired", "That code has expired. Ask for a new one.");
  if (sha256(`${u.id}:mfa:${code}`) !== u.mfa_code_hash) { await db().from("admin_users").update({ mfa_attempts: u.mfa_attempts + 1 }).eq("id", u.id); throw wrong(); }
  await db().from("admin_users").update({ mfa_code_hash: null, mfa_attempts: 0 }).eq("id", u.id);
}

export async function checkAdminSecondFactor(u: { id: string } & MfaRow, code: string) {
  const input = code.trim();
  if (/^[a-z0-9]{4}-[a-z0-9]{4}$/i.test(input)) {
    const hashes = unsealJson<string[]>(u.recovery_z) ?? [];
    const h = hashRecovery(input);
    if (!hashes.includes(h)) throw wrong();
    await db().from("admin_users").update({ recovery_z: sealJson(hashes.filter((x) => x !== h)) }).eq("id", u.id);
    return "recovery";
  }
  if (u.mfa_method === "totp") {
    const secret = unsealJson<string>(u.totp_secret_z);
    const step = secret ? verifyTotp(secret, input, u.totp_last_step) : null;
    if (step === null) throw wrong();
    await db().from("admin_users").update({ totp_last_step: step }).eq("id", u.id);
    return "totp";
  }
  if (u.mfa_method === "email") { await checkEmailCode(u, input); return "email"; }
  throw wrong();
}
