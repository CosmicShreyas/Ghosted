// Ghosted email templates. Table layout + inline styles only, because that's what renders
// consistently across Gmail, Outlook and Apple Mail. Colours match the site's design tokens.
// The logo is an inline attachment (cid:), so it shows without the site being publicly reachable.
// Every template has a "sassy" and a "calm" voice; the user's Settings → Appearance → Tone picks one.
import { EMAIL_LOGO_CID } from "./logo.js";

export type Tone = "sassy" | "calm";
export type OtpPurpose = "signup" | "reset" | "mfa" | "mfa-setup" | "admin" | "rep";

const C = { bg: "#FAF7F2", ink: "#141110", muted: "#6B6560", card: "#FFFFFF", violet: "#6D28D9", accent: "#EDE3A6", red: "#EF4444", line: "#D9D2C7" };
const FONT = "'Space Grotesk','Segoe UI',Helvetica,Arial,sans-serif";
const BODY = "Inter,'Segoe UI',Helvetica,Arial,sans-serif";
const GITHUB = "https://github.com/CosmicShreyas/Ghosted";

export const escape = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

// `plain`: for sign-in codes. No links at all and no embedded logo: a first email from an unknown
// sender that links to a *.vercel.app address (phishing campaigns abuse those) and carries an image
// is exactly what spam filters look for. A code email needs neither.
type Shell = { appUrl: string; banner: string; heading: string; tagline?: string; intro: string; body?: string; footnote: string; preheader: string; subject: string; plain?: boolean };

// The shared frame: logo, bordered card with a banner, content, dashed divider, footnote, footer.
export function layout(s: Shell) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${escape(s.subject)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(s.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};"><tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
    <tr><td style="padding:0 4px 20px;">
      ${s.plain
        ? `<span style="color:${C.ink};font-family:${FONT};font-size:24px;font-weight:700;">Ghosted.</span>`
        : `<a href="${s.appUrl}" style="text-decoration:none;color:${C.ink};font-family:${FONT};font-size:24px;font-weight:700;">
        <img src="cid:${EMAIL_LOGO_CID}" width="36" height="36" alt="Ghosted" style="vertical-align:middle;border:0;margin-right:6px;">Ghosted.
      </a>`}
    </td></tr>
    <tr><td style="background:${C.card};border:2px solid ${C.ink};border-radius:16px;box-shadow:6px 6px 0 ${C.ink};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="background:${C.accent};border-bottom:2px solid ${C.ink};border-radius:14px 14px 0 0;padding:14px 28px;font-family:${BODY};font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${C.ink};">${escape(s.banner)}</td></tr>
        <tr><td style="padding:28px 28px 8px;font-family:${FONT};font-size:28px;line-height:1.2;font-weight:700;color:${C.ink};">${s.heading}${s.tagline ? `<br><span style="color:${C.violet};">${escape(s.tagline)}</span>` : ""}</td></tr>
        <tr><td style="padding:8px 28px 24px;font-family:${BODY};font-size:15px;line-height:1.6;color:${C.muted};">${s.intro}</td></tr>
        ${s.body ?? ""}
        <tr><td style="padding:0 28px;"><div style="border-top:2px dashed ${C.line};"></div></td></tr>
        <tr><td style="padding:20px 28px 28px;font-family:${BODY};font-size:13px;line-height:1.6;color:${C.muted};">${s.footnote}</td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:24px 4px 0;font-family:${BODY};font-size:12px;line-height:1.7;color:${C.muted};">
      The truth about hiring, from people who lived it.${s.plain ? "" : `<br>
      <a href="${s.appUrl}/privacy" style="color:${C.muted};">Privacy</a> &middot; <a href="${s.appUrl}/terms" style="color:${C.muted};">Terms</a> &middot; <a href="${GITHUB}" style="color:${C.muted};">Open source</a> &middot; <a href="${s.appUrl}/dashboard" style="color:${C.muted};">Email settings</a>`}
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

export const button = (href: string, label: string) => `<tr><td align="center" style="padding:0 28px 28px;"><a href="${href}" style="display:inline-block;background:${C.violet};color:#fff;border:2px solid ${C.ink};border-radius:10px;padding:12px 22px;font-family:${BODY};font-size:15px;font-weight:700;text-decoration:none;box-shadow:3px 3px 0 ${C.ink};">${escape(label)}</a></td></tr>`;

const COPY: Record<OtpPurpose, Record<Tone, { banner: string; heading: (n: string | null) => string; tagline?: string; intro: string; expiry: (m: number) => string; ignore: string; subject: (c: string) => string }>> = {
  signup: {
    sassy: { banner: "Email verification", heading: (n) => (n ? `Hey ${n}, here's your code.` : "Here's your code."), tagline: "We reply in seconds, not weeks.", intro: "Enter this code on Ghosted to verify your email and finish creating your anonymous account.", expiry: (m) => `Expires in <strong style="color:${C.ink};">${m} minutes</strong>. Unlike most offer letters, this one's actually valid.`, ignore: "Didn't ask for this? Ignore this email. No account is created without the code.", subject: (c) => `${c} is your Ghosted code` },
    calm: { banner: "Email verification", heading: (n) => (n ? `Hi ${n}, here's your code.` : "Here's your code."), intro: "Enter this code on Ghosted to verify your email and finish creating your account.", expiry: (m) => `This code expires in <strong style="color:${C.ink};">${m} minutes</strong>.`, ignore: "If you didn't request this, you can ignore this email. No account is created without the code.", subject: (c) => `${c} is your Ghosted verification code` },
  },
  reset: {
    sassy: { banner: "Password reset", heading: (n) => (n ? `Hey ${n}, here's your code.` : "Here's your code."), tagline: "Locked out? We don't ghost.", intro: "Enter this code on Ghosted to choose a new password. Your stories and anonymity stay exactly as they were.", expiry: (m) => `Expires in <strong style="color:${C.ink};">${m} minutes</strong>. Faster than any HR reply you've had.`, ignore: "Didn't ask for this? Ignore this email. Your password stays the same, and nobody gets in without this code.", subject: (c) => `${c} is your Ghosted password reset code` },
    calm: { banner: "Password reset", heading: (n) => (n ? `Hi ${n}, here's your code.` : "Here's your code."), intro: "Enter this code on Ghosted to choose a new password.", expiry: (m) => `This code expires in <strong style="color:${C.ink};">${m} minutes</strong>.`, ignore: "If you didn't request a reset, you can ignore this email. Your password won't change.", subject: (c) => `${c} is your Ghosted password reset code` },
  },
  mfa: {
    sassy: { banner: "Two-step sign-in", heading: (n) => (n ? `${n}, is that really you?` : "Is that really you?"), tagline: "Password: correct. Vibes: pending.", intro: "Someone just entered your password on Ghosted. If it was you, finish signing in with this code. If it wasn't, change your password now. A recruiter might be snooping.", expiry: (m) => `Expires in <strong style="color:${C.ink};">${m} minutes</strong>. It works once, then it ghosts itself.`, ignore: "Didn't just sign in? Someone knows your password. Reset it from the log-in page, and consider switching to an authenticator app in Settings.", subject: (c) => `${c} is your Ghosted sign-in code` },
    calm: { banner: "Two-step sign-in", heading: (n) => (n ? `Hi ${n}, confirm it's you.` : "Confirm it's you."), intro: "Your password was just entered on Ghosted. If this was you, finish signing in with the code below.", expiry: (m) => `This code expires in <strong style="color:${C.ink};">${m} minutes</strong> and works once.`, ignore: "If this wasn't you, someone may know your password. Please reset it from the log-in page.", subject: (c) => `${c} is your Ghosted sign-in code` },
  },
  "mfa-setup": {
    sassy: { banner: "Turn on email codes", heading: (n) => (n ? `Locking it down, ${n}?` : "Locking it down?"), tagline: "Two locks. Zero recruiters.", intro: "Enter this code in Settings to turn on email codes for two-step sign-in. After that, every log-in needs your password and a fresh code from your inbox.", expiry: (m) => `Expires in <strong style="color:${C.ink};">${m} minutes</strong>.`, ignore: "Didn't ask for this? Ignore this email. Nothing changes without the code.", subject: (c) => `${c} turns on two-step sign-in` },
    calm: { banner: "Turn on email codes", heading: (n) => (n ? `Hi ${n}, confirm two-step sign-in.` : "Confirm two-step sign-in."), intro: "Enter this code in Settings to turn on email codes. After that, signing in needs your password and a code sent to this address.", expiry: (m) => `This code expires in <strong style="color:${C.ink};">${m} minutes</strong>.`, ignore: "If you didn't request this, you can ignore this email.", subject: (c) => `${c} is your Ghosted confirmation code` },
  },
  admin: {
    sassy: { banner: "Admin panel", heading: (n) => (n ? `${n}, the keys are yours.` : "The keys are yours."), tagline: "With great power comes a great audit log.", intro: "Enter this code in the Ghosted admin panel to set your admin password. Every action you take there is logged.", expiry: (m) => `Expires in <strong style="color:${C.ink};">${m} minutes</strong> and works once.`, ignore: "Didn't ask for this? Ignore this email and nothing changes. If it keeps happening, tell the other owners.", subject: (c) => `${c} is your Ghosted admin code` },
    calm: { banner: "Admin panel", heading: (n) => (n ? `Hi ${n}, set your admin password.` : "Set your admin password."), intro: "Enter this code in the Ghosted admin panel to set your admin password.", expiry: (m) => `This code expires in <strong style="color:${C.ink};">${m} minutes</strong> and works once.`, ignore: "If you didn't request this, you can ignore this email. Nothing changes without the code.", subject: (c) => `${c} is your Ghosted admin code` },
  },
  rep: {
    sassy: { banner: "Right of Reply", heading: () => "Confirm you work here.", tagline: "Free. No dashboard. No delete button.", intro: "Someone asked to reply on Ghosted on behalf of your company using this work email. Enter this code to confirm. Verified reps can post one clearly labelled reply per story. They can't edit, hide or remove anything.", expiry: (m) => `Expires in <strong style="color:${C.ink};">${m} minutes</strong> and works once.`, ignore: "Didn't ask for this? Ignore this email. Nobody gets verified without the code.", subject: (c) => `${c} confirms your Ghosted company reply access` },
    calm: { banner: "Right of Reply", heading: () => "Confirm you represent your company.", intro: "Enter this code on Ghosted to confirm this work email. Verified representatives can post one clearly labelled reply per story and one on the company page.", expiry: (m) => `This code expires in <strong style="color:${C.ink};">${m} minutes</strong> and works once.`, ignore: "If you didn't request this, you can ignore this email.", subject: (c) => `${c} is your Ghosted verification code` },
  },
};

export function otpEmail({ purpose = "signup", code, name, appUrl, minutes, tone = "sassy" }: { purpose?: OtpPurpose; code: string; name?: string; appUrl: string; minutes: number; tone?: Tone }) {
  const t = COPY[purpose][tone];
  const first = name ? escape(name.split(" ")[0]!) : null;
  const digits = code.split("").map((d) => `<td align="center" style="width:48px;height:60px;border:2px solid ${C.ink};border-radius:10px;background:${C.card};font-family:${FONT};font-size:30px;font-weight:700;color:${C.violet};">${d}</td>`).join(`<td style="width:8px;"></td>`);
  const subject = t.subject(code);
  const html = layout({
    plain: true, // no links, no images (see Shell)
    appUrl, subject, banner: t.banner, heading: t.heading(first), ...(t.tagline && { tagline: t.tagline }), intro: t.intro,
    preheader: `Your code is ${code}. It expires in ${minutes} minutes.`,
    // The digit boxes, then a copy strip: the whole code as one unbroken string that a single tap or
    // click selects (user-select: all), since email can't run a real copy button. The plain-text
    // part says "Your code: 123456", the pattern Gmail and iOS look for to offer their own Copy.
    body: `<tr><td align="center" style="padding:0 28px 12px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${digits}</tr></table></td></tr>
        <tr><td align="center" style="padding:6px 28px 4px;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="border:2px dashed ${C.violet};border-radius:999px;background:${C.card};"><tr>
            <td style="padding:8px 6px 8px 16px;font-family:${BODY};font-size:12px;font-weight:700;color:${C.muted};white-space:nowrap;">Copy code</td>
            <td style="padding:8px 16px 8px 6px;font-family:${FONT};font-size:18px;font-weight:700;letter-spacing:3px;color:${C.ink};white-space:nowrap;-webkit-user-select:all;-moz-user-select:all;user-select:all;cursor:text;">${code}</td>
          </tr></table>
        </td></tr>
        <tr><td align="center" style="padding:2px 28px 6px;font-family:${BODY};font-size:12px;color:${C.muted};">Tap the code above to select it, then copy.</td></tr>
        <tr><td align="center" style="padding:4px 28px 28px;font-family:${BODY};font-size:13px;color:${C.muted};">${t.expiry(minutes)}</td></tr>`,
    footnote: `${escape(t.ignore)}<br>Ghosted will <strong style="color:${C.red};">never</strong> ask for this code by phone, chat or DM, and we never share your identity with employers.`,
  });
  const text = [t.heading(first).replace(/<[^>]+>/g, ""), "", `Your code: ${code}`, "", t.expiry(minutes).replace(/<[^>]+>/g, ""), "", t.ignore, "Ghosted will never ask for this code by phone, chat or DM.", "", "Ghosted"].join("\n");
  return { subject, html, text };
}
