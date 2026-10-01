// A second, independent profanity detector: the `obscenity` library (MIT, maintained), with its
// English dataset and recommended transformers (leetspeak, repeated characters, confusables). It
// catches spellings our lexicon misses and vice versa; moderation.ts merges both.
//
// Its matches carry the original dictionary word; those map onto Ghosted's tiers below. Anything not
// listed as a slur or graphic counts as everyday profanity.
import { englishDataset, englishRecommendedTransformers, RegExpMatcher } from "obscenity";
import type { Tier } from "./lexicon.js";

const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });

const SLURS = new Set(["nigger", "nigga", "faggot", "fag", "retard", "tranny", "chink", "spic", "kike", "dyke", "paki", "coon", "gook", "wetback", "raghead", "towelhead"]);
const GRAPHIC = new Set(["cunt", "rape", "rapist", "pedophile", "paedophile", "molest", "whore", "slut", "cum", "jizz", "dildo", "blowjob", "handjob", "gangbang", "bestiality", "incest"]);

export type LibHit = { word: string; tier: Tier; index: number };

export function libraryHits(text: string): LibHit[] {
  try {
    return matcher.getAllMatches(text, true).map((m) => {
      const word = englishDataset.getPayloadWithPhraseMetadata(m).phraseMetadata?.originalWord ?? "profanity";
      return { word, tier: SLURS.has(word) ? "slur" as const : GRAPHIC.has(word) ? "severe" as const : "profanity" as const, index: m.startIndex };
    });
  } catch { return []; }
}
