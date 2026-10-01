// Text primitives shared by every algorithm: normalisation, obfuscation folding, tokenising,
// stemming and fuzzy similarity. Pure functions, no I/O.

// Unicode-normalise, drop accents, lower-case. "Café" → "cafe", full-width "ＡＢＣ" → "abc".
export function normalize(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Characters people swap in to dodge filters: leetspeak and look-alike letters (Cyrillic/Greek).
const FOLD: Record<string, string> = {
  "0": "o", "1": "i", "!": "i", "|": "i", "3": "e", "4": "a", "@": "a", "5": "s", "$": "s", "7": "t", "+": "t", "8": "b", "9": "g",
  "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "і": "i", "ј": "j", "ѕ": "s", "ԁ": "d", "ɡ": "g",
  "α": "a", "ε": "e", "ο": "o", "ρ": "p", "τ": "t", "υ": "u", "ν": "v", "κ": "k", "ι": "i",
};

// For moderation: folds obfuscation so "f.u.c.k", "fuuuuck", "sh1t" and "ch*tiya" all match.
//   - look-alikes and leetspeak → letters
//   - separators inside a word ("f.u.c.k", "f u c k" when every piece is one letter) removed
//   - "*" and "#" masks kept as a wildcard marker "*"
//   - runs of 3+ of the same letter squeezed to 2 ("fuuuuck" → "fuuck"; lexicon forms handle 1–2)
export function fold(s: string): string {
  let t = normalize(s).replace(/[​-‍﻿]/g, "");
  t = [...t].map((ch) => FOLD[ch] ?? ch).join("");
  // Spaced-out single letters: "f u c k" / "f.u.c.k" / "f-u-c-k".
  t = t.replace(/\b(?:[a-z][\s.\-_]){2,}[a-z]\b/g, (m) => m.replace(/[\s.\-_]/g, ""));
  t = t.replace(/[#]/g, "*");
  t = t.replace(/([a-z])\1{2,}/g, "$1$1");
  return t;
}

// Words (letters, digits, apostrophes inside words). Keeps "*" so masked words survive for moderation.
export const words = (s: string) => s.match(/[a-z0-9*]+(?:'[a-z]+)?/g) ?? [];

const STOP = new Set(("a an and are as at be been but by for from had has have i if in into is it its just me my of on or our so "
  + "than that the their them then there they this to too very was we were what when where which who why will with you your "
  + "he she him her his hers also about after again all am any because before being both can could did do does doing down during each "
  + "few further here how more most no nor not only other ought out over own same should some such through under until up while would").split(" "));
export const isStop = (w: string) => STOP.has(w);

// A light English stemmer (Porter step-1 style plus common suffixes). Good enough for matching
// "interviews/interviewed/interviewing" together without mangling short words or names.
export function stem(w: string): string {
  if (w.length <= 3 || /\d/.test(w)) return w;
  let s = w;
  if (s.endsWith("'s")) s = s.slice(0, -2);
  if (s.endsWith("sses")) s = s.slice(0, -2);
  else if (s.endsWith("ies") && s.length > 4) s = `${s.slice(0, -3)}y`;
  else if (s.endsWith("s") && !s.endsWith("ss") && !s.endsWith("us") && !s.endsWith("is")) s = s.slice(0, -1);
  for (const [suf, rep] of [["ational", "ate"], ["ization", "ize"], ["fulness", "ful"], ["iveness", "ive"], ["ingly", ""], ["edly", ""], ["ment", ""], ["ness", ""], ["ing", ""], ["ed", ""], ["ly", ""], ["er", ""]] as const) {
    if (s.endsWith(suf) && s.length - suf.length >= 3) { s = s.slice(0, -suf.length) + rep; break; }
  }
  // "stopp" → "stop", "hopp" → "hop" after stripping -ing/-ed.
  if (/([^aeiouslz])\1$/.test(s)) s = s.slice(0, -1);
  return s;
}

// Search tokens: normalised, stop words removed, stemmed.
export const terms = (s: string) => words(normalize(s)).filter((w) => w.length > 1 && !isStop(w)).map(stem);

// Character trigrams (padded), for typo-tolerant matching: "accentre" still finds "accenture".
export function trigrams(s: string): Set<string> {
  const t = `  ${normalize(s).replace(/[^a-z0-9]+/g, " ").trim()} `;
  const out = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
}
export function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
export const similarity = (a: string, b: string) => jaccard(trigrams(a), trigrams(b));

// Damerau-Levenshtein distance, capped (returns cap+1 once it's clearly further apart).
export function editDistance(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > cap) return cap + 1;
  }
  return d[a.length]![b.length]!;
}

// Share of letters that are upper-case (shouting), over letters only.
export function capsRatio(s: string): number {
  const letters = s.match(/\p{L}/gu) ?? [];
  if (letters.length < 12) return 0;
  return letters.filter((c) => c !== c.toLowerCase()).length / letters.length;
}
