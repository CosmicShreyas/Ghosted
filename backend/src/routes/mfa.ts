// Settings → Two-factor authentication. All routes need a logged-in session.
import { Hono } from "hono";
import { z } from "zod";
import { ApiError, dbFail } from "../errors.js";
import { emailOf, verifySecondFactor } from "../mfa.js";
import { consumeCode, sendCode } from "../otp.js";
import { hashRecovery, newRecoveryCodes, newSecret, otpauthUri, verifyTotp } from "../lib/totp.js";
import { sealJson, unsealJson } from "../lib/sealed.js";
import { me, rateLimit, requireAuth, type AppEnv } from "../security.js";
import { admin } from "../supabase.js";
import { bump, later } from "../live.js";
import { validate } from "../validate.js";

const code6 = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code");
const anyCode = z.string().trim().min(6).max(12);

const update = async (id: string, patch: Record<string, unknown>) => {
  const { error } = await admin().from("profiles").update(patch).eq("id", id);
  if (error) dbFail("mfa update", error);
};

// Fresh recovery codes: shown to the user once, stored only as hashes.
const issueRecovery = async (id: string) => {
  const codes = newRecoveryCodes();
  await update(id, { recovery_z: sealJson(codes.map(hashRecovery)) });
  return codes;
};

export const mfaRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  // Any successful 2FA change updates Settings on this account's other open devices.
  .use(async (c, next) => { await next(); if (c.res.ok) later(bump({ user: me(c).id, topics: ["me"] })); })

  // Authenticator app, step 1: a new secret (kept pending until a code proves the app has it).
  .post("/totp/start", rateLimit({ name: "mfa-totp-start", max: 10, windowSeconds: 3600, by: "user" }), async (c) => {
    const p = me(c);
    if (p.mfa_method === "totp") throw new ApiError(409, "mfa_already_on", "Your authenticator app is already set up.");
    const secret = newSecret();
    await update(p.id, { totp_pending_z: sealJson(secret) });
    return c.json({ secret, uri: otpauthUri(secret, p.handle) });
  })

  // Step 2: the first code from the app switches it on and returns 8 one-time recovery codes.
  .post("/totp/confirm", rateLimit({ name: "mfa-totp-confirm", max: 15, windowSeconds: 900, by: "user" }), validate("json", z.object({ code: code6 })), async (c) => {
    const p = me(c);
    const secret = unsealJson<string>(p.totp_pending_z);
    if (!secret) throw new ApiError(400, "mfa_no_setup", "Start the setup again to get a fresh QR code.");
    const step = verifyTotp(secret, c.req.valid("json").code, null);
    if (step === null) throw new ApiError(400, "mfa_invalid", "That code doesn't match. Make sure your phone's clock is set automatically.");
    await update(p.id, { totp_secret_z: sealJson(secret), totp_pending_z: null, totp_last_step: step, mfa_method: "totp" });
    return c.json({ recoveryCodes: await issueRecovery(p.id) });
  })

  // Email codes (easier, less secure): step 1 sends a confirmation code, step 2 switches it on.
  .post("/email/start", rateLimit({ name: "mfa-email-start", max: 5, windowSeconds: 3600, by: "user" }), async (c) => {
    const p = me(c);
    if (p.mfa_method !== "none") throw new ApiError(409, "mfa_already_on", "Turn off your current two-step method first.");
    await sendCode("mfa-setup", await emailOf(p.id), undefined, p.tone, p.email_theme ?? null);
    return c.json({ ok: true });
  })
  .post("/email/confirm", rateLimit({ name: "mfa-email-confirm", max: 15, windowSeconds: 900, by: "user" }), validate("json", z.object({ code: code6 })), async (c) => {
    const p = me(c);
    await consumeCode("mfa-setup", await emailOf(p.id), c.req.valid("json").code);
    await update(p.id, { mfa_method: "email", totp_secret_z: null, totp_pending_z: null });
    return c.json({ recoveryCodes: await issueRecovery(p.id) });
  })

  // For email-method users: send a sign-in code to confirm a sensitive change (turning 2FA off, new recovery codes).
  .post("/send-code", rateLimit({ name: "mfa-send", max: 5, windowSeconds: 900, by: "user" }), async (c) => {
    const p = me(c);
    if (p.mfa_method !== "email") throw new ApiError(400, "mfa_not_email", "Use your authenticator app or a recovery code.");
    await sendCode("mfa", await emailOf(p.id), undefined, p.tone, p.email_theme ?? null);
    return c.json({ ok: true });
  })

  // Turning 2FA off needs a valid second factor, so a stolen session alone can't remove it.
  .post("/disable", rateLimit({ name: "mfa-disable", max: 10, windowSeconds: 3600, by: "user" }), validate("json", z.object({ code: anyCode })), async (c) => {
    const p = me(c);
    if (p.mfa_method === "none") return c.json({ ok: true });
    await verifySecondFactor(p, c.req.valid("json").code);
    await update(p.id, { mfa_method: "none", totp_secret_z: null, totp_pending_z: null, totp_last_step: null, recovery_z: null });
    return c.json({ ok: true });
  })

  .post("/recovery", rateLimit({ name: "mfa-recovery", max: 5, windowSeconds: 3600, by: "user" }), validate("json", z.object({ code: anyCode })), async (c) => {
    const p = me(c);
    if (p.mfa_method === "none") throw new ApiError(400, "mfa_off", "Turn on two-step sign-in first.");
    await verifySecondFactor(p, c.req.valid("json").code);
    return c.json({ recoveryCodes: await issueRecovery(p.id) });
  });
