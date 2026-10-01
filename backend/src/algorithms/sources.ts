// Parsers for the open word lists the platform imports daily (automation.ts fetches them). Pure:
// text in, terms out. Each source is mapped onto Ghosted's tiers conservatively: mild entries
// ("gay", "breast", "god") are skipped, because people describing discrimination or their own
// lives must never be flagged for it.
//
//   dsojevic/profanity-list (MIT)   en.json: { match: "a|b*c", tags: [...], severity: 1–4, exceptions }
//   LDNOOBW (CC BY 4.0)             one term per line; "en" English, "hi" romanised Hindi/Hinglish
import { fold } from "./text.js";

export type ImportedTerm = { term: string; tier: "slur" | "severe" | "profanity"; source: "dsojevic" | "ldnoobw_en" | "ldnoobw_hi"; weight: number; pattern: boolean; exceptions: string[] };

export const SOURCES = {
  dsojevic: "https://raw.githubusercontent.com/dsojevic/profanity-list/main/en.json",
  ldnoobw_en: "https://raw.githubusercontent.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/master/en",
  ldnoobw_hi: "https://raw.githubusercontent.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/master/hi",
} as const;

// Never imported, whatever a list says: identity words, body and health words, everyday English
// that some lists include. (The automatic allow-list in automation.ts adds to this from real usage.)
export const NEVER_FLAG = new Set(("gay lesbian bisexual queer trans transgender homosexual lgbt lgbtq muslim muslims islam hindu hindus christian christians jew jews jewish sikh "
  + "dalit dalits brahmin brahmins black white asian african indian chinese women woman girl girls boy boys female male sex sexual gender breast breasts "
  + "cancer period periods pregnant pregnancy menstrual vagina penis rape abuse abused harass harassed harassment kill killed die dead god hell damn "
  + "bloody screw screwed suck sucks sucked crap balls ball cock hoe hoes tit tits bang banging hump nut nuts wood beaver pussy cat dick").split(" "));

const clean = (s: string) => fold(s).replace(/[^a-z0-9* ]/g, "").replace(/\s+/g, " ").trim();
const okLength = (t: string) => t.replace(/[\s*]/g, "").length >= 3 && t.length <= 60;

export function parseDsojevic(json: unknown): ImportedTerm[] {
  if (!Array.isArray(json)) return [];
  const out: ImportedTerm[] = [];
  for (const e of json as { match?: unknown; tags?: unknown; severity?: unknown; exceptions?: unknown }[]) {
    if (typeof e.match !== "string") continue;
    const tags = Array.isArray(e.tags) ? (e.tags as string[]) : [];
    const sev = typeof e.severity === "number" ? e.severity : 2;
    const identity = tags.some((t) => t === "racial" || t === "religious" || t === "lgbtq");
    // Identity-based terms: only the most severe are slurs; milder ones are too often neutral words.
    const tier = identity ? (sev >= 3 ? "slur" : null) : tags.includes("shock") || (tags.includes("sexual") && sev >= 4) ? "severe" : sev >= 2 ? "profanity" : null;
    if (!tier) continue;
    for (const alt of e.match.split("|")) {
      const term = clean(alt);
      if (!okLength(term) || NEVER_FLAG.has(term)) continue;
      // Exceptions are written with * standing for the match itself ("m*" = "manus" for "anus").
      const exceptions = Array.isArray(e.exceptions) ? (e.exceptions as string[]).map((x) => clean(x.replace(/\*/g, alt))) : [];
      out.push({ term, tier, source: "dsojevic", weight: tier === "profanity" ? Math.min(1, 0.4 + sev * 0.15) : 1, pattern: term.includes("*"), exceptions });
    }
  }
  return dedupe(out);
}

export function parseLdnoobw(text: string, lang: "en" | "hi"): ImportedTerm[] {
  const out: ImportedTerm[] = [];
  for (const line of text.split(/\r?\n/)) {
    const term = clean(line);
    if (!okLength(term) || NEVER_FLAG.has(term) || term.includes("*")) continue;
    // English list is mostly sexual slang and phrases: profanity at a lower weight. Hindi list is
    // abuse: full weight.
    out.push({ term, tier: "profanity", source: lang === "en" ? "ldnoobw_en" : "ldnoobw_hi", weight: lang === "en" ? 0.5 : 0.8, pattern: false, exceptions: [] });
  }
  return dedupe(out);
}

// The strongest tier wins when two sources list the same term.
const RANK = { slur: 3, severe: 2, profanity: 1 } as const;
function dedupe(xs: ImportedTerm[]): ImportedTerm[] {
  const m = new Map<string, ImportedTerm>();
  for (const x of xs) { const cur = m.get(x.term); if (!cur || RANK[x.tier] > RANK[cur.tier]) m.set(x.term, x); }
  return [...m.values()];
}
