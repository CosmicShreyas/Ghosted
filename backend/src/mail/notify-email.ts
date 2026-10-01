// Notification emails: someone related to your story, someone replied, and the weekly digest.
// Same Ghosted frame as the code emails, with a sassy and a calm voice.
import { button, escape, layout, type Tone } from "./otp-email.js";

const excerpt = (s: string) => escape(s.length > 160 ? `${s.slice(0, 157)}…` : s);
const quote = (s: string) => `<tr><td style="padding:0 28px 24px;"><div style="border:2px solid #141110;border-radius:12px;background:#FAF7F2;padding:14px 16px;font-family:Inter,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#141110;">“${s}”</div></td></tr>`;
const settingsNote = (tone: Tone) => tone === "sassy"
  ? "You're getting this because you asked for it in Settings → Notifications. Unlike recruiter emails, you can actually turn these off."
  : "You're receiving this because it's switched on in Settings → Notifications. You can turn it off there at any time.";

export function relatableEmail({ appUrl, tone, handle, title, count }: { appUrl: string; tone: Tone; handle: string; title: string; count: number }) {
  const sassy = tone === "sassy";
  const subject = sassy ? `${count} ${count === 1 ? "person relates" : "people relate"} to your story` : `New reactions on your Ghosted story`;
  const html = layout({
    appUrl, subject, banner: "Your story is helping",
    heading: sassy ? `${escape(handle)}, your receipts landed.` : `Hi ${escape(handle)}, people found your story useful.`,
    ...(sassy && { tagline: "Someone read it and said “same”." }),
    intro: sassy ? `<strong style="color:#141110;">${count}</strong> ${count === 1 ? "person has" : "people have"} now marked your story as relatable. That's ${count === 1 ? "one fewer person" : `${count} fewer people`} walking into the same trap.` : `Your story now has <strong style="color:#141110;">${count}</strong> relatable ${count === 1 ? "reaction" : "reactions"}.`,
    body: quote(excerpt(title)) + button(`${appUrl}/dashboard`, sassy ? "See the love" : "Open Ghosted"),
    footnote: settingsNote(tone), preheader: subject,
  });
  return { subject, html, text: `${subject}\n\n"${title}"\n\n${appUrl}/dashboard\n\n${settingsNote(tone)}` };
}

export function replyEmail({ appUrl, tone, handle, title, reply }: { appUrl: string; tone: Tone; handle: string; title: string; reply: string }) {
  const sassy = tone === "sassy";
  const subject = sassy ? "New chitchat on your story. The tea is hot." : "New chitchat on your Ghosted story";
  const html = layout({
    appUrl, subject, banner: "New chitchat",
    heading: sassy ? `${escape(handle)}, someone's spilling back.` : `Hi ${escape(handle)}, you have a new chitchat.`,
    intro: `On your story <strong style="color:#141110;">“${excerpt(title)}”</strong>:`,
    body: quote(excerpt(reply)) + button(`${appUrl}/dashboard`, sassy ? "Join the chitchat" : "Read and reply"),
    footnote: settingsNote(tone), preheader: reply.slice(0, 90),
  });
  return { subject, html, text: `${subject}\n\n"${reply}"\n\n${appUrl}/dashboard\n\n${settingsNote(tone)}` };
}

export type DigestItem = { publicId: string; company: string; title: string; outcome: string; relatable: number; comments: number };
export type StoryUpdate = { publicId: string; company: string; title: string; relatable: number; comments: number; newRelatable: number; newComments: number };

export function digestEmail({ appUrl, tone, handle, mine, followed, flagged, highlights }: { appUrl: string; tone: Tone; handle: string; mine: StoryUpdate[]; followed: DigestItem[]; flagged: DigestItem[]; highlights: DigestItem[] }) {
  const sassy = tone === "sassy";
  const metrics = (relatable: number, comments: number) => `<span style="color:#6B6560;font-size:12px;">${relatable} relatable · ${comments} chitchat${comments === 1 ? "" : "s"}</span>`;
  const row = (i: DigestItem) => `<tr><td style="padding:0 28px 10px;"><a href="${appUrl}/s/${i.publicId}" style="display:block;border:2px solid #141110;border-radius:10px;padding:11px 14px;font-family:Inter,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;color:#141110;text-decoration:none;"><strong>${escape(i.company)}</strong> · <span style="color:#6D28D9;text-transform:uppercase;font-size:11px;font-weight:700;">${escape(i.outcome.replaceAll("_", " "))}</span><br><span style="color:#6B6560;">${excerpt(i.title)}</span><br>${metrics(i.relatable, i.comments)}</a></td></tr>`;
  const mineRow = (i: StoryUpdate) => `<tr><td style="padding:0 28px 10px;"><a href="${appUrl}/s/${i.publicId}" style="display:block;border:2px solid #141110;border-radius:10px;padding:11px 14px;font-family:Inter,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;color:#141110;text-decoration:none;"><strong>${escape(i.company)}</strong><br><span style="color:#6B6560;">${excerpt(i.title)}</span><br><span style="color:#6D28D9;font-size:12px;font-weight:700;">+${i.newRelatable} relatable · +${i.newComments} chitchat${i.newComments === 1 ? "" : "s"} this week</span><br>${metrics(i.relatable, i.comments)}</a></td></tr>`;
  const head = (label: string) => `<tr><td style="padding:8px 28px 10px;font-family:Inter,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#141110;">${label}</td></tr>`;
  const section = (label: string, items: DigestItem[]) => items.length ? head(label) + items.map(row).join("") : "";
  const subject = mine.length ? (sassy ? "Your stories did numbers this week" : "This week's activity on your Ghosted stories") : sassy ? "Your weekly receipts are in" : "Your personalized Ghosted digest";
  const html = layout({
    appUrl, subject, banner: "Your weekly brief",
    heading: sassy ? `A useful little catch-up, ${escape(handle)}.` : `Hi ${escape(handle)}, here's what mattered this week.`,
    ...(sassy && { tagline: "Only the useful bits. No inbox haunting." }),
    intro: sassy ? "Your stories, the companies you're watching and a few receipts worth knowing—bundled once, so we don't keep tapping your shoulder." : "A quiet weekly summary of activity on your stories and useful updates from companies you follow.",
    body: (mine.length ? head("Your stories this week") + mine.map(mineRow).join("") : "") + section("From companies you follow", followed) + section("Companies you've red-flagged", flagged) + section("Worth knowing", highlights) + button(`${appUrl}/dashboard`, sassy ? "Catch up on Ghosted" : "Open your dashboard"),
    footnote: settingsNote(tone), preheader: subject,
  });
  const list = (name: string, items: DigestItem[]) => items.length ? ["", `${name}:`, ...items.map((i) => `- ${i.company}: ${i.title} (${i.relatable} relatable, ${i.comments} chitchats) ${appUrl}/s/${i.publicId}`)] : [];
  const text = [subject, ...(mine.length ? ["", "Your stories:", ...mine.map((i) => `- ${i.company}: +${i.newRelatable} relatable, +${i.newComments} chitchats ${appUrl}/s/${i.publicId}`)] : []), ...list("From companies you follow", followed), ...list("Companies you've red-flagged", flagged), ...list("Worth knowing", highlights), "", `${appUrl}/dashboard`, "", settingsNote(tone)].join("\n");
  return { subject, html, text };
}
