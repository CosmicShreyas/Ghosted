// Writes every email template, in both tones, to email-previews/ so you can open them in a browser.
// Links use FRONTEND_URL from .env, exactly like real emails.
// Run: npx tsx --env-file=.env scripts/preview-email.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { otpEmail, type OtpPurpose, type Tone } from "../src/mail/otp-email.js";
import { digestEmail, relatableEmail, replyEmail } from "../src/mail/notify-email.js";
import { newSignInEmail } from "../src/mail/security-email.js";
import { EMAIL_LOGO_BASE64, EMAIL_LOGO_CID } from "../src/mail/logo.js";
import { themeEmail } from "../src/mail/theme.js";

const appUrl = (process.env.FRONTEND_URL ?? process.env.APP_URL)?.replace(/\/+$/, "");
if (!appUrl) { console.error("Set FRONTEND_URL in backend/.env to the public app's full URL, then run again."); process.exit(1); }
// Browsers can't resolve cid: images, so the preview inlines the logo as a data URI. Every
// template is also written in the dark ("after hours") version dark-mode readers receive.
const inline = (html: string) => html.replaceAll(`cid:${EMAIL_LOGO_CID}`, `data:image/png;base64,${EMAIL_LOGO_BASE64}`);
const write = (name: string, html: string) => {
  writeFileSync(`email-previews/${name}.html`, inline(html));
  writeFileSync(`email-previews/${name}-dark.html`, inline(themeEmail(html, "dark")));
  files.push(`${name}.html`, `${name}-dark.html`);
};
mkdirSync("email-previews", { recursive: true });

const files: string[] = [];
for (const tone of ["sassy", "calm"] as Tone[]) {
  for (const purpose of ["signup", "reset", "mfa", "mfa-setup"] as OtpPurpose[]) {
    write(`${purpose}-${tone}`, otpEmail({ purpose, tone, code: "482913", name: "Priya Sharma", appUrl, minutes: 10 }).html);
  }
  const notify = {
    relatable: relatableEmail({ appUrl, tone, handle: "Velvet Pangolin", title: "Ghosted after the final round at HushLoop", count: 42 }),
    reply: replyEmail({ appUrl, tone, handle: "Velvet Pangolin", title: "Ghosted after the final round at HushLoop", reply: "Same thing happened to me in March. They reposted the role a week later." }),
    "new-sign-in": newSignInEmail({ appUrl, tone, handle: "Velvet Pangolin", device: { kind: "mobile", browser: "Chrome", os: "Android", city: "Bengaluru", region: "Karnataka", country: "IN" }, place: "Bengaluru, Karnataka, IN", at: new Date() }),
    digest: digestEmail({ appUrl, tone, handle: "Velvet Pangolin", top: [{ company: "RedKite Digital", title: "Offer revoked two days after I resigned", outcome: "offer_revoked" }, { company: "Nimbus Labs", title: "Two rounds, clear feedback, decision in three days", outcome: "offer" }], flagged: [{ company: "HushLoop", title: "Four interviews, then 40 days of silence", outcome: "ghosted" }] }),
  };
  for (const [name, mail] of Object.entries(notify)) write(`${name}-${tone}`, mail.html);
}
writeFileSync("email-previews/index.html", `<!doctype html><meta charset="utf-8"><title>Ghosted emails</title><body style="font-family:sans-serif;padding:24px"><h1>Ghosted email previews</h1><ul>${files.map((f) => `<li><a href="${f}">${f}</a></li>`).join("")}</ul>`);
console.log(`Wrote ${files.length} previews. Open email-previews/index.html`);
