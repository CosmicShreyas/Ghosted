// Search across stories and companies. Understands what people mean, not just what they type:
//
//   1. Query parsing       "quoted phrases", -exclusions, company:acme, outcome:ghosted, round:final
//   2. Concept expansion   "no reply" also searches ghosted / radio silence / never heard back
//                          (lexicon CONCEPTS), at a lower weight than the words actually typed
//   3. Typo tolerance      unknown words are corrected against the index vocabulary (edit distance
//                          ≤ 1 for short words, ≤ 2 for long ones), and company names match by
//                          trigram similarity ("accentre" → Accenture)
//   4. Ranking             BM25F: title ×2.5, company ×3, role ×1.5, body ×1 (k1 1.2, b 0.75),
//                          + exact phrase bonus, + small freshness and engagement tie-breakers
//
// The index is built from a candidate set in memory; with a few thousand recent stories this is
// milliseconds. Pure functions; the route decides what goes in.
import { CONCEPTS, OUTCOME_ALIASES, STAGE_ALIASES } from "./lexicon.js";
import { editDistance, normalize, similarity, stem, terms } from "./text.js";

export type SearchDoc = { id: string; title: string; body: string; company: string; companySlug: string; role: string; outcome: string; stage: string; createdAt: number; engagement: number };
export type ParsedQuery = { terms: string[]; phrases: string[]; exclude: string[]; company: string | null; outcome: string | null; stage: string | null; raw: string };
export type Hit = { id: string; score: number; matched: string[] };

export function parseQuery(q: string): ParsedQuery {
  let rest = q.slice(0, 200);
  const phrases: string[] = [];
  rest = rest.replace(/"([^"]{2,80})"/g, (_, p: string) => { phrases.push(normalize(p).trim()); return " "; });
  let company: string | null = null, outcome: string | null = null, stage: string | null = null;
  rest = rest.replace(/\b(company|at|outcome|round|stage):(\S+)/gi, (_, k: string, v: string) => {
    const key = k.toLowerCase(), val = normalize(v);
    if (key === "company" || key === "at") company = val;
    else if (key === "outcome") outcome = OUTCOME_ALIASES[val] ?? val;
    else stage = STAGE_ALIASES[val] ?? val;
    return " ";
  });
  const exclude: string[] = [];
  rest = rest.replace(/(?:^|\s)-(\w{2,})/g, (_, w: string) => { exclude.push(stem(normalize(w))); return " "; });
  return { terms: terms(rest), phrases, exclude, company, outcome, stage, raw: q };
}

// Concept lookup: every stemmed word or phrase → the stems of its whole group.
const CONCEPT_INDEX = (() => {
  const m = new Map<string, Set<string>>();
  for (const group of CONCEPTS) {
    const stems = new Set(group.flatMap((g) => terms(g)));
    for (const g of group) m.set(terms(g).join(" "), stems);
  }
  return m;
})();
// Synonyms learned from the stories themselves (automation.ts, PPMI): seed concept → extra stems.
let learned = new Map<string, { term: string; weight: number }[]>();
export function installLearnedConcepts(rows: { seed: string; term: string; weight: number }[]) {
  const m = new Map<string, { term: string; weight: number }[]>();
  for (const r of rows) (m.get(r.seed) ?? m.set(r.seed, []).get(r.seed)!).push({ term: r.term, weight: r.weight });
  learned = m;
}
const SEED_OF = (() => { const m = new Map<string, string>(); for (const g of CONCEPTS) for (const s of g) m.set(terms(s).join(" "), g[0]!); return m; })();

function expand(ts: string[]): Map<string, number> {
  // weight 1 for typed words, 0.45 for curated concept siblings, ≤ 0.35 for learned ones
  const out = new Map<string, number>(ts.map((t) => [t, 1]));
  for (let n = 3; n >= 1; n--) for (let i = 0; i + n <= ts.length; i++) {
    const key = ts.slice(i, i + n).join(" ");
    const g = CONCEPT_INDEX.get(key);
    if (g) for (const s of g) if (!out.has(s)) out.set(s, 0.45);
    const seed = SEED_OF.get(key);
    if (seed) for (const l of learned.get(seed) ?? []) if (!out.has(l.term)) out.set(l.term, l.weight);
  }
  return out;
}

type Field = "title" | "company" | "role" | "body";
const FIELD_W: Record<Field, number> = { title: 2.5, company: 3, role: 1.5, body: 1 };
const K1 = 1.2, B = 0.75;

export function search(docs: SearchDoc[], q: ParsedQuery, now = Date.now(), limit = 20): Hit[] {
  // Filters first.
  let pool = docs;
  if (q.outcome) pool = pool.filter((d) => d.outcome === q.outcome);
  if (q.stage) pool = pool.filter((d) => d.stage === q.stage);
  if (q.company) { const c = q.company; pool = pool.filter((d) => d.companySlug === c || normalize(d.company).includes(c) || similarity(d.company, c) > 0.45); }
  if (!pool.length) return [];

  // Tokenise fields once.
  const tok = pool.map((d) => ({ d, f: { title: terms(d.title), company: terms(d.company), role: terms(d.role), body: terms(d.body) } as Record<Field, string[]> }));
  if (q.exclude.length) for (let i = tok.length - 1; i >= 0; i--) if (q.exclude.some((x) => Object.values(tok[i]!.f).some((f) => f.includes(x)))) tok.splice(i, 1);
  const avgLen: Record<Field, number> = { title: 0, company: 0, role: 0, body: 0 };
  for (const t of tok) for (const f of Object.keys(FIELD_W) as Field[]) avgLen[f] += t.f[f].length / Math.max(1, tok.length);

  // Typo correction against the vocabulary (only for words the index doesn't contain).
  const vocab = new Map<string, number>();
  for (const t of tok) for (const f of Object.values(t.f)) for (const w of f) vocab.set(w, (vocab.get(w) ?? 0) + 1);
  const corrected = q.terms.map((w) => {
    if (vocab.has(w) || w.length < 4) return w;
    let best = w, bestD = w.length > 7 ? 3 : 2, bestN = 0;
    for (const [v, n] of vocab) {
      if (Math.abs(v.length - w.length) > 2 || v[0] !== w[0]) continue;
      const dist = editDistance(w, v, 2);
      if (dist < bestD || (dist === bestD && n > bestN)) { best = v; bestD = dist; bestN = n; }
    }
    return best;
  });
  const want = expand(corrected);
  if (!want.size && !q.phrases.length) {
    // Filter-only query: newest first.
    return tok.map((t) => ({ id: t.d.id, score: t.d.createdAt / 1e13, matched: [] })).sort((a, b) => b.score - a.score).slice(0, limit);
  }

  // Document frequency per term (any field).
  const df = new Map<string, number>();
  for (const w of want.keys()) df.set(w, tok.filter((t) => Object.values(t.f).some((f) => f.includes(w))).length);
  const N = tok.length;
  const idf = (w: string) => Math.log(1 + (N - (df.get(w) ?? 0) + 0.5) / ((df.get(w) ?? 0) + 0.5));

  const hits: Hit[] = [];
  for (const t of tok) {
    let score = 0;
    const matched: string[] = [];
    for (const [w, qw] of want) {
      // BM25F: field-weighted term frequency, length-normalised per field.
      let tf = 0;
      for (const f of Object.keys(FIELD_W) as Field[]) {
        const n = t.f[f].filter((x) => x === w).length;
        if (n) tf += FIELD_W[f] * n / (1 - B + B * (t.f[f].length / Math.max(1, avgLen[f])));
      }
      if (!tf) continue;
      score += qw * idf(w) * (tf * (K1 + 1)) / (tf + K1);
      if (qw === 1) matched.push(w);
    }
    // Company-name typo: "accentre" still lands Accenture's stories on top.
    if (!matched.length && q.terms.length) { const sim = similarity(t.d.company, q.raw); if (sim > 0.4) { score += sim * 6; matched.push(t.d.company); } }
    const text = normalize(`${t.d.title} ${t.d.body}`);
    for (const p of q.phrases) { if (text.includes(p)) { score += 4; matched.push(p); } else score -= 2; }
    if (score <= 0) continue;
    // Every typed word matched: a solid boost (AND beats OR).
    const typed = new Set(corrected);
    if (typed.size > 1 && [...typed].every((w) => Object.values(t.f).some((f) => f.includes(w)))) score *= 1.35;
    // Tie-breakers: fresher and more-engaged stories edge ahead.
    const ageDays = (now - t.d.createdAt) / 86400_000;
    score *= 1 + 0.15 * Math.pow(0.5, ageDays / 60) + 0.05 * Math.log1p(t.d.engagement) / Math.log1p(100);
    hits.push({ id: t.d.id, score, matched });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

// Companies: prefix, word-start and fuzzy matches on the name.
export function searchCompanies<T extends { name: string; slug: string }>(list: T[], q: string, limit = 5): T[] {
  const n = normalize(q).trim();
  if (n.length < 2) return [];
  return list.map((c) => {
    const name = normalize(c.name);
    const s = name.startsWith(n) ? 3 : name.split(/\s+/).some((w) => w.startsWith(n)) ? 2 : name.includes(n) ? 1.5 : similarity(name, n) > 0.35 ? similarity(name, n) : 0;
    return { c, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.c);
}
