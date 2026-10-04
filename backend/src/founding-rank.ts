// The Founding 50 ranking itself, kept free of the database so it can be tested
// (tests/unit/founding.test.ts). Rows come oldest first; each author counts once, from their
// first published story; bots never count; only the first `limit` authors get a rank.
export type FounderRow = { author: { public_id: number | string; kind?: string | null } | null };

export function rankFounders(rows: FounderRow[], limit: number) {
  const ranks = new Map<number, number>();
  const seen = new Set<number>();
  for (const r of rows) {
    const a = r.author;
    if (!a || a.kind === "bot" || seen.has(Number(a.public_id))) continue;
    seen.add(Number(a.public_id));
    if (ranks.size < limit) ranks.set(Number(a.public_id), ranks.size + 1);
  }
  return { ranks, contributors: seen.size };
}
