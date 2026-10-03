// Quick stories: a short, natural write-up built only from what the person tapped (outcome, stage,
// wait, joined, role and their ratings). Every piece comes from a pool of phrasings picked at random,
// so no two quick stories read the same. Nothing is invented: each sentence restates a tap, and the
// rating lines only describe the star score they gave. No names, ever.
import type { Dimension, Outcome } from "@/lib/score";

export type QuickInput = { outcome: Outcome; company: string; stage: string | null; days: number | null; joined: boolean | null; role: string | null; ratings: Partial<Record<Dimension, number>> };

const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]!;
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? "");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const STAGE_WORD: Record<string, string> = { application: "application", screening: "screening call", technical: "technical round", final: "final round", offer: "offer stage" };
const waitWords = (d: number) => (d < 7 ? "less than a week" : d <= 14 ? "a week or two" : d <= 30 ? "two to four weeks" : d <= 60 ? "a month or two" : "more than two months");

// ---------- how it started (by outcome) ----------
const OPENERS: Record<Outcome | "offer_joined" | "offer_declined", string[]> = {
  ghosted: [
    "I made it to the {stage} with {company}, and then the replies just stopped.",
    "My process with {company} went quiet after the {stage}.",
    "Got as far as the {stage} at {company}. After that, silence.",
    "{company} stopped responding after my {stage}.",
    "I went through to the {stage} with {company} and never heard what happened next.",
    "After the {stage}, {company} simply disappeared on me.",
    "Everything was moving with {company} until the {stage}. Then nothing.",
    "I reached the {stage} at {company}, and that was the last I heard from them.",
    "The {stage} with {company} was the end of the conversation, not by my choice.",
    "{company} ghosted me after the {stage}.",
  ],
  rejected: [
    "{company} turned me down after the {stage}.",
    "I got a no from {company} after the {stage}.",
    "My application at {company} ended with a rejection at the {stage}.",
    "After the {stage}, {company} let me know it wasn't moving forward.",
    "I made it to the {stage} at {company} before getting rejected.",
    "The {stage} at {company} is where it ended for me: a rejection.",
    "{company} said no after the {stage}. At least they said something.",
    "I was rejected by {company} at the {stage}.",
  ],
  ghost_job: [
    "I applied for a role at {company} that, as far as I can tell, was never really open.",
    "The {company} opening I applied to looks like a ghost job.",
    "I put in an application at {company} for a role that doesn't seem to have existed.",
    "Applied to {company}, and the role felt like it was never meant to be filled.",
    "My application to {company} went into what looks like a ghost listing.",
    "I'm fairly sure the {company} job I applied for was a ghost job.",
    "The role at {company} I went for seems to have been posted with no real plan to hire.",
  ],
  offer_revoked: [
    "{company} made me an offer and then took it back.",
    "I had an offer from {company}, until they revoked it.",
    "My offer from {company} was withdrawn after it was made.",
    "{company} offered me the role, then pulled the offer.",
    "I got all the way to an offer at {company}, and then it was revoked.",
    "The offer from {company} didn't survive: they revoked it.",
    "{company} extended an offer and later went back on it.",
  ],
  offer: [],
  offer_joined: [
    "I got an offer from {company} and took it.",
    "{company} made me an offer and I joined.",
    "I went through {company}'s process, got the offer and accepted.",
    "Happy ending here: {company} offered and I joined.",
    "I'm now at {company}, after getting and accepting their offer.",
    "{company} hired me. I received the offer and joined the team.",
    "I accepted an offer from {company} and started there.",
  ],
  offer_declined: [
    "{company} made me an offer, but I didn't end up joining.",
    "I got an offer from {company} and decided not to take it.",
    "I had an offer from {company} on the table and passed on it.",
    "{company} offered me the role. I didn't join.",
    "I made it to an offer with {company}, then chose not to join.",
    "The process with {company} ended in an offer I didn't accept.",
  ],
};

// ---------- the wait ----------
const WAITS: Partial<Record<Outcome, string[]>> = {
  ghosted: [
    "I waited {wait} without a single update.",
    "It's been {wait} and not a word.",
    "I gave it {wait} before accepting it was over.",
    "{wait} went by with no reply.",
    "After {wait} of checking my inbox, I stopped expecting anything.",
    "I followed the process and then waited {wait} for nothing.",
  ],
  rejected: [
    "It took {wait} for the answer to arrive.",
    "The decision came {wait} later.",
    "I was kept waiting {wait} before they told me.",
    "{wait} passed before I heard back.",
    "I heard back after {wait}.",
  ],
  ghost_job: [
    "{wait} later, still no reply.",
    "I waited {wait} and heard nothing at all.",
    "No response in {wait}.",
    "After {wait}, nothing came back.",
  ],
};
const NO_REPLY = ["I never heard back.", "No reply ever came.", "Nothing came after that.", "That was the end of it.", "No follow-up, no closure."];

// ---------- the ratings, in plain words (only what they rated) ----------
type Band = "bad" | "meh" | "good";
const band = (n: number): Band => (n <= 2 ? "bad" : n === 3 ? "meh" : "good");
const RATED: Record<Dimension, Record<Band, string[]>> = {
  hiring: {
    bad: ["The hiring process felt disorganised.", "The process itself was a mess.", "I wouldn't call the process fair or well run.", "Their hiring process left a lot to be desired."],
    meh: ["The process itself was okay, nothing special.", "The hiring process was average.", "The rounds were fine, if unremarkable."],
    good: ["The process itself was well organised.", "To be fair, the hiring process was clear and fair.", "The rounds were well run."],
  },
  communication: {
    bad: ["Communication was close to non-existent.", "Getting a reply out of them was hard.", "Their communication was poor.", "Updates were rare to non-existent."],
    meh: ["Communication was patchy.", "They replied sometimes, not always.", "Communication was just about okay."],
    good: ["They communicated well throughout.", "Replies came on time.", "Communication was clear and timely."],
  },
  pay: {
    bad: ["Pay was not discussed honestly.", "The salary conversation was murky.", "I didn't feel the pay was transparent."],
    meh: ["Pay transparency was so-so.", "The pay discussion was okay, not great."],
    good: ["They were upfront about pay.", "The salary was discussed openly.", "Pay was transparent from the start."],
  },
  culture: {
    bad: ["The work culture hasn't been great.", "Culture-wise, it's been a disappointment.", "I wouldn't rate the culture highly."],
    meh: ["The culture is fine, nothing more.", "Work culture is average."],
    good: ["The culture is genuinely good.", "It's a respectful place to work.", "I like the work culture."],
  },
  growth: {
    bad: ["I don't see much room to grow.", "Growth opportunities feel limited."],
    meh: ["Growth is okay so far.", "There's some room to grow, not a lot."],
    good: ["There's real room to grow.", "The role feels like it's going somewhere."],
  },
};

const ROLE = ["I applied as a {role}.", "The role was {role}.", "This was for a {role} position.", "I was interviewing for {role}."];
const CLOSERS: Record<"bad" | "good" | "mixed", string[]> = {
  bad: [
    "Sharing so the next person knows what to expect.",
    "Posting this in case it saves someone else the wait.",
    "If you're applying there, go in with your eyes open.",
    "Hope this helps someone plan around it.",
    "Putting it here so it's on the record.",
    "Keep your options open if you're in their pipeline.",
  ],
  good: [
    "Sharing because good experiences deserve a mention too.",
    "Worth applying if the role fits you.",
    "Posting so it's not just the bad stories on here.",
    "Hope this helps someone deciding whether to apply.",
  ],
  mixed: [
    "Mixed experience overall. Sharing so you can judge for yourself.",
    "Not all bad, not all good. Make of it what you will.",
    "Sharing so the next candidate has the full picture.",
    "Take it as one data point among many.",
  ],
};

export function quickStory(q: QuickInput): string {
  const v = { company: q.company, stage: STAGE_WORD[q.stage ?? ""] ?? "first round", role: q.role ?? "", wait: q.days != null ? waitWords(q.days) : "" };
  const key = q.outcome === "offer" ? (q.joined ? "offer_joined" : "offer_declined") : q.outcome;
  const first: string[] = [fill(pick(OPENERS[key]), v)];
  if (q.days != null && WAITS[q.outcome]) first.push(cap(fill(pick(WAITS[q.outcome]!), v)));
  else if (q.outcome === "ghosted") first.push(pick(NO_REPLY));
  if (q.role) first.push(fill(pick(ROLE), v));

  const dims = (Object.keys(q.ratings) as Dimension[]).filter((k) => q.ratings[k]);
  const lines = dims.map((k) => pick(RATED[k][band(q.ratings[k]!)]));
  const avg = dims.length ? dims.reduce((s, k) => s + q.ratings[k]!, 0) / dims.length : 3;
  const mood = q.outcome === "offer" && q.joined && avg >= 3.5 ? "good" : avg <= 2.4 || q.outcome !== "offer" && avg < 3.5 ? "bad" : avg >= 3.8 ? "good" : "mixed";

  return [first.join(" "), lines.join(" "), pick(CLOSERS[mood])].filter(Boolean).join("\n\n");
}
