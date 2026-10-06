// The takedown process for removal and correction requests (public page: /takedown).
//
//   received       the requester gets a receipt with their reference (and can check status at /takedown)
//   acknowledged   within 24 hours; the requester is told; if it's about a story, the author is told a
//                  request was made (never by whom) and has 72 hours to edit or respond
//   resolved /     within 15 days, with an outcome (no action, corrected by the author, a detail
//   declined       redacted, removed, other) and written reasons; the requester and the author are told
// Urgent unlawful content (intimate images, impersonation) is acted on within 24 hours, as the
// Intermediary Rules, 2021 require. Emails here carry no links (see mail/otp-email.ts `plain`).
import { env } from "./env.js";
import { sendMail } from "./mail/mailer.js";
import { escape, layout } from "./mail/otp-email.js";
import { addNotification } from "./notify.js";
import { admin } from "./supabase.js";

export const OUTCOMES = ["no_action", "author_corrected", "redacted", "removed", "other"] as const;
export type Outcome = (typeof OUTCOMES)[number];
const OUTCOME_TEXT: Record<Outcome, string> = {
  no_action: "No action: the content stays up as it is",
  author_corrected: "The author corrected the content",
  redacted: "Part of the content was redacted",
  removed: "The content was removed",
  other: "Resolved another way",
};

type Update = { reference: string; kind: string; status: "received" | "acknowledged" | "resolved" | "declined"; outcome?: Outcome | null; resolution?: string | null };

export async function sendTakedownUpdate(to: string, u: Update) {
  const what = u.kind === "removal" ? "removal request" : "correction request";
  const subject = u.status === "received" ? `We received your ${what} (ref ${u.reference})`
    : u.status === "acknowledged" ? `Your ${what} is being reviewed (ref ${u.reference})`
    : `A decision on your ${what} (ref ${u.reference})`;
  const intro = u.status === "received"
    ? `Thanks. Your reference is <strong>${u.reference}</strong>. We'll acknowledge it within 24 hours and decide within 15 days. You can check where it stands on the Takedown requests page of Ghosted with this reference and this email address.`
    : u.status === "acknowledged"
      ? `A moderator is now reviewing request <strong>${u.reference}</strong>. If it concerns a story, its author has been told a request was made (never by whom) and has 72 hours to edit or respond. We'll decide within 15 days of your request.`
      : `We've decided on request <strong>${u.reference}</strong>.<br><br><strong>${escape(u.outcome ? OUTCOME_TEXT[u.outcome] : u.status === "declined" ? "Declined" : "Resolved")}</strong>${u.resolution ? `<br><br>${escape(u.resolution)}` : ""}<br><br>If you disagree, reply to this email with your reasons and a different moderator will review it.`;
  const html = layout({
    plain: true, appUrl: env().FRONTEND_URL, subject, banner: "Takedown requests", heading: u.status === "received" ? "Request received." : u.status === "acknowledged" ? "Under review." : "Decision made.",
    intro, preheader: subject,
    footnote: "You're getting this because you sent a removal or correction request to Ghosted. We never tell the author who asked.",
  });
  const text = `${subject}\n\n${intro.replace(/<br>/g, "\n").replace(/<[^>]+>/g, "")}`;
  try { await sendMail(to, { subject, html, text }); } catch (e) { console.error("[takedown] email", (e as Error).message); }
}

// The story a request is about, when it links to one (/s/<15-digit id>).
async function storyOf(targetUrl: string) {
  const id = targetUrl.match(/\/s\/(\d{15})/)?.[1];
  if (!id) return null;
  const { data } = await admin().from("stories").select("author_id, public_id").eq("public_id", id).maybeSingle();
  return data as { author_id: string; public_id: number } | null;
}

export async function tellAuthor(targetUrl: string, step: "acknowledged" | "decided", outcome?: Outcome | null) {
  const s = await storyOf(targetUrl);
  if (!s) return;
  const body = step === "acknowledged"
    ? "Someone asked us to correct or remove your story. A moderator is reviewing it. You have 72 hours to edit it or reply to this notification with your side. We never share who asked."
    : `We've reviewed the request about your story. Outcome: ${outcome ? OUTCOME_TEXT[outcome].toLowerCase() : "resolved"}. If you disagree, use Feedback & Support and a different moderator will look again.`;
  await addNotification(s.author_id, "system", body, s.public_id);
}
