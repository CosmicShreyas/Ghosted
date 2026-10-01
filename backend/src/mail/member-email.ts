// Emails an admin can send to one member by hand, from the admin panel (Members → Send an email).
// Same frame as every other Ghosted email (otp-email.ts layout), both voices, the member's theme.
// An optional note from the admin is added as plain text; it's never treated as HTML.
import { button, escape, layout, type Tone } from "./otp-email.js";

type Copy = { banner: string; heading: string; tagline?: string; intro: string; cta?: { label: string; path: string }; footnote: string; subject: string };
type Template = { label: string; description: string; copy: Record<Tone, (handle: string) => Copy> };

const RULES = { label: "Read the community rules", path: "/community" };
const SIGNOFF = "Questions? Reply through the feedback page on Ghosted. We read everything.";

export const MEMBER_TEMPLATES = {
  warning: {
    label: "Friendly warning", description: "A nudge about the community rules, nothing taken away.",
    copy: {
      sassy: (h) => ({ banner: "A quick word", heading: `Hey ${h}, small heads-up.`, tagline: "No drama. Just a nudge.", intro: "Something you posted recently came close to breaking the community rules. Nothing has been taken away, but a few more and Goofy starts pausing things. Name companies, not people, and keep it about the hiring.", cta: RULES, footnote: SIGNOFF, subject: "A quick word about the community rules" }),
      calm: (h) => ({ banner: "A quick word", heading: `Hi ${h}, a quick note.`, intro: "Something you posted recently came close to breaking the community rules. Nothing has been taken away. Please keep stories about the hiring process and avoid naming individual people.", cta: RULES, footnote: SIGNOFF, subject: "A note about the community rules" }),
    },
  },
  suspended: {
    label: "Posting paused", description: "Tells them posting is paused for a while (pair with Suspend).",
    copy: {
      sassy: (h) => ({ banner: "Posting paused", heading: `${h}, we've hit pause.`, tagline: "You can still read. Just not post, for now.", intro: "After a few posts that broke the community rules, posting on your account is paused for a while. You can still read stories and react. When the pause ends, everything works again.", cta: RULES, footnote: SIGNOFF, subject: "Posting on your Ghosted account is paused" }),
      calm: (h) => ({ banner: "Posting paused", heading: `Hi ${h}, posting is paused.`, intro: "Because of posts that broke the community rules, posting on your account is paused for a while. You can still read and react. Posting comes back automatically when the pause ends.", cta: RULES, footnote: SIGNOFF, subject: "Posting on your Ghosted account is paused" }),
    },
  },
  banned: {
    label: "Account suspended", description: "Explains the account is suspended (pair with Ban).",
    copy: {
      sassy: (h) => ({ banner: "Account suspended", heading: `${h}, your account is suspended.`, intro: "Your account broke the community rules in a way we can't let slide, so it's suspended and you won't be able to sign in. If you think we got this wrong, tell us through the contact page and a human will look again.", footnote: "We keep the reason on record. We never share who you are with employers.", subject: "Your Ghosted account is suspended" }),
      calm: (h) => ({ banner: "Account suspended", heading: `Hi ${h}, your account is suspended.`, intro: "Your account has been suspended for breaking the community rules, and signing in is turned off. If you believe this is a mistake, contact us through the contact page and we'll review it.", footnote: "We never share who you are with employers.", subject: "Your Ghosted account is suspended" }),
    },
  },
  restored: {
    label: "Access restored", description: "Good news: a pause or suspension has been lifted.",
    copy: {
      sassy: (h) => ({ banner: "Welcome back", heading: `${h}, you're back.`, tagline: "Clean slate. Go tell it like it was.", intro: "We've lifted the restriction on your account. You can sign in, post and chitchat again.", cta: { label: "Open Ghosted", path: "/dashboard" }, footnote: SIGNOFF, subject: "Your Ghosted account is back to normal" }),
      calm: (h) => ({ banner: "Welcome back", heading: `Hi ${h}, your account is restored.`, intro: "The restriction on your account has been lifted. Everything works as before.", cta: { label: "Open Ghosted", path: "/dashboard" }, footnote: SIGNOFF, subject: "Your Ghosted account is restored" }),
    },
  },
  removed: {
    label: "Post removed", description: "Lets them know a post was taken down and why.",
    copy: {
      sassy: (h) => ({ banner: "Post removed", heading: `${h}, we took one down.`, intro: "One of your posts was removed after a moderator reviewed it. You're welcome to write it again within the community rules: tell the story, leave out the names.", cta: RULES, footnote: SIGNOFF, subject: "One of your Ghosted posts was removed" }),
      calm: (h) => ({ banner: "Post removed", heading: `Hi ${h}, a post was removed.`, intro: "One of your posts was removed after a moderator reviewed it. You're welcome to post it again within the community rules.", cta: RULES, footnote: SIGNOFF, subject: "One of your Ghosted posts was removed" }),
    },
  },
  thanks: {
    label: "Thank you", description: "For great stories, helpful reports or a donation.",
    copy: {
      sassy: (h) => ({ banner: "From the team", heading: `${h}, thank you.`, tagline: "You make Ghosted worth it.", intro: "We noticed what you've been doing on Ghosted and wanted to say thanks. Honest stories are exactly how the next person walks into an interview better prepared.", cta: { label: "Open Ghosted", path: "/dashboard" }, footnote: SIGNOFF, subject: "A thank-you from the Ghosted team" }),
      calm: (h) => ({ banner: "From the team", heading: `Hi ${h}, thank you.`, intro: "We wanted to say thank you for what you contribute to Ghosted. It helps other people prepare for their own hiring processes.", cta: { label: "Open Ghosted", path: "/dashboard" }, footnote: SIGNOFF, subject: "A thank-you from the Ghosted team" }),
    },
  },
  custom: {
    label: "Custom message", description: "Your own words in the Ghosted frame. Write the note below.",
    copy: {
      sassy: (h) => ({ banner: "From the team", heading: `Hey ${h},`, intro: "", footnote: SIGNOFF, subject: "A message from the Ghosted team" }),
      calm: (h) => ({ banner: "From the team", heading: `Hi ${h},`, intro: "", footnote: SIGNOFF, subject: "A message from the Ghosted team" }),
    },
  },
} satisfies Record<string, Template>;
export type MemberTemplate = keyof typeof MEMBER_TEMPLATES;

const paragraphs = (s: string) => escape(s).split(/\n{2,}/).map((p) => p.replace(/\n/g, "<br>")).join("<br><br>");

export function memberEmail({ template, handle, tone, appUrl, note, subject: custom }: { template: MemberTemplate; handle: string; tone: Tone; appUrl: string; note?: string | undefined; subject?: string | undefined }) {
  const t: Copy = (MEMBER_TEMPLATES[template] as Template).copy[tone](escape(handle));
  const subject = custom?.trim() || t.subject;
  // A custom email: your words are the email, set in the same type and spacing as every template.
  if (template === "custom") {
    const words = note?.trim() ?? "";
    const html = layout({ appUrl, subject, banner: t.banner, heading: t.heading, intro: `<span style="color:#141110;">${paragraphs(words)}</span>`, preheader: words.slice(0, 120), body: button(`${appUrl}/dashboard`, "Open Ghosted"), footnote: escape(t.footnote) });
    return { subject, html, text: [t.heading.replace(/&#39;/g, "'"), "", words, "", `Open Ghosted: ${appUrl}/dashboard`, "", t.footnote].join("\n") };
  }
  const noteBlock = note?.trim() ? `<tr><td style="padding:0 28px 24px;"><div style="border-left:4px solid #6D28D9;padding:10px 14px;font-family:Inter,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#141110;">${paragraphs(note.trim())}</div></td></tr>` : "";
  const html = layout({
    appUrl, subject, banner: t.banner, heading: t.heading, ...(t.tagline && { tagline: t.tagline }),
    intro: t.intro || (note?.trim() ? "" : "&nbsp;"), preheader: (t.intro || note || subject).slice(0, 120),
    body: noteBlock + (t.cta ? button(`${appUrl}${t.cta.path}`, t.cta.label) : ""),
    footnote: escape(t.footnote),
  });
  const text = [t.heading.replace(/<[^>]+>/g, "").replace(/&#39;/g, "'"), "", t.intro, note?.trim() ?? "", t.cta ? `${t.cta.label}: ${appUrl}${t.cta.path}` : "", "", t.footnote].filter((x, i, a) => x || a[i - 1]).join("\n");
  return { subject, html, text };
}
