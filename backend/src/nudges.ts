// Waiting Room → story. When an application someone is tracking crosses the point the Waiting Room
// calls "ghosted" (twice the usual wait, and at least 30 days), they get one notification and one
// email suggesting they share what happened, with the company and round already filled in.
// One nudge per application (applications.nudged_at). Runs with the daily automation.
import { benchmarks } from "./routes/applications.js";
import { env } from "./env.js";
import { sendMail } from "./mail/mailer.js";
import { button, escape, layout } from "./mail/otp-email.js";
import { addNotification } from "./notify.js";
import { admin } from "./supabase.js";
import { pushEnabled, quietHoursIST, sendPush } from "./push.js";

const DAY = 86400_000;
type App = { id: string; user_id: string; company_id: string | null; company_name: string; stage: string; waiting_since: string; company: { slug: string } | null; profile: { handle: string; tone: "sassy" | "calm"; email_theme: "light" | "dark" | null; notify: { weeklyDigest?: boolean } | null } | null };

function nudgeEmail({ appUrl, handle, company, days, link, tone }: { appUrl: string; handle: string; company: string; days: number; link: string; tone: "sassy" | "calm" }) {
  const subject = tone === "sassy" ? `${company} has gone quiet for ${days} days` : `It's been ${days} days since ${company} replied`;
  const html = layout({
    appUrl, subject, banner: "Your Waiting Room",
    heading: tone === "sassy" ? `${escape(handle)}, ${escape(company)} has gone quiet.` : `Hi ${escape(handle)}, no word from ${escape(company)}.`,
    ...(tone === "sassy" && { tagline: "Day " + days + " of silence. That's not a process, that's a ghost." }),
    intro: `It's been <strong>${days} days</strong> since you last heard from ${escape(company)}, more than twice the usual wait. Sharing what happened takes about 30 seconds, and it warns the next candidate.`,
    preheader: `${days} days of silence from ${company}. Share it in 30 seconds.`,
    body: button(link, "Share what happened"),
    footnote: "You're getting this because you tracked this application in the Waiting Room. We send it once per application.",
  });
  return { subject, html, text: `It's been ${days} days since you last heard from ${company}. Share what happened in about 30 seconds: ${link}` };
}

// The Waiting Room's own "ghosted" rule: twice the usual wait, and never before 30 days.
export const isGhosted = (days: number, usual: number | null | undefined) => days >= Math.max(30, (usual ?? 14) * 2);

// Day 7 and day 14 of silence on an open application: one push each, "Time for a polite follow-up".
// Counted from waiting_since (the last time they heard anything), so moving to a new round or
// restarting the clock starts the reminders over: reminder_since remembers which wait they were
// for. Never during quiet hours (the daily job runs in the morning, India time). An application
// already past day 20 when this first sees it is marked done without a push, so nobody gets a pile
// of stale reminders.
export async function remindFollowups() {
  if (!pushEnabled() || quietHoursIST()) return { sent: 0, skipped: "quiet hours or push off" };
  const cutoff = new Date(Date.now() - 7 * DAY).toISOString().slice(0, 10);
  const { data, error } = await admin().from("applications")
    .select("id, user_id, company_name, waiting_since, reminder_level, reminder_since")
    .eq("status", "waiting").lte("waiting_since", cutoff).limit(2000);
  if (error) { console.error("[remind] list (run the Waiting Room reminders section of init_database.sql)", error.message); return { sent: 0 }; }
  let sent = 0;
  for (const a of (data ?? []) as { id: string; user_id: string; company_name: string; waiting_since: string; reminder_level: number | null; reminder_since: string | null }[]) {
    const days = Math.floor((Date.now() - new Date(a.waiting_since).getTime()) / DAY);
    const done = a.reminder_since === a.waiting_since ? a.reminder_level ?? 0 : 0;
    const due = days >= 14 ? 2 : days >= 7 ? 1 : 0;
    if (due <= done) continue;
    // Marked first, so a second run can never send the same reminder twice.
    const { error: markErr } = await admin().from("applications").update({ reminder_level: due, reminder_since: a.waiting_since }).eq("id", a.id);
    if (markErr || days > 20) continue;
    const body = due === 1
      ? `A week of silence from ${a.company_name}. A short, friendly check-in often gets things moving.`
      : `Two weeks and still nothing from ${a.company_name}. One polite follow-up, then you can let them go.`;
    await sendPush(a.user_id, { kind: "reminder", body, url: "/dashboard?view=waiting", tag: `ghosted-reminder-${a.id}` });
    sent++;
  }
  return { sent };
}

export async function nudgeQuietApplications() {
  const cutoff = new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10);
  const { data, error } = await admin().from("applications")
    .select("id, user_id, company_id, company_name, stage, waiting_since, company:companies(slug), profile:profiles!applications_user_id_fkey(handle, tone, email_theme, notify)")
    .eq("status", "waiting").is("nudged_at", null).lte("waiting_since", cutoff).limit(500);
  if (error) { console.error("[nudge] list", error.message); return 0; }
  const apps = (data ?? []) as unknown as App[];
  if (!apps.length) return 0;
  const usual = await benchmarks([...new Set(apps.map((a) => a.company_id).filter((x): x is string => !!x))]);
  let sent = 0;
  for (const a of apps) {
    const days = Math.floor((Date.now() - new Date(a.waiting_since).getTime()) / DAY);
    if (!isGhosted(days, usual(a.company_id, a.stage)?.days)) continue;
    // Marked first, so a second run can never send it twice.
    const { data: claimed } = await admin().from("applications").update({ nudged_at: new Date().toISOString() }).eq("id", a.id).is("nudged_at", null).select("id");
    if (!claimed?.length) continue;
    const link = `${env().FRONTEND_URL}/dashboard?share=1${a.company?.slug ? `&company=${a.company.slug}` : ""}&outcome=ghosted`;
    await addNotification(a.user_id, "system", `${a.company_name} has gone quiet for ${days} days. Share what happened? It takes about 30 seconds and warns the next candidate.`);
    const { data: user } = await admin().auth.admin.getUserById(a.user_id);
    if (user.user?.email && a.profile?.notify?.weeklyDigest !== false) {
      try { await sendMail(user.user.email, nudgeEmail({ appUrl: env().FRONTEND_URL, handle: a.profile?.handle ?? "there", company: a.company_name, days, link, tone: a.profile?.tone ?? "sassy" }), { theme: a.profile?.email_theme ?? "light" }); }
      catch (e) { console.error("[nudge] email", (e as Error).message); }
    }
    sent++;
  }
  return sent;
}
