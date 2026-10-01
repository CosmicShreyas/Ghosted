// Learning from the platform itself, so the word lists and search synonyms keep up with how people
// actually write. Pure functions; automation.ts feeds them data daily.
//
//   discriminativeTerms   words that mark removed content apart from clean content, by the
//                         log-odds ratio with an informative Dirichlet prior (Monroe, Colaresi &
//                         Quinn 2008). Robust for rare words: a word seen twice can't score high.
//   obfuscatedVariants    new spellings of known bad words ("b!tch", "ch*tiyaa", "bh3nchod"): only
//                         tokens that were visibly disguised in the original text count
//   commonWords           words so common in clean stories that no list may flag them
//   learnConcepts         search synonyms: words that keep appearing with a concept's words, by
//                         positive pointwise mutual information (PPMI) across documents
import { editDistance, fold, isStop, normalize, terms, words } from "./text.js";

export type Doc = { text: string; author: string };

// Per-document word sets (presence, not counts: one rant repeating a word shouldn't dominate).
const docWords = (text: string) => new Set(words(fold(text)).filter((w) => w.length >= 3 && !isStop(w) && !/^\d+$/.test(w)));

export type LearnedTerm = { term: string; z: number; inBad: number; inGood: number; authors: number };

export function discriminativeTerms(bad: Doc[], good: Doc[], opts = { minDocs: 5, minAuthors: 3, minZ: 3.3, max: 40 }): LearnedTerm[] {
  if (bad.length < opts.minDocs || good.length < 50) return [];
  const count = (docs: Doc[]) => {
    const n = new Map<string, number>(), who = new Map<string, Set<string>>();
    for (const d of docs) for (const w of docWords(d.text)) { n.set(w, (n.get(w) ?? 0) + 1); (who.get(w) ?? who.set(w, new Set()).get(w)!).add(d.author); }
    return { n, who };
  };
  const B = count(bad), G = count(good);
  const nB = [...B.n.values()].reduce((a, b) => a + b, 0), nG = [...G.n.values()].reduce((a, b) => a + b, 0);
  // Prior: overall frequency across both sets, scaled to a modest pseudo-count.
  const a0 = 500;
  const total = nB + nG;
  const out: LearnedTerm[] = [];
  for (const [w, yb] of B.n) {
    const authors = B.who.get(w)?.size ?? 0;
    if (yb < opts.minDocs || authors < opts.minAuthors) continue;
    const yg = G.n.get(w) ?? 0;
    const aw = a0 * ((yb + yg) / total);
    const delta = Math.log((yb + aw) / (nB + a0 - yb - aw)) - Math.log((yg + aw) / (nG + a0 - yg - aw));
    const variance = 1 / (yb + aw) + 1 / (yg + aw);
    const z = delta / Math.sqrt(variance);
    if (z >= opts.minZ) out.push({ term: w, z: Math.round(z * 100) / 100, inBad: yb, inGood: yg, authors });
  }
  return out.sort((x, y) => y.z - x.z).slice(0, opts.max);
}

// Raw tokens that were disguised (digits, symbols or masks inside letters) and fold to within one
// edit of a known term. Plain words never qualify, so "pitch" can't become a variant of "b*tch".
export function obfuscatedVariants(texts: string[], known: Map<string, string>, max = 50): { variant: string; of: string; tier: string }[] {
  const found = new Map<string, { of: string; tier: string; n: number }>();
  const knownList = [...known.keys()].filter((k) => !k.includes(" ") && !k.includes("*") && k.length >= 4);
  for (const t of texts) for (const raw of normalize(t).match(/[a-z0-9@$!|*#]{4,24}/g) ?? []) {
    if (!/[a-z]/.test(raw) || !/[0-9@$!|*#]/.test(raw) || /^\d+$/.test(raw.replace(/[^a-z0-9]/g, ""))) continue;
    const f = fold(raw);
    if (known.has(f)) continue;
    for (const k of knownList) {
      if (Math.abs(k.length - f.length) > 1 || k[0] !== f[0]) continue;
      if (editDistance(f, k, 1) <= 1) { const cur = found.get(f); found.set(f, { of: k, tier: known.get(k)!, n: (cur?.n ?? 0) + 1 }); break; }
    }
  }
  return [...found.entries()].filter(([, v]) => v.n >= 2).sort((a, b) => b[1].n - a[1].n).slice(0, max).map(([variant, v]) => ({ variant, of: v.of, tier: v.tier }));
}

// Words in at least `share` of clean documents (and at least `min` of them): normal vocabulary here.
export function commonWords(good: Doc[], share = 0.01, min = 30): string[] {
  const n = new Map<string, number>();
  for (const d of good) for (const w of docWords(d.text)) n.set(w, (n.get(w) ?? 0) + 1);
  const need = Math.max(min, good.length * share);
  return [...n.entries()].filter(([, c]) => c >= need).map(([w]) => w);
}

// For each concept (a group of seed phrases), the stems that co-occur with it far more than chance.
// Words that co-occur with everything topical but mean nothing on their own.
const GENERIC = new Set(("zero one two three four five six seven eight nine ten first second third fourth fifth last next total whole entire "
  + "also really very much many lot lots thing things time times week weeks month months year years day days today yesterday ago "
  + "came come comes went go goes got get gets said say says told tell tells made make makes took take takes gave give gives").split(" "));

export function learnConcepts(texts: string[], concepts: string[][], opts = { minDocs: 8, minPpmi: 1.5, perConcept: 3 }): { seed: string; term: string; weight: number; docs: number }[] {
  // A word already curated into some concept keeps that meaning; learning never re-files it.
  const curated = new Set(concepts.flat().flatMap((g) => terms(g)));
  const generic = new Set([...GENERIC].flatMap((w) => terms(w)));
  const docs = texts.map((t) => new Set(terms(t)));
  const N = docs.length;
  if (N < 100) return [];
  const df = new Map<string, number>();
  for (const d of docs) for (const w of d) df.set(w, (df.get(w) ?? 0) + 1);
  const out: { seed: string; term: string; weight: number; docs: number }[] = [];
  for (const group of concepts) {
    const seedStems = new Set(group.flatMap((g) => terms(g)));
    const seed = group[0]!;
    const withConcept = docs.filter((d) => [...seedStems].some((s) => d.has(s)));
    if (withConcept.length < opts.minDocs) continue;
    const co = new Map<string, number>();
    for (const d of withConcept) for (const w of d) if (!seedStems.has(w)) co.set(w, (co.get(w) ?? 0) + 1);
    const pc = withConcept.length / N;
    const scored = [...co.entries()].filter(([w, c]) => c >= opts.minDocs && (df.get(w) ?? 0) / N < 0.25 && w.length >= 4 && !curated.has(w) && !generic.has(w) && !/\d/.test(w))
      .map(([w, c]) => ({ w, c, ppmi: Math.max(0, Math.log2((c / N) / (pc * ((df.get(w) ?? 1) / N)))) }))
      .filter((x) => x.ppmi >= opts.minPpmi).sort((a, b) => b.ppmi - a.ppmi).slice(0, opts.perConcept);
    // Weight stays below a typed word's (1) and the curated siblings' (0.45).
    for (const s of scored) out.push({ seed, term: s.w, weight: Math.min(0.35, 0.12 * s.ppmi), docs: s.c });
  }
  return out;
}
