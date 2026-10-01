// Ghosted's algorithms, one file each. All pure (no database, no network), so they're easy to test
// and to reason about. The routes gather the data and call these.
//
//   text.ts        normalising, obfuscation folding, stemming, fuzzy similarity   (used by all)
//   lexicon.ts     word lists: profanity (EN + Hinglish), slurs, threats, legal risk, spam, concepts
//   pii.ts         personal data: phones, Aadhaar (Verhoeff), PAN, UPI, cards (Luhn), names, links
//   moderation.ts  automatic review of stories, chitchats and report notes: allow / review / block
//   trust.ts       how much a person's reports and signals should weigh (Beta posterior)
//   reports.ts     report triage: queue priority and when to hide something before a human looks
//   recommend.ts   the For you feed: follows, followed companies, new voices, freshness, diversity
//   search.ts      search: parsing, concept expansion, typo correction, BM25F ranking
//   stats.ts       robust statistics for Insights: medians, Wilson, Bayes, trends, k-anonymity
//   sources.ts     parsers for the open word lists imported daily (dsojevic, LDNOOBW en/hi)
//   learn.ts       learning from the platform: discriminative terms, disguised variants, normal
//                  vocabulary, search synonyms (PPMI)
//   queue.ts       what happens to held and reported content without anyone touching it
//
// automation.ts (one level up) runs the daily jobs that feed these: refresh lists, learn, sweep.
export * from "./moderation.js";
export * from "./sources.js";
export * from "./learn.js";
export * from "./queue.js";
export { installLexicon, lexiconVersion, type LiveTerm } from "./lexicon.js";
export { installLearnedConcepts } from "./search.js";
export * from "./reports.js";
export * from "./trust.js";
export * from "./recommend.js";
export * from "./search.js";
export * as stats from "./stats.js";
