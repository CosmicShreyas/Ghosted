import { Hono, type Context } from "hono";
import { z } from "zod";
import { ApiError, dbFail } from "../errors.js";
import { isGeneratedHandle } from "../lib/handles.js";
import { isAvatarSeed, isPastel, me, optionalAuth, rateLimit, requireAuth, type AppEnv, type Profile } from "../security.js";
import { verifyChallenge } from "../captcha.js";
import { privateProfile } from "./me.js";
import { deviceKey, recordSignIn } from "../devices.js";
import { bump, later } from "../live.js";
import { addNotification } from "../notify.js";
import { clearSession, issueSession, readSession } from "../session-cookies.js";
import { emailOf, makeTicket, openTicket, profileById, verifySecondFactor } from "../mfa.js";
import { admin, auth } from "../supabase.js";
import { fullName, validate } from "../validate.js";
import { sealToBytea } from "../lib/sealed.js";
import { banOf, bannedError, ensureOpen } from "../platform.js";
import { consumeCode, isVerified, OTP_MINUTES, sendCode, verifySignupCode } from "../otp.js";

const email = z.string().trim().toLowerCase().email().max(254);
// Length beats complexity rules; 10+ chars, and not absurdly long (bcrypt truncates at 72 bytes).
const password = z.string().min(10, "Use at least 10 characters").max(72);
const captchaToken = z.string().max(12000).optional();
const emailTheme = z.enum(["light", "dark"]).optional();

// Tokens never go to the page: they're set as encrypted HttpOnly cookies (see session-cookies.ts).
const startSession = (c: Context, s: { access_token: string; refresh_token: string }) =>
  issueSession(c, { accessToken: s.access_token, refreshToken: s.refresh_token });

// A brand-new sign-in: remember the device for Settings → Security, tell the account's other open
// pages, and send the "new sign-in" security email (skipped right after sign-up). All of it runs
// after the response, so logging in never waits on it.
function signedIn(c: Context, userId: string, accessToken: string, { profile, email }: { profile: Profile | null; email: string | null }) {
  const who = { id: userId, handle: profile?.handle ?? "there", tone: profile?.tone ?? "sassy", email_theme: profile?.email_theme ?? "light" } as const;
  const device = (() => { try { return deviceKey(c); } catch { return null; } })(); // sets the device cookie, so before the response
  later(recordSignIn(c, who, accessToken, email, device).then(() => bump({ user: userId, topics: ["sessions"] })));
}

export const authRoutes = new Hono<AppEnv>()
  // Step 1: email a 6-digit code. 60 s cooldown per address, plus an IP limit.
  .post("/otp/send", rateLimit({ name: "otp-send", max: 6, windowSeconds: 900 }), rateLimit({ name: "otp-send-day", max: 20, windowSeconds: 86400 }), validate("json", z.object({ email, name: fullName.optional(), captchaToken, emailTheme }).strict()), async (c) => {
    const body = c.req.valid("json");
    await ensureOpen("signupsOpen");
    await verifyChallenge(c, body.captchaToken);
    // Do not send a sign-up code to an inbox that already owns an account. This intentionally
    // matches password recovery's product decision: a clear answer after the human check, protected
    // by the tight per-IP limits above, is more useful than walking an existing member through a
    // sign-up flow that can never succeed. The createUser check below remains the race-condition net.
    const { data: existing, error: lookupError } = await admin().rpc("user_id_by_email", { p_email: body.email });
    if (lookupError) dbFail("signup email lookup", lookupError);
    if (existing) throw new ApiError(409, "email_exists", "Plot twist: you're already one of us. This email has a Ghosted account—log in instead.", { email: "Plot twist: you're already one of us. Log in instead." });
    // No account yet, so the page says which theme it's showing; the code email matches it.
    await sendCode("signup", body.email, body.name, "sassy", body.emailTheme ?? "light");
    return c.json({ ok: true, expiresInMinutes: OTP_MINUTES });
  })

  // Step 2: check the code. Returns a signed token that proves this email was verified (20 min).
  .post("/otp/verify", rateLimit({ name: "otp-verify", max: 20, windowSeconds: 900 }), validate("json", z.object({ email, code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code") }).strict()), async (c) => {
    const { email: e, code } = c.req.valid("json");
    return c.json({ verificationToken: await verifySignupCode(e, code) });
  })

  // Step 3: create the account. Only possible with a valid verification token for this email.
  .post("/signup", rateLimit({ name: "signup", max: 8, windowSeconds: 3600 }), validate("json", z.object({
    fullName, email, password,
    verificationToken: z.string().min(20).max(512),
    handle: z.string().refine(isGeneratedHandle, "Pick a generated handle").optional(),
    avatarSeed: z.string().refine(isAvatarSeed, "Invalid avatar").optional(),
    pastel: z.string().refine(isPastel, "Invalid colour").optional(),
    // Must be exactly true: the Terms and Privacy Policy have to be accepted to sign up.
    acceptTerms: z.literal(true, { error: "Please accept the Terms and Privacy Policy" }),
    captchaToken,
  }).strict()), async (c) => {
    await ensureOpen("signupsOpen");
    const body = c.req.valid("json");
    if (!isVerified(body.email, body.verificationToken)) throw new ApiError(403, "email_not_verified", "Please verify your email again. The code step has expired.");
    // The full name is sealed (compressed + encrypted) before it ever reaches Supabase.
    const meta = { handle: body.handle, avatar_seed: body.avatarSeed, pastel: body.pastel, details_z: sealToBytea({ name: body.fullName }), terms_accepted_at: new Date().toISOString() };
    // Email ownership is already proven by our code, so the user is created as confirmed.
    const { error } = await admin().auth.admin.createUser({ email: body.email, password: body.password, email_confirm: true, user_metadata: meta });
    // Safe to say it exists: only the verified owner of this inbox can reach this point.
    if (error?.code === "email_exists" || error?.status === 422) throw new ApiError(409, "email_exists", "Plot twist: you're already one of us. This email has a Ghosted account—log in instead.");
    if (error?.code === "weak_password") throw new ApiError(400, "weak_password", "That password is too common or weak. Try a longer one.");
    if (error) { console.error("[auth] signup", error.code, error.message); throw new ApiError(400, "signup_failed", "We couldn't create your account right now. Please try again."); }
    const { data, error: sErr } = await auth().signInWithPassword({ email: body.email, password: body.password });
    if (sErr || !data.session) throw new ApiError(500, "server_error", "Account created. Please log in.");
    startSession(c, data.session);
    signedIn(c, data.user.id, data.session.access_token, { profile: null, email: null });
    later(addNotification(data.user.id, "system", "Welcome to Ghosted. You're anonymous by default: share your first story whenever you're ready."));
    return c.json({ ok: true }, 201);
  })

  .post("/login", rateLimit({ name: "login", max: 15, windowSeconds: 900 }), validate("json", z.object({ email, password: z.string().min(1).max(72), captchaToken })), async (c) => {
    const { email: e, password: p, captchaToken: ct } = c.req.valid("json");
    // The human check and the password check run side by side (they're independent round trips).
    // A failed check still wins: its error is thrown and the sign-in result is thrown away unseen.
    const [check, signIn] = await Promise.allSettled([verifyChallenge(c, ct), auth().signInWithPassword({ email: e, password: p })]);
    if (check.status === "rejected") throw check.reason;
    if (signIn.status === "rejected") throw signIn.reason;
    const { data, error } = signIn.value;
    if (error?.code === "email_not_confirmed") throw new ApiError(403, "email_not_confirmed", "Please confirm your email first. Check your inbox.");
    if (error || !data.session) throw new ApiError(401, "invalid_credentials", "Email or password is incorrect.");
    // Two-step accounts: no session yet. The tokens wait inside an encrypted 5-minute ticket.
    const profile = await profileById(c, data.user.id);
    const ban = profile && banOf(profile);
    if (ban) throw bannedError(ban);
    if (profile && profile.mfa_method !== "none") {
      if (profile.mfa_method === "email") await sendCode("mfa", e, undefined, profile.tone, profile.email_theme ?? null);
      return c.json({ mfaRequired: true, method: profile.mfa_method, ticket: makeTicket(data.user.id, data.session.access_token, data.session.refresh_token) });
    }
    startSession(c, data.session);
    signedIn(c, data.user.id, data.session.access_token, { profile, email: e });
    // The profile rides along, so the site can open the dashboard without asking for it again.
    return c.json({ ok: true, ...(profile && { profile: privateProfile(profile) }) });
  })

  // Two-step sign-in, step 2: the ticket from /login plus an authenticator, email or recovery code.
  .post("/login/mfa", rateLimit({ name: "login-mfa", max: 20, windowSeconds: 900 }), validate("json", z.object({ ticket: z.string().min(40).max(8000), code: z.string().trim().min(6).max(12) }).strict()), async (c) => {
    const { ticket, code } = c.req.valid("json");
    const t = openTicket(ticket);
    const profile = await profileById(c, t.uid);
    if (!profile) throw new ApiError(401, "mfa_ticket_expired", "Please sign in again.");
    const used = await verifySecondFactor(profile, code);
    issueSession(c, { accessToken: t.a, refreshToken: t.r });
    signedIn(c, t.uid, t.a, { profile, email: await emailOf(t.uid).catch(() => null) });
    return c.json({ ok: true, usedRecoveryCode: used === "recovery" });
  })

  .post("/login/mfa/resend", rateLimit({ name: "login-mfa-resend", max: 5, windowSeconds: 900 }), validate("json", z.object({ ticket: z.string().min(40).max(8000) }).strict()), async (c) => {
    const t = openTicket(c.req.valid("json").ticket);
    const profile = await profileById(c, t.uid);
    if (profile?.mfa_method !== "email") throw new ApiError(400, "mfa_not_email", "Use your authenticator app or a recovery code.");
    await sendCode("mfa", await emailOf(t.uid), undefined, profile.tone, profile.email_theme ?? null);
    return c.json({ ok: true });
  })

  // Rotates the session cookies explicitly. Rarely needed: any authenticated request refreshes on its own.
  .post("/refresh", rateLimit({ name: "refresh", max: 45, windowSeconds: 900 }), async (c) => {
    const { refresh } = readSession(c);
    const { data, error } = refresh ? await auth().refreshSession({ refresh_token: refresh }) : { data: null, error: true };
    if (error || !data?.session) { clearSession(c); throw new ApiError(401, "session_expired", "Your session has expired. Please log in again."); }
    startSession(c, data.session);
    return c.json({ ok: true });
  })

  // Password reset, step 1: says straight away if no account uses this email; otherwise emails a code.
  // Trade-off (product decision): clearer for users, but it confirms whether an email is registered,
  // so the tight per-IP limits below are what keep anyone from checking emails in bulk.
  .post("/password/forgot", rateLimit({ name: "forgot", max: 8, windowSeconds: 3600 }), rateLimit({ name: "forgot-day", max: 20, windowSeconds: 86400 }), validate("json", z.object({ email, captchaToken }).strict()), async (c) => {
    const { email: e, captchaToken: ct } = c.req.valid("json");
    await verifyChallenge(c, ct);
    const { data: userId, error } = await admin().rpc("user_id_by_email", { p_email: e });
    if (error) dbFail("user by email", error);
    if (!userId) throw new ApiError(404, "no_account", "There's no Ghosted account with this email. Check for typos, or sign up instead.");
    const profile = await profileById(c, userId as string);
    await sendCode("reset", e, undefined, profile?.tone ?? "sassy", profile?.email_theme ?? null);
    // Tells the page whether the reset step will also need an authenticator code.
    return c.json({ ok: true, expiresInMinutes: OTP_MINUTES, needsAuthenticator: profile?.mfa_method === "totp" });
  })

  // Step 2: code + new password in one request. Signs out every other session, then logs this one in.
  .post("/password/reset", rateLimit({ name: "reset", max: 15, windowSeconds: 900 }), validate("json", z.object({ email, code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"), password, mfaCode: z.string().trim().min(6).max(12).optional() }).strict()), async (c) => {
    const { email: e, code, password: p, mfaCode } = c.req.valid("json");
    const { data: userId, error } = await admin().rpc("user_id_by_email", { p_email: e });
    if (error) dbFail("user by email", error);
    if (!userId) throw new ApiError(400, "otp_invalid", "That code isn't right. Check the latest email and try again.");
    // With an authenticator app on, access to the inbox alone isn't enough to take over the account.
    const profile = await profileById(c, userId as string);
    if (profile?.mfa_method === "totp" && !mfaCode) throw new ApiError(400, "mfa_required", "Enter the code from your authenticator app (or a recovery code) too.");
    await consumeCode("reset", e, code);
    if (profile?.mfa_method === "totp") await verifySecondFactor(profile, mfaCode!);
    const { error: uErr } = await admin().auth.admin.updateUserById(userId as string, { password: p });
    if (uErr?.code === "weak_password") throw new ApiError(400, "weak_password", "That password is too common or weak. Try a longer one.");
    if (uErr?.code === "same_password") throw new ApiError(400, "same_password", "That's your current password. Pick a new one.");
    if (uErr) dbFail("update password", uErr);
    const { data, error: sErr } = await auth().signInWithPassword({ email: e, password: p });
    if (sErr || !data.session) throw new ApiError(500, "server_error", "Password changed. Please log in.");
    // Anyone who knew the old password is kicked out everywhere else.
    await admin().auth.admin.signOut(data.session.access_token, "others").catch(() => undefined);
    startSession(c, data.session);
    signedIn(c, userId as string, data.session.access_token, { profile, email: e });
    return c.json({ ok: true });
  })

  // Signs out every device: revokes all refresh tokens for this user, then clears this browser's cookies.
  .post("/logout-all", rateLimit({ name: "logout-all", max: 10, windowSeconds: 3600 }), requireAuth, async (c) => {
    const token = c.get("accessToken");
    if (token) {
      const { error } = await admin().auth.admin.signOut(token, "global");
      if (error) { console.error("[auth] logout-all", error.code); throw new ApiError(500, "server_error", "Couldn't sign out other devices. Try again."); }
    }
    clearSession(c);
    later(bump({ user: me(c).id, topics: ["sessions"] })); // other open pages notice and log out
    return c.json({ ok: true });
  })

  // Revokes this session's refresh token server-side (so a copied token stops working) and clears
  // the cookies. Always succeeds, even if the session had already expired.
  .post("/logout", optionalAuth, async (c) => {
    const token = c.get("accessToken");
    if (token) {
      const { error } = await admin().auth.admin.signOut(token, "local");
      if (error) console.error("[auth] logout", error.code);
    }
    clearSession(c);
    const profile = c.get("profile");
    if (profile) later(bump({ user: profile.id, topics: ["sessions"] }));
    return c.json({ ok: true });
  });
