import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../env.js";
import { EMAIL_LOGO_BASE64, EMAIL_LOGO_CID } from "./logo.js";
import { themeEmail, type EmailTheme } from "./theme.js";

type Message = { subject: string; html: string; text: string };

// MAIL_DRIVER picks how email is sent:
//   brevo   → Brevo HTTPS API (production)
//   smtp    → any SMTP server (development: Mailpit, Gmail app password, Brevo SMTP…)
//   console → no email; the message is printed to the terminal (quickest local testing)
// `theme`: the reader's Ghosted theme; dark readers get the "after hours" version (mail/theme.ts).
export async function sendMail(to: string, input: Message, { theme = "light" }: { theme?: EmailTheme | null } = {}) {
  const message = { ...input, html: themeEmail(input.html, theme ?? "light") };
  const driver = env().MAIL_DRIVER;
  if (driver === "brevo") return sendBrevo(to, message);
  if (driver === "smtp") return sendSmtp(to, message);
  console.log(`\n[mail:console] To: ${to}\nSubject: ${message.subject}\n\n${message.text}\n`);
}

// Brevo transactional API. Docs: https://developers.brevo.com/reference/sendtransacemail
async function sendBrevo(to: string, message: Message) {
  const e = env();
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": e.BREVO_API_KEY!, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: e.MAIL_FROM_NAME, email: e.MAIL_FROM_EMAIL },
      to: [{ email: to }],
      subject: message.subject,
      // Brevo's API has no inline (cid) images, so point at the hosted logo on the live site instead.
      htmlContent: message.html.replaceAll(`cid:${EMAIL_LOGO_CID}`, `${e.FRONTEND_URL}/ghosted-mark.png`),
      textContent: message.text,
      // A unique ID stops Gmail threading every code email into one conversation.
      headers: { "X-Entity-Ref-ID": crypto.randomUUID() },
      tags: ["otp"],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

let transport: Transporter | undefined;

async function sendSmtp(to: string, message: Message) {
  const e = env();
  transport ??= nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_SECURE ?? e.SMTP_PORT === 465, // 465 = implicit TLS; 587 upgrades with STARTTLS
    // Authenticated servers must upgrade to TLS, so the password never travels in plain text.
    requireTLS: !!e.SMTP_USER && !(e.SMTP_SECURE ?? e.SMTP_PORT === 465),
    ...(e.SMTP_USER ? { auth: { user: e.SMTP_USER, pass: e.SMTP_PASS } } : {}),
  });
  await transport.sendMail({
    from: `"${e.MAIL_FROM_NAME}" <${e.MAIL_FROM_EMAIL}>`, to, ...message,
    headers: { "X-Entity-Ref-ID": crypto.randomUUID() },
    // The logo travels inside the email and is referenced as cid:ghosted-logo in the HTML.
    attachments: [{ filename: "ghosted.png", content: Buffer.from(EMAIL_LOGO_BASE64, "base64"), cid: EMAIL_LOGO_CID, contentType: "image/png", contentDisposition: "inline" }],
  });
}
