// Automatic review of everything people write (stories, chitchats, report notes) BEFORE it goes
// public or into the manual queue. Three outcomes:
//
//   allow   published straight away
//   review  saved but held ("pending") until a moderator looks; the author is told why
//   block   refused with a clear reason, so the author can fix it and try again
//
// Signals, each with a weight, combine into a risk score 0…1:
//   personal data (phone, Aadhaar, PAN, UPI, card, email, address, a named individual)   block/review
//   identity slurs, identity-based attacks, threats                                         block
//   graphic sexual abuse aimed at people                                                    review
//   statements of crime as fact (defamation risk), unless hedged as experience              review
//   confidential material (internal docs, credentials)                                      review/block
//   profanity: venting is allowed; density and targeting raise the score                   score only
//   spam: links, off-platform lures, shouting, repeated characters, near-duplicates          review
//   self-harm language: never blocked; a human reaches out                                 review + flag
//
// Deterministic and explainable: every reason says what matched, so moderators and authors see
// the same thing. Only masked excerpts are kept.
import { capsRatio, fold, jaccard, normalize, trigrams, words } from "./text.js";
import { CONFIDENTIAL, HEDGES, IDENTITY_ATTACK, LEGAL_ACCUSATIONS, matchLive, matchLivePhrases, SELF_HARM, SPAM_PHRASES, THREAT_PHRASES, WORD_RULES, type Tier } from "./lexicon.js";
import { findPii, redact, type PiiKind } from "./pii.js";
import { libraryHits } from "./profanity-lib.js";

export type ContentKind = "story" | "chitchat" | "report";
export type Decision = "allow" | "review" | "block";
export type ReasonCode =
  | "pii" | "slur" | "identity_attack" | "threat" | "sexual_abuse" | "defamation_risk" | "confidential"
  | "profanity" | "targeted_abuse" | "spam" | "links" | "shouting" | "gibberish" | "duplicate" | "self_harm" | "too_short" | "watchlist" | "vulgar";
export type Reason = { code: ReasonCode; weight: number; detail: string };
export type Review = { decision: Decision; score: number; reasons: Reason[]; message: string | null; excerpt: string; selfHarm: boolean };

export type ReviewContext = {
  kind: ContentKind;
  // The author's recent texts of the same kind, for duplicate/spam-run detection.
  recent?: string[];
  // The author's trust (trust.ts): trusted authors get a little more room before review.
  trust?: number;
  // Company name mentioned in the story: naming the company is the point, never a violation.
  companyName?: string;
};

// Everyday words people use when venting about a hiring process: never profanity, never "watch"
// words, never part of the vulgar count. "What the hell", "how on earth", "this is fucking absurd"
// are normal. Aimed at a person ("fuck you", "the recruiter can go to hell") they still count as an
// insult (targeted abuse), which raises the score but never blocks on its own.
export const EVERYDAY = /^(?:heck|hell|hella|damn\w*|dang|darn|frick\w*|freak\w*|f+u+c*k+(?:ing|in|ed|er|ery)?|fck\w*|fuk\w*|effing|wtf|omg|crap\w*|bloody|sh+i+t+(?:ty|s)?|bullshit)$/;
const EVERYDAY_PHRASES = /\b(?:how|what|where|why|who|when)\s+(?:on earth|in the world|the (?:hell|heck|fuck|f\*+k))\b/g;
const PERSON_WORDS = new Set(["you", "he", "she", "hr", "recruiter", "manager", "interviewer", "lead", "founder", "ceo", "him", "her", "them"]);

const PII_WEIGHT: Record<PiiKind, number> = { aadhaar: 1, pan: 1, card: 1, upi: 0.9, phone: 0.9, email: 0.8, address: 0.9, ifsc: 0.5, person: 0.55, link: 0.5 };
const PII_WORD: Record<PiiKind, string> = { aadhaar: "an Aadhaar number", pan: "a PAN", card: "a card number", upi: "a UPI ID", phone: "a phone number", email: "an email address", address: "a home address", ifsc: "bank details", person: "a person's name", link: "a link to someone's profile" };

export function reviewText(raw: string, ctx: ReviewContext): Review {
  const text = raw.trim();
  const reasons: Reason[] = [];
  const add = (code: ReasonCode, weight: number, detail: string) => reasons.push({ code, weight, detail });
  const folded = fold(text);
  const tokens = words(folded);

  // ---- personal data ----
  const pii = findPii(text).filter((h) => !(h.kind === "person" && ctx.companyName && normalize(h.text).includes(normalize(ctx.companyName))));
  for (const kind of new Set(pii.map((h) => h.kind))) add("pii", PII_WEIGHT[kind], PII_WORD[kind]);

  // ---- word-level tiers ----
  const tierHits: Record<Tier, string[]> = { slur: [], threat: [], severe: [], profanity: [] };
  const watched: string[] = [];
  let liveWeight = 0;
  // Everyday swearing is skipped (EVERYDAY above); only an insult aimed at someone is noted.
  const everydayAimed = tokens.some((w, i) => EVERYDAY.test(w) && ((PERSON_WORDS.has(tokens[i + 1] ?? "") && !["the", "a"].includes(tokens[i - 1] ?? "")) || tokens.slice(Math.max(0, i - 3), i).some((x) => PERSON_WORDS.has(x)) && /^(?:off|you|him|her|them)$/.test(tokens[i + 1] ?? "")));
  for (const w of tokens) {
    if (EVERYDAY.test(w)) continue;
    const curated = WORD_RULES.find((r) => r.re.test(w));
    if (curated) { tierHits[curated.tier].push(w); continue; }
    // The live list (imported open lists + terms learned from removed content).
    const t = matchLive(w);
    if (!t) continue;
    if (t.tier === "watch") { watched.push(w); liveWeight = Math.max(liveWeight, t.weight); } else tierHits[t.tier].push(w);
  }
  for (const t of matchLivePhrases(folded.replace(EVERYDAY_PHRASES, " "))) {
    if (t.tier === "watch") { watched.push(t.term); liveWeight = Math.max(liveWeight, t.weight); } else tierHits[t.tier].push(t.term);
  }
  // Second opinion from the obscenity library: adds what our lists missed (deduplicated by word).
  const seenWords = new Set([...tierHits.slur, ...tierHits.severe, ...tierHits.profanity].map((w) => w.replace(/[^a-z]/g, "")));
  for (const h of libraryHits(text)) if (!EVERYDAY.test(h.word) && ![...seenWords].some((w) => w.includes(h.word) || h.word.includes(w))) { tierHits[h.tier].push(h.word); seenWords.add(h.word); }
  // Vulgar: a stream of swearing (not a single "wtf"), or graphic language aimed at someone. This is
  // what Goofy removes outright.
  const profCount = tierHits.profanity.length;
  const profDensity = profCount / Math.max(1, tokens.length);
  const aimedSevere = tierHits.severe.length > 0 && tokens.some((w, i) => ["you", "he", "she", "hr", "recruiter", "manager", "interviewer"].includes(w) && tokens.slice(i + 1, i + 6).some((x) => tierHits.severe.includes(x)));
  // Everyday words don't count here either, unless the post is almost nothing but swearing.
  const everydayCount = tokens.filter((w) => EVERYDAY.test(w)).length;
  const mostlySwearing = everydayCount + profCount >= 5 && (everydayCount + profCount) / Math.max(1, tokens.length) > 0.4;
  if ((profCount >= 5 && profDensity > 0.08) || mostlySwearing || aimedSevere || tierHits.severe.length >= 3) add("vulgar", 1, "vulgar language");
  // Learned words can hold content for review, never block it on their own.
  if (watched.length) add("watchlist", Math.min(0.45, 0.25 * liveWeight + 0.08 * watched.length), "wording often seen in removed posts");
  if (tierHits.slur.length) add("slur", 1, "identity-based slur");
  if (IDENTITY_ATTACK.some((re) => re.test(folded))) add("identity_attack", 0.9, "an attack on a group of people");
  if (THREAT_PHRASES.some((re) => re.test(folded))) add("threat", 1, "threatening language");
  if (tierHits.severe.length) add("sexual_abuse", 0.6, "graphic sexual language");

  // Profanity: venting is fine. Density matters, and swearing right next to a named person is abuse.
  const prof = tierHits.profanity.length;
  if (prof) {
    const density = prof / Math.max(1, tokens.length);
    const w = Math.min(0.5, 0.08 * prof + density * 2);
    add("profanity", w, `${prof} swear word${prof === 1 ? "" : "s"}`);
    // A swear word within three words after a person ("the recruiter was a total b*tch", "you
    // idiot") is an insult at someone, not venting about a process.
    const PERSON = new Set(["you", "he", "she", "hr", "recruiter", "manager", "interviewer", "lead", "founder", "ceo", "him", "her"]);
    const swearAt = new Set(tierHits.profanity);
    const aimed = tokens.some((w, i) => PERSON.has(w) && tokens.slice(i + 1, i + 5).some((x) => swearAt.has(x)));
    if (aimed || (pii.some((h) => h.kind === "person") && prof > 0)) add("targeted_abuse", 0.35, "insults aimed at a person");
  } else if (everydayAimed) add("targeted_abuse", 0.25, "swearing aimed at a person");

  // ---- legal ----
  const accusations = LEGAL_ACCUSATIONS.filter((re) => re.test(folded)).length;
  if (accusations) {
    const hedged = HEDGES.test(folded);
    add("defamation_risk", hedged ? 0.2 : 0.55, hedged ? "a serious accusation, phrased as experience" : "a serious accusation stated as fact");
  }
  if (CONFIDENTIAL.some((re) => re.test(folded))) add("confidential", 0.6, "what looks like confidential material");

  // ---- spam and quality ----
  const links = (text.match(/\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|in|io|co|net|org|xyz|link|ly)\b\/?/gi) ?? []).length;
  if (links >= 2 || (ctx.kind === "chitchat" && links >= 1)) add("links", Math.min(0.6, 0.2 * links), `${links} link${links === 1 ? "" : "s"}`);
  if (SPAM_PHRASES.some((re) => re.test(folded))) add("spam", 0.55, "promotional or off-platform lure");
  const caps = capsRatio(text);
  if (caps > 0.6) add("shouting", 0.15, "mostly capital letters");
  if (/(.)\1{7,}/.test(text) || (tokens.length > 8 && new Set(tokens).size / tokens.length < 0.3)) add("gibberish", 0.35, "repeated characters or words");
  if (ctx.recent?.length) {
    const g = trigrams(text);
    const top = Math.max(...ctx.recent.map((r) => jaccard(g, trigrams(r))));
    if (top > 0.85) add("duplicate", 0.5, "nearly the same as something you posted recently");
  }
  if (ctx.kind === "story" && tokens.length < 12) add("too_short", 0.1, "very short");

  const selfHarm = SELF_HARM.some((re) => re.test(folded));
  if (selfHarm) add("self_harm", 0.4, "mentions of self-harm");

  // ---- combine ----
  // Noisy-OR: independent signals add up without ever exceeding 1.
  const score = 1 - reasons.reduce((p, r) => p * (1 - Math.min(1, r.weight)), 1);
  const has = (c: ReasonCode) => reasons.some((r) => r.code === c);
  const hardPii = pii.some((h) => ["aadhaar", "pan", "card", "upi", "phone", "email", "address"].includes(h.kind));
  const slack = (ctx.trust ?? 0.6) > 0.8 ? 0.08 : 0;

  let decision: Decision = "allow";
  if (has("slur") || has("threat") || has("identity_attack") || has("vulgar") || hardPii || (has("confidential") && /password|api key|credentials/.test(folded))) decision = "block";
  else if (selfHarm || score >= 0.5 + slack || has("sexual_abuse") || has("duplicate")) decision = "review";

  return { decision, score: Math.round(score * 100) / 100, reasons, message: messageFor(decision, reasons, ctx.kind), excerpt: redact(text, pii).slice(0, 280), selfHarm };
}

// What the author sees. Plain, specific, fixable.
function messageFor(d: Decision, reasons: Reason[], kind: ContentKind): string | null {
  const what = kind === "story" ? "story" : kind === "chitchat" ? "chitchat" : "note";
  const pii = reasons.filter((r) => r.code === "pii").map((r) => r.detail);
  if (d === "block") {
    if (pii.length) return `Your ${what} includes ${list(pii)}. Remove it and post again, so nobody can be identified.`;
    if (reasons.some((r) => r.code === "threat")) return `Your ${what} reads as a threat. Describe what happened instead, and it can go up.`;
    if (reasons.some((r) => r.code === "vulgar")) return `Your ${what} is mostly swearing. Tell people what happened in plain words and it'll land harder.`;
    if (reasons.some((r) => r.code === "slur" || r.code === "identity_attack")) return `Your ${what} includes language that attacks people for who they are. Take it out and post again.`;
    return `Your ${what} includes something we can't publish (${reasons[0]?.detail ?? "a policy issue"}). Edit it and try again.`;
  }
  if (d === "review") {
    if (reasons.some((r) => r.code === "self_harm")) return "Thanks for sharing. A person from our team will read this soon. If you're in distress, please call Tele-MANAS on 14416 (free, 24×7).";
    const top = [...reasons].sort((a, b) => b.weight - a.weight).slice(0, 2).map((r) => r.detail);
    return `Your ${what} is saved and will go up after a quick check (it mentions ${list(top)}). This usually takes a few hours.`;
  }
  return null;
}
const list = (xs: string[]) => (xs.length <= 1 ? xs[0] ?? "" : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
