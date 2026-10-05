// Aggregates that are safe to show a company: thresholds that keep any single candidate from being
// picked out. Pure functions (no database), so they're easy to test.
//
//   MIN_STORIES   a metric appears only when it's based on at least this many stories
//   MIN_BUCKET    any group (an outcome, a stage, a month) with fewer than this is hidden, not shown
//                 as a small number
//   MIN_ASKS      "N candidates asked {company} to respond" appears only from this many
export const MIN_STORIES = 5;
export const MIN_BUCKET = 3;
export const MIN_ASKS = 3;

export function median(values: number[]): number | null {
  const v = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : Math.round(((v[mid - 1]! + v[mid]!) / 2) * 10) / 10;
}

// Counts per key, keeping only groups of at least MIN_BUCKET; `hidden` says how many stories sat in
// groups too small to show (so totals still add up honestly without revealing them).
export function buckets<K extends string>(keys: K[], min = MIN_BUCKET) {
  const counts = new Map<K, number>();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  const shown = [...counts].filter(([, n]) => n >= min).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
  const hidden = keys.length - shown.reduce((n, b) => n + b.count, 0);
  return { shown, hidden };
}

// A public count with a floor: null below `min`, so "1 person asked" can never point at someone.
export const floorCount = (n: number, min = MIN_ASKS) => (n >= min ? n : null);

// Monthly averages for the last `months` months (oldest first); months with fewer than MIN_BUCKET
// values are null.
export function monthlyAverage(points: { at: string; value: number | null }[], months = 6, now = new Date(), min = MIN_BUCKET) {
  const out: { month: string; value: number | null; n: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = d.toISOString().slice(0, 7);
    const vals = points.filter((p) => p.at.slice(0, 7) === key && p.value != null).map((p) => p.value!);
    out.push({ month: key, n: vals.length, value: vals.length >= min ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null });
  }
  return out;
}
