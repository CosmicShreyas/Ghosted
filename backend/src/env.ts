import { z } from "zod";

const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  ALLOWED_ORIGINS: z.string().min(1).transform((v) => v.split(",").map((o) => o.trim()).filter(Boolean)),
  IP_HASH_SECRET: z.string().min(32, "IP_HASH_SECRET must be at least 32 characters"),
  PII_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, "PII_ENCRYPTION_KEY must be 64 hex characters (32 bytes)"),
  AUTH_TOKEN_SECRET: z.string().min(32, "AUTH_TOKEN_SECRET must be at least 32 characters"),
  SESSION_COOKIE_KEY: z.string().regex(/^[0-9a-f]{64}$/i, "SESSION_COOKIE_KEY must be 64 hex characters (32 bytes)"),
  MAIL_DRIVER: z.enum(["smtp", "console"]).default("smtp"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  // true = implicit TLS (port 465); false = STARTTLS upgrade (port 587). Defaults from the port.
  SMTP_SECURE: z.enum(["true", "false"]).optional().transform((v) => (v === undefined ? undefined : v === "true")),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM_EMAIL: z.string().email(),
  MAIL_FROM_NAME: z.string().min(1).default("Ghosted"),
  // Optional monitored address for replies (for Gmail, this may be a plus-address alias).
  MAIL_REPLY_TO_EMAIL: z.string().email().optional().or(z.literal("").transform(() => undefined)),
  MAIL_REPLY_TO_NAME: z.string().min(1).optional().or(z.literal("").transform(() => undefined)),
  // The website's address: every link in every email is built from it. Required (no fallback), so
  // an email can never point at the wrong site.
  FRONTEND_URL: z.string().url("FRONTEND_URL must be the site's full address, e.g. https://your-frontend-project.vercel.app").transform((u) => u.replace(/\/+$/, "")),
  VERCEL_ENV: z.string().optional(),
  // Vercel Cron sends this as "Authorization: Bearer <CRON_SECRET>" (weekly digest). 16+ chars.
  CRON_SECRET: z.string().min(16).optional(),
  // Where Goofy sends his daily brief of things that need a human (comma-separated). Optional.
  // The admin app's address(es), comma-separated. Admin endpoints answer only requests from these
  // origins; empty = the admin API is switched off entirely (every /v1/admin call is a 404).
  ADMIN_ORIGINS: z.string().optional().transform((v) => (v ?? "").split(",").map((o) => o.trim()).filter(Boolean)),
  // Who the admins are: "email:Name:role" entries, comma-separated (role is owner or moderator).
  // No passwords here: each admin sets their own from the panel with a code emailed to them.
  ADMIN_EMAILS: z.string().optional().transform((v) => (v ?? "").split(",").map((e) => e.trim()).filter(Boolean).map((entry) => {
    const [email = "", name, role] = entry.split(":").map((s) => s.trim());
    return { email: email.toLowerCase(), name: name || email.split("@")[0]!, role: (["owner", "admin", "moderator", "viewer"] as const).find((r) => r === role) ?? ("moderator" as const) };
  }).filter((a) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a.email))),
  // Donations through Razorpay (routes/donations.ts). All optional: without them, donating says
  // "not set up yet". The key secret and webhook secret never leave the server.
  RAZORPAY_KEY_ID: z.string().regex(/^rzp_(test|live)_[A-Za-z0-9]+$/, "RAZORPAY_KEY_ID looks like rzp_test_… or rzp_live_…").optional().or(z.literal("").transform(() => undefined)),
  RAZORPAY_KEY_SECRET: z.string().min(8).optional().or(z.literal("").transform(() => undefined)),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(8).optional().or(z.literal("").transform(() => undefined)),
  // Phone notifications (Web Push, push.ts). All three or none: without them push stays off and the
  // site says notifications aren't available yet. The private key never leaves the server.
  VAPID_PUBLIC_KEY: z.string().regex(/^[A-Za-z0-9_-]{80,100}$/, "VAPID_PUBLIC_KEY looks like a long base64url string (npx web-push generate-vapid-keys)").optional().or(z.literal("").transform(() => undefined)),
  VAPID_PRIVATE_KEY: z.string().regex(/^[A-Za-z0-9_-]{40,50}$/, "VAPID_PRIVATE_KEY looks like a base64url string (npx web-push generate-vapid-keys)").optional().or(z.literal("").transform(() => undefined)),
  VAPID_SUBJECT: z.string().regex(/^(mailto:|https:\/\/)/, "VAPID_SUBJECT is mailto:you@example.com or an https:// URL").optional().or(z.literal("").transform(() => undefined)),
  MODERATOR_EMAILS: z.string().optional().transform((s) => (s ?? "").split(",").map((x) => x.trim()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))),
}).superRefine((e, ctx) => {
  const need = (key: keyof typeof e, why: string) => { if (!e[key]) ctx.addIssue({ code: "custom", path: [key], message: why }); };
  if (e.MAIL_DRIVER === "smtp") need("SMTP_HOST", "required when MAIL_DRIVER=smtp");
  // Printing codes to the console in production would leak them into hosting logs.
  if (e.MAIL_DRIVER === "console" && e.VERCEL_ENV === "production") ctx.addIssue({ code: "custom", path: ["MAIL_DRIVER"], message: "console is for local development only" });
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

// Validated once per instance; a missing secret fails loudly instead of running half-configured.
export function env(): Env {
  if (!cached) {
    // APP_URL was the old name for FRONTEND_URL; still read so existing deployments keep working.
    const parsed = schema.safeParse({ ...process.env, FRONTEND_URL: process.env.FRONTEND_URL ?? process.env.APP_URL });
    if (!parsed.success) {
      const missing = parsed.error.issues.map((i) => `${i.path.join(".")} (${i.message})`).join(", ");
      throw new Error(`Invalid backend environment: ${missing}. See backend/env.example.`);
    }
    cached = parsed.data;
  }
  return cached;
}
