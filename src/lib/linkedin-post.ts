// Writes a LinkedIn post from a story: a hook that fits how it ended, the key facts, the story in
// the author's own words (trimmed at a sentence), and a closing line that brings readers to Ghosted
// without sounding like an ad. Your own story is written in the first person; someone else's is
// written as passing it on, so nobody claims a story that isn't theirs. Worked out in the browser,
// nothing is sent anywhere. The company is left out unless you choose to name it.
import { plainText } from "@/components/markdown";

export type PostAngle = "story" | "lessons" | "short";
export type PostSource = {
  url: string; title: string | null; body: string; company: string; outcome: string;
  stage?: string | null; days?: number | null; salary?: { min: number; max: number } | null; role?: string | null; score?: number | null;
};
export type PostOptions = { angle: PostAngle; mine: boolean; nameCompany: boolean; tone: "sassy" | "calm" };

export const LINKEDIN_LIMIT = 3000;
const ROUNDS: Record<string, number> = { application: 0, screening: 1, technical: 2, final: 3, offer: 3 };
const OUTCOME: Record<string, string> = { ghosted: "Ghosted", rejected: "Rejected", offer: "Got the offer", offer_revoked: "Offer revoked", ghost_job: "Ghost job" };

const roundsText = (n: number) => (n === 0 ? "the application stage" : n === 1 ? "one round" : `${["", "one", "two", "three"][n] ?? n} rounds`);

// The story cut at a sentence boundary near `max` characters.
function excerpt(text: string, max: number) {
  const t = plainText(text).replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (t.length <= max) return { text: t, cut: false };
  const slice = t.slice(0, max);
  const end = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "), slice.lastIndexOf("\n"));
  return { text: (end > max * 0.5 ? slice.slice(0, end + 1) : `${slice.trimEnd()}…`).trim(), cut: true };
}

function hook(s: PostSource, o: PostOptions, who: string) {
  const r = ROUNDS[s.stage ?? ""] ?? null;
  const days = s.days != null ? `${s.days} days` : null;
  const sassy = o.tone === "sassy";
  if (!o.mine) {
    return {
      ghosted: `Someone made it through ${r != null ? roundsText(r) : "the interviews"} with ${who}, then heard nothing${days ? ` for ${days}` : ""}.`,
      rejected: `A candidate shared exactly how a rejection from ${who} played out. Worth a read if you're interviewing.`,
      offer: `A candidate shared how ${who}'s hiring process went, start to offer. This is the kind of detail job seekers rarely get.`,
      offer_revoked: `A candidate had an offer from ${who}. Then it was taken back.`,
      ghost_job: `A candidate applied to ${who} for a role that, it turns out, may never have existed.`,
    }[s.outcome] ?? `A candidate shared what interviewing with ${who} was really like.`;
  }
  return {
    ghosted: sassy
      ? `I made it through ${r != null ? roundsText(r) : "every round"} with ${who}. Then: silence${days ? `. ${days} of it` : ""}.`
      : `After ${r != null ? roundsText(r) : "several rounds"} with ${who}, I never heard back${days ? `, ${days} later` : ""}.`,
    rejected: sassy ? `I didn't get the job at ${who}. But at least they told me, which is more than most.` : `I didn't get the role at ${who}. Here's how the process went.`,
    offer: `I got the offer from ${who}. Here's what the hiring process actually looked like.`,
    offer_revoked: sassy ? `I had an offer from ${who} in hand. Then it un-happened.` : `I had an offer from ${who}. Then it was withdrawn.`,
    ghost_job: sassy ? `I applied for a role at ${who} that, as far as I can tell, never existed.` : `I applied for a role at ${who} that appears never to have been real.`,
  }[s.outcome] ?? `Here's what interviewing with ${who} was really like.`;
}

function facts(s: PostSource) {
  const r = ROUNDS[s.stage ?? ""];
  return [
    r != null && r > 0 ? `Rounds: ${r}` : null,
    s.days != null ? `Waited: ${s.days} ${s.days === 1 ? "day" : "days"}` : null,
    s.salary ? `Pay offered: ₹${s.salary.min} to ${s.salary.max} LPA` : null,
    OUTCOME[s.outcome] ? `Outcome: ${OUTCOME[s.outcome]}` : null,
  ].filter(Boolean).map((f) => `▸ ${f}`).join("\n");
}

const LESSONS: Record<string, string[]> = {
  ghosted: ["Ask for the timeline at the end of every round, and write it down.", "One polite follow-up after a week is normal. Two is plenty.", "Keep applying while you wait. Silence is not a maybe."],
  rejected: ["Ask for feedback once, briefly. Some companies do share it.", "A clear no is a gift compared to silence.", "Note which rounds felt fair. It tells you a lot about the team."],
  offer: ["Get the offer in writing before you resign anywhere.", "Ask how long the process takes on day one.", "Good processes are worth naming, so other companies notice."],
  offer_revoked: ["Don't resign until the offer letter and joining date are in writing.", "Keep one other process warm until your first day.", "Ask what could change the offer, before you accept it."],
  ghost_job: ["Check when the role was first posted and whether it keeps getting reposted.", "Ask the recruiter how many people the role is hiring for.", "Look up the company's hiring stories before investing hours."],
};

// Why Ghosted, said once, at the end, fitted to how the story ended.
function closing(s: PostSource, o: PostOptions) {
  const why = {
    ghosted: "Candidates in India are sharing how long companies really take to reply, and which ones never do",
    rejected: "Candidates in India are sharing how hiring really goes, rounds, waits and replies included",
    offer: "Candidates in India are sharing which companies run fair, clear hiring processes",
    offer_revoked: "Candidates in India are sharing offer stories like this, so nobody resigns on a promise",
    ghost_job: "Candidates in India are flagging roles that never seem to be filled",
  }[s.outcome] ?? "Candidates in India are sharing how hiring really goes";
  const lead = o.mine ? "I shared the full story anonymously on Ghosted." : "Read the full story on Ghosted.";
  return `${lead} ${why}, so the next person can check a company before they apply.\n\n${s.url}`;
}

const ROLE_TAGS: [RegExp, string][] = [
  [/engineer|developer|sde|backend|frontend|full ?stack|devops/i, "#SoftwareEngineering"],
  [/design/i, "#Design"], [/product/i, "#ProductManagement"], [/data|analyst|ml|scien/i, "#DataScience"],
  [/market/i, "#Marketing"], [/sales|business development/i, "#Sales"], [/hr|talent|recruit/i, "#HR"],
];
function hashtags(s: PostSource) {
  const tags = ["#JobSearch", "#CandidateExperience", "#Hiring"];
  const role = ROLE_TAGS.find(([re]) => re.test(s.role ?? ""))?.[1];
  if (role) tags.push(role);
  if (s.outcome === "ghosted") tags.push("#Ghosting");
  tags.push("#GhostedReceipts");
  return tags.join(" ");
}

export function writePost(s: PostSource, o: PostOptions) {
  const who = o.nameCompany && s.company ? s.company : "a company";
  const parts = [hook(s, o, who), facts(s)];
  if (o.angle === "story") {
    const room = LINKEDIN_LIMIT - 700; // leave space for the rest of the post
    const { text, cut } = excerpt(s.body, Math.min(1400, room));
    parts.push(o.mine ? text : `In their words:\n"${text}"`);
    if (cut) parts.push("(The rest is in the full story below.)");
  } else if (o.angle === "lessons") {
    const { text } = excerpt(s.body, 280);
    parts.push(o.mine ? text : `"${text}"`);
    parts.push(`${o.mine ? "What I'd tell anyone interviewing now" : "What I'd take from it"}:\n${(LESSONS[s.outcome] ?? LESSONS["rejected"]!).map((l) => `• ${l}`).join("\n")}`);
  }
  parts.push(closing(s, o), hashtags(s));
  // Unnamed companies can still leak through the story text; the hook and facts never name them.
  return parts.filter(Boolean).join("\n\n").slice(0, LINKEDIN_LIMIT);
}

// LinkedIn's composer, opened with the post filled in. If LinkedIn ignores the text (it sometimes
// does on the app), the post is already on the clipboard to paste.
export const linkedInComposeUrl = (text: string) => `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`;
