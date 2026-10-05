// Writes a LinkedIn post from a story, in plain professional prose: an opening that weaves in the
// facts (role, rounds, wait), the story in the author's own words, a short reflection that fits how
// it ended, and one natural line about Ghosted with the link. No bullet lists of stats, no hype.
// Your own story is written in the first person; someone else's is written as passing it on, so
// nobody claims a story that isn't theirs. Worked out in the browser, nothing is sent anywhere. The
// company is left out unless you choose to name it.
import { plainText } from "@/components/markdown";

export type PostAngle = "story" | "lessons" | "short";
export type PostSource = {
  url: string; title: string | null; body: string; company: string; outcome: string; quick?: boolean;
  stage?: string | null; days?: number | null; salary?: { min: number; max: number } | null; role?: string | null; score?: number | null;
};
export type PostOptions = { angle: PostAngle; mine: boolean; nameCompany: boolean; tone: "sassy" | "calm" };

export const LINKEDIN_LIMIT = 3000;
const ROUNDS: Record<string, number> = { application: 0, screening: 1, technical: 2, final: 3, offer: 3 };
const LAST_ROUND: Record<string, string> = { screening: "the screening call", technical: "the technical round", final: "the final round", offer: "the final round" };
const NUM = ["no", "one", "two", "three", "four", "five"];

const roleOf = (s: PostSource) => (s.role?.trim() ? `${/^[aeiou]/i.test(s.role.trim()) ? "an" : "a"} ${s.role.trim()} role` : "a role");
const roundsOf = (s: PostSource) => { const n = ROUNDS[s.stage ?? ""] ?? 0; return n > 0 ? `${NUM[n] ?? n} ${n === 1 ? "round" : "rounds"} of interviews` : null; };
const pay = (s: PostSource) => (s.salary ? `₹${s.salary.min} to ${s.salary.max} LPA` : null);

// The story, cut at a sentence boundary near `max` characters.
function excerpt(text: string, max: number) {
  const t = plainText(text).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (t.length <= max) return { text: t, cut: false };
  const slice = t.slice(0, max);
  const end = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "), slice.lastIndexOf("\n"));
  return { text: (end > max * 0.5 ? slice.slice(0, end + 1) : `${slice.trimEnd()}…`).trim(), cut: true };
}

// Opening paragraph: what happened, in a sentence or two, with the facts in it.
function opening(s: PostSource, o: PostOptions, who: string) {
  const role = roleOf(s), rounds = roundsOf(s), last = LAST_ROUND[s.stage ?? ""], d = s.days;
  if (o.mine) {
    switch (s.outcome) {
      case "ghosted":
        return rounds
          ? `I recently went through ${rounds} with ${who} for ${role}. After ${last}, the updates simply stopped.${d ? ` That was ${d} days ago, and I'm still waiting to hear back.` : ""}`
          : `I applied to ${who} for ${role} and never heard back. No acknowledgement, no rejection, nothing.${d ? ` It has now been ${d} days.` : ""}`;
      case "rejected":
        return `I recently interviewed with ${who} for ${role}${rounds ? `, across ${rounds}` : ""}, and it didn't work out this time.`;
      case "offer":
        return `I recently went through ${who}'s hiring process for ${role}${rounds ? ` (${rounds})` : ""} and came away with an offer${pay(s) ? ` in the ${pay(s)} range` : ""}.`;
      case "offer_revoked":
        return `I was offered ${role} at ${who}${pay(s) ? ` at ${pay(s)}` : ""}. Some time after accepting, the offer was withdrawn.`;
      case "ghost_job":
        return `I applied to ${who} for ${role} that, as far as I can tell, was never really open.`;
    }
    return `I recently interviewed with ${who} for ${role}, and I wanted to share how it went.`;
  }
  switch (s.outcome) {
    case "ghosted":
      return rounds
        ? `A candidate went through ${rounds} with ${who} for ${role}, then heard nothing after ${last}${d ? `, ${d} days and counting` : ""}.`
        : `A candidate applied to ${who} for ${role} and never received a reply of any kind${d ? `, ${d} days on` : ""}.`;
    case "rejected": return `A candidate shared, in detail, how a rejection from ${who} played out${rounds ? ` after ${rounds}` : ""}.`;
    case "offer": return `A candidate shared how ${who}'s hiring process went from first call to offer. This is the kind of detail job seekers rarely get.`;
    case "offer_revoked": return `A candidate accepted an offer from ${who}, and later had it withdrawn.`;
    case "ghost_job": return `A candidate applied to ${who} for a role that may never have been open.`;
  }
  return `A candidate shared what interviewing with ${who} was really like.`;
}

// A short reflection that fits how it ended, written the way a person would say it.
const REFLECTION: Record<string, { mine: string; theirs: string }> = {
  ghosted: {
    mine: "I'm not sharing this to call anyone out. Silence is simply the part of job hunting nobody prepares you for, and a two-line \"we've decided to move on\" email would have been enough.",
    theirs: "Silence after interviews is more common than most people admit, and a short closing email costs a company almost nothing.",
  },
  rejected: { mine: "A no still stings, but a clear answer is something I'll always respect.", theirs: "A clear no, even a short one, is worth far more to candidates than silence." },
  offer: { mine: "Good hiring processes deserve to be talked about as much as the bad ones.", theirs: "Good processes deserve as much attention as the bad ones." },
  offer_revoked: { mine: "If you're about to resign on the strength of an offer, get every detail in writing first.", theirs: "A reminder to get every detail in writing before resigning anywhere." },
  ghost_job: { mine: "If a listing has been up for months, it's worth asking whether the role is actually being filled.", theirs: "Worth remembering the next time a listing has been open for months." },
};

// "Lessons": what I'd do next time, as one natural paragraph rather than a list.
const LESSONS: Record<string, string> = {
  ghosted: "Next time I'll ask for a clear timeline at the end of every round, send one polite follow-up after a week, and keep other applications moving while I wait.",
  rejected: "What I'm taking from it: ask for feedback once, keep it brief, and pay attention to which rounds felt fair. That says a lot about a team.",
  offer: "What helped: asking about the timeline on day one, and not resigning anywhere until the offer was in writing.",
  offer_revoked: "What I'd do differently: wait for the signed letter and a confirmed joining date before resigning, and keep one other process warm until day one.",
  ghost_job: "Next time I'll check how long a role has been posted, and ask the recruiter how many people it's actually hiring for, before investing hours.",
};

// One natural mention of Ghosted, with the link.
function closing(s: PostSource, o: PostOptions) {
  return o.mine
    ? `I've written up the full experience on Ghosted, where candidates in India share how hiring actually goes, anonymously, so others know what to expect before they apply. If you've been through something similar, it's worth adding yours.\n\n${s.url}`
    : `I came across this on Ghosted, where candidates in India share their hiring experiences anonymously. Worth a read if you're interviewing right now.\n\n${s.url}`;
}

const ROLE_TAGS: [RegExp, string][] = [
  [/engineer|developer|sde|backend|frontend|full ?stack|devops/i, "#SoftwareEngineering"],
  [/design/i, "#Design"], [/product/i, "#ProductManagement"], [/data|analyst|ml|scien/i, "#DataScience"],
  [/market/i, "#Marketing"], [/sales|business development/i, "#Sales"], [/hr|talent|recruit/i, "#HR"],
];
// A few relevant tags, like a person would add, not a wall of them.
function hashtags(s: PostSource) {
  const role = ROLE_TAGS.find(([re]) => re.test(s.role ?? ""))?.[1];
  return ["#JobSearch", "#Hiring", "#CandidateExperience", ...(role ? [role] : [])].join(" ");
}

export function writePost(s: PostSource, o: PostOptions) {
  const who = o.nameCompany && s.company ? s.company : "a company";
  const side = o.mine ? "mine" : "theirs";
  const parts = [opening(s, o, who)];
  // Quick stories have a generated body that repeats the opening, so only written stories are quoted.
  const hasOwnWords = !s.quick && plainText(s.body).trim().length > 40;
  if (o.angle === "story" && hasOwnWords) {
    const { text, cut } = excerpt(s.body, 1400);
    parts.push(o.mine ? text : `In their words: "${text}"`);
    if (cut) parts.push(o.mine ? "There's more detail in the full write-up below." : "The full story is linked below.");
  }
  if (o.angle === "lessons") {
    if (hasOwnWords) { const { text } = excerpt(s.body, 300); parts.push(o.mine ? text : `"${text}"`); }
    if (o.mine && LESSONS[s.outcome]) parts.push(LESSONS[s.outcome]!);
  }
  if (o.angle !== "short" && REFLECTION[s.outcome]) parts.push(REFLECTION[s.outcome]![side]);
  parts.push(closing(s, o), hashtags(s));
  return parts.join("\n\n").slice(0, LINKEDIN_LIMIT);
}

// LinkedIn's composer, opened with the post filled in. If LinkedIn ignores the text (it sometimes
// does on the app), the post is on the clipboard to paste.
export const linkedInComposeUrl = (text: string) => `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`;
