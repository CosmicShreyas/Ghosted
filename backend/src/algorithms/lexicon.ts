// Word lists for moderation and search. Matching happens on folded, whole words (see text.ts), so
// "class", "assess" or "Scunthorpe" never trip the filter; each entry lists the stems it covers.
//
// Tiers:
//   slur      identity-based abuse (caste, religion, gender, sexuality, disability, region). Blocked.
//   threat    violence or intimidation aimed at someone. Blocked.
//   severe    graphic sexual abuse aimed at a person. Held for review.
//   profanity everyday swearing, English and Hinglish. Venting about a hiring process is allowed,
//             so profanity alone only lowers the score; lots of it, or aimed at a named person, is held.
//
// Kept deliberately short and explicit; extend it rather than loosen the matcher.

export type Tier = "slur" | "threat" | "severe" | "profanity";

// ---------- the live list (imported + learned, installed by automation.ts) ----------
// The curated rules below always apply. On top of them, terms from the database: exact words go in
// a hash map (one lookup per word), wildcard terms become regexes, multi-word terms are matched as
// phrases. Words on the learned allow-list ("normal on Ghosted") are never flagged by these.
export type LiveTier = Tier | "watch";
export type LiveTerm = { term: string; tier: LiveTier; weight: number; pattern: boolean; exceptions: string[] };
type Live = { exact: Map<string, LiveTerm>; patterns: { re: RegExp; t: LiveTerm }[]; phrases: { re: RegExp; t: LiveTerm }[]; allow: Set<string>; version: number };
let live: Live = { exact: new Map(), patterns: [], phrases: [], allow: new Set(), version: 0 };

const esc = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
// Common inflections, so "scammers"/"scamming" match a learned "scam".
const SUFFIX = "(?:s|es|ed|ing|er|ers|y|ie|ies)?";
export function installLexicon(terms: LiveTerm[], allow: Iterable<string>) {
  const next: Live = { exact: new Map(), patterns: [], phrases: [], allow: new Set(allow), version: live.version + 1 };
  for (const t of terms) {
    if (next.allow.has(t.term)) continue;
    const body = esc(t.term).replace(/\*/g, "[a-z*]{0,3}");
    if (t.term.includes(" ")) next.phrases.push({ re: new RegExp(`\\b${body.replace(/ /g, "\\s+")}${SUFFIX}\\b`), t });
    else if (t.pattern) next.patterns.push({ re: new RegExp(`^${body}${SUFFIX}$`), t });
    else next.exact.set(t.term, t);
  }
  live = next;
}
export const lexiconVersion = () => live.version;

// One folded word → the live term it hits, if any (exact, then a plain-suffix strip, then patterns).
export function matchLive(word: string): LiveTerm | null {
  if (live.allow.has(word)) return null;
  const hit = (t: LiveTerm | undefined) => (t && !t.exceptions.includes(word) ? t : null);
  const exact = hit(live.exact.get(word));
  if (exact) return exact;
  const base = word.replace(/(?:ing|ers|er|ed|es|s)$/, "");
  if (base.length >= 3 && base !== word) { const b = hit(live.exact.get(base)); if (b) return b; }
  for (const p of live.patterns) if (p.re.test(word)) { const h = hit(p.t); if (h) return h; }
  return null;
}
export function matchLivePhrases(folded: string): LiveTerm[] {
  return live.phrases.filter((p) => p.re.test(folded)).map((p) => p.t);
}

// Each entry: a regex source matched against ONE folded word ("^...$" is added).
const T = (tier: Tier, ...patterns: string[]) => patterns.map((p) => ({ tier, re: new RegExp(`^(?:${p})$`) }));

export const WORD_RULES = [
  // Profanity (English).
  ...T("profanity", "f+u+c*k+\\w*", "f\\*+k\\w*", "fck\\w*", "fuk\\w*", "wtf", "stfu", "sh+i+t+\\w*", "sh\\*t\\w*", "bullsh\\w+", "crap\\w*", "damn\\w*",
    "ass(?:hole|holes|hat|wipe)?", "a\\*+hole", "bastard\\w*", "bitch\\w*", "b\\*+ch", "dick(?:head|s)?", "douche\\w*", "prick\\w*", "piss(?:ed)?", "twat\\w*", "wank\\w*", "bloody"),
  // Profanity (Hinglish, romanised). Common spellings and masks.
  ...T("profanity", "bh?enc?h?o+d\\w*", "b\\*+c", "bc", "mc", "madarc?h?o+d\\w*", "m\\*+c", "ch?u+t[iy]+y?a+\\w*", "ch\\*+ya", "c\\*+tiya", "gandu\\w*", "g\\*+ndu",
    "harami\\w*", "kamin[ae]\\w*", "kutt[ae]\\w*", "saal[ae]", "bhosd\\w*", "lod[ae]\\w*", "laud[ae]\\w*", "lund\\w*", "jhaat\\w*", "tatti", "randi\\w*"),
  // Graphic sexual abuse aimed at people.
  ...T("severe", "rape\\w*", "rapist\\w*", "molest\\w*", "pedo\\w*", "paedo\\w*", "whore\\w*", "slut\\w*", "cunt\\w*", "c\\*+nt"),
  // Identity slurs (caste, religion, region, sexuality, disability). Never acceptable.
  // Regional and religious identities ("bihari", "muslim", "madrasi") are not slurs on their own and
  // are deliberately absent: they're caught only by IDENTITY_ATTACK below, when used as an insult.
  ...T("slur", "chamar\\w*", "bhangi\\w*", "chuhra\\w*", "katua\\w*", "katwa\\w*", "jihadi\\w*", "sanghi\\w*", "chinki\\w*",
    "hijra\\w*", "chakka\\w*", "faggot\\w*", "fag(?:s)?", "retard\\w*", "nigg\\w*", "tranny\\w*", "spastic\\w*"),
];

// An identity used as the insult: "because he's a bihari", "these muslims always", "typical south
// indians". Hiring discrimination described by the victim ("they rejected me for being a woman")
// is exactly what Ghosted is for, so only generalising, hostile phrasing is matched.
export const IDENTITY_ATTACK: RegExp[] = [
  /\b(?:these|those|all|typical|bloody|dirty|stupid|damn)\s+(?:biharis?|madrasis?|muslims?|hindus?|christians?|sikhs?|dalits?|brahmins?|marwaris?|gujjus?|mallus?|northies|south indians?|north indians?|women|girls|gays?)\b/,
  /\b(?:biharis?|madrasis?|muslims?|hindus?|dalits?|brahmins?|women|girls)\s+(?:are|always|never)\s+(?:lazy|dirty|stupid|useless|cheats?|thieves|frauds?|terrorists?|incompetent)\b/,
];

// Violence and intimidation, matched as phrases on the folded text.
export const THREAT_PHRASES: RegExp[] = [
  /\b(?:i|we)(?:'ll| will| am going to| gonna)\s+(?:kill|beat|hurt|stab|shoot|destroy|find)\b/,
  /\b(?:kill|murder|stab|shoot|burn)\s+(?:him|her|them|you|that|this|the)\b/,
  /\bwatch your back\b/, /\byou(?:'ll| will) regret\b/, /\bi know where (?:you|he|she|they) live/,
  /\b(?:maar|maarunga|maar dunga|jaan se maar|khatam kar dunga|dekh lunga)\b/,
  /\bacid (?:attack|on)\b/, /\bshould (?:be|get) (?:killed|raped|beaten|shot)\b/,
];

// Self-harm: never blocked; the author gets a helpline note and a human looks at it.
export const SELF_HARM: RegExp[] = [/\b(?:kill myself|end my life|suicid\w*|want to die|no reason to live|self harm)\b/];

// Statements of criminal fact about a person or company are the classic defamation risk (IPC/BNS
// 356). Opinions and experiences ("felt like a scam", "I think") are fine; assertions of crime are
// held so a human can check they're phrased as the author's experience.
export const LEGAL_ACCUSATIONS: RegExp[] = [
  /\b(?:is|are|was|were)\s+(?:a\s+)?(?:fraud|scammer|scam|criminal|thief|thieves|cheat|cheater|con ?artist)s?\b/,
  /\b(?:stole|steals|embezzl\w*|launder\w*|bribe\w*|extort\w*|forged?|forgery)\b/,
  /\b(?:sexually harass\w*|harassed me sexually|asked for sexual favou?rs)\b/,
  /\b(?:takes|took|asked for|demanded)\s+(?:a\s+)?(?:bribe|kickback|cash|money)\s+(?:for|to)\s+(?:the\s+)?(?:job|offer|joining|interview)\b/,
];
// Leaking confidential material (NDA, salary sheets, internal docs, source code).
export const CONFIDENTIAL: RegExp[] = [
  /\b(?:internal|confidential|leaked|nda)\s+(?:doc\w*|document\w*|email\w*|sheet|slides?|deck|memo|policy|data)\b/,
  /\b(?:here(?:'s| is) the|attached the|sharing the)\s+(?:salary sheet|offer letter|internal)\b/,
  /\b(?:source code|api key|password|credentials)\s*[:=]/,
];
// Hedges that turn an accusation into an experience: lower the legal risk.
export const HEDGES = /\b(?:felt like|seemed like|looked like|i think|i believe|in my opinion|imo|to me|my experience|allegedly|apparently|it seemed|probably|i felt)\b/;

// Spam and off-platform lures.
export const SPAM_PHRASES: RegExp[] = [
  /\b(?:dm|whatsapp|telegram|message|ping)\s+me\b/, /\b(?:join|subscribe)\s+(?:my|our)\s+(?:channel|group|course)\b/,
  /\b(?:guaranteed|100%)\s+(?:job|placement|referral|offer)\b/, /\breferral\s+(?:for|at)\s+(?:rs|inr|₹)\s?\d/,
  /\b(?:earn|make)\s+(?:rs|inr|₹|\$)\s?\d[\d,]*\s*(?:per|a|\/)\s*(?:day|week|month)\b/, /\bwork from home\b.*\b(?:earn|income)\b/,
  /\bpaid (?:resume|cv) (?:writing|review)\b/, /\bcrypto|forex|binary options\b/,
];

// Search: concepts people describe in different words. Every word maps to its concept group, so a
// search for "no reply" also finds stories that say "ghosted", "radio silence" or "never heard back".
export const CONCEPTS: string[][] = [
  ["ghosted", "ghost", "ghosting", "no reply", "no response", "never heard", "radio silence", "silence", "unresponsive", "went quiet", "stopped responding", "left on read", "disappeared"],
  ["offer revoked", "rescinded", "revoked", "withdrew the offer", "pulled the offer", "offer cancelled", "offer canceled", "offer withdrawn"],
  ["ghost job", "fake job", "fake posting", "fake opening", "never existed", "evergreen posting", "resume harvesting"],
  ["rejected", "rejection", "turned down", "not selected", "didn't make it", "regret email", "regret mail"],
  ["offer", "offer letter", "selected", "got the job", "hired", "joining letter"],
  ["interview", "round", "loop", "panel", "onsite"],
  ["technical", "coding", "dsa", "leetcode", "system design", "machine coding", "take home", "assignment", "live coding"],
  ["hr", "recruiter", "talent acquisition", "ta", "hiring manager", "poc"],
  ["salary", "ctc", "lpa", "package", "compensation", "pay", "in hand", "stipend", "hike"],
  ["notice period", "buyout", "serving notice", "lwd", "last working day"],
  ["bond", "service agreement", "training bond", "penalty clause"],
  ["background verification", "bgv", "background check", "document verification"],
  ["unpaid", "free work", "unpaid assignment", "unpaid trial"],
  ["toxic", "hostile", "rude", "disrespectful", "arrogant", "humiliating"],
  ["delay", "delayed", "postponed", "rescheduled", "waiting", "wait"],
  ["fresher", "freshers", "graduate", "campus", "entry level", "new grad"],
  ["remote", "wfh", "work from home", "hybrid", "onsite"],
  ["layoff", "laid off", "layoffs", "rif", "retrenchment", "hiring freeze"],
];

// Outcome and round names people type, mapped to the API's values (search filters).
export const OUTCOME_ALIASES: Record<string, string> = { ghosted: "ghosted", ghost: "ghosted", rejected: "rejected", rejection: "rejected", offer: "offer", hired: "offer", revoked: "offer_revoked", rescinded: "offer_revoked", "ghost-job": "ghost_job", ghostjob: "ghost_job", fake: "ghost_job" };
export const STAGE_ALIASES: Record<string, string> = { application: "application", applied: "application", screening: "screening", screen: "screening", hr: "screening", technical: "technical", tech: "technical", coding: "technical", final: "final", onsite: "final", offer: "offer" };
