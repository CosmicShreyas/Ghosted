// Statistics behind every chart and number, chosen so small or messy samples don't mislead:
//
//   median / quantile     for waits (skewed: a few 200-day waits would wreck an average)
//   winsorize             trims typos and extremes (a "700 days waited" entry) before averaging
//   wilson                a rate's honest lower/upper bound, so 2 of 2 isn't shown as "100%"
//   bayesAverage          shrinks small samples toward the platform mean (fair company scores)
//   theilSen              a trend slope that ignores outliers, to say "rising" or "falling"
//   changeIsReal          two-proportion z-test: is this week's rate really different, or noise?
//   minGroup              k-anonymity: groups smaller than k are never shown
//   bucketFor             day / week / month grouping for a period's length

export function quantile(xs: number[], q: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo); // linear interpolation (Hyndman–Fan type 7)
}
export const median = (xs: number[]) => { const m = quantile(xs, 0.5); return m == null ? null : Math.round(m); };

// Clamps values outside [Q1 − k·IQR, Q3 + k·IQR] (Tukey fences) instead of dropping them.
export function winsorize(xs: number[], k = 3): number[] {
  if (xs.length < 8) return xs;
  const q1 = quantile(xs, 0.25)!, q3 = quantile(xs, 0.75)!, iqr = q3 - q1;
  const lo = q1 - k * iqr, hi = q3 + k * iqr;
  return xs.map((x) => Math.min(hi, Math.max(lo, x)));
}
export function robustMean(xs: number[]): number | null {
  if (!xs.length) return null;
  const w = winsorize(xs);
  return Math.round(w.reduce((a, b) => a + b, 0) / w.length);
}

// Wilson score interval for a proportion (95% by default).
export function wilson(successes: number, n: number, z = 1.96): { low: number; high: number; p: number } {
  if (n <= 0) return { low: 0, high: 0, p: 0 };
  const p = successes / n, z2 = z * z;
  const centre = p + z2 / (2 * n), spread = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return { low: Math.max(0, (centre - spread) / (1 + z2 / n)), high: Math.min(1, (centre + spread) / (1 + z2 / n)), p };
}

// (C·m + Σx) / (C + n): with few stories the score sits near the prior m; with many, near the data.
export function bayesAverage(sum: number, n: number, prior: number, strength = 5): number {
  return (strength * prior + sum) / (strength + n);
}

// Median of pairwise slopes: robust to outliers, needs ≥ 3 points. Units: y per x step.
export function theilSen(ys: number[]): number {
  if (ys.length < 3) return 0;
  const slopes: number[] = [];
  for (let i = 0; i < ys.length; i++) for (let j = i + 1; j < ys.length; j++) slopes.push((ys[j]! - ys[i]!) / (j - i));
  return quantile(slopes, 0.5) ?? 0;
}
export function trendDirection(ys: number[]): "rising" | "falling" | "flat" {
  const slope = theilSen(ys);
  const scale = Math.max(1, (ys.reduce((a, b) => a + b, 0) / Math.max(1, ys.length)));
  return Math.abs(slope) / scale < 0.03 ? "flat" : slope > 0 ? "rising" : "falling";
}

// Two-proportion z-test. True when the difference between x1/n1 and x2/n2 is unlikely to be chance
// (|z| > 1.96, about 95%). Small samples are never called significant.
export function changeIsReal(x1: number, n1: number, x2: number, n2: number): boolean {
  if (n1 < 20 || n2 < 20) return false;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (se === 0) return false;
  return Math.abs(x1 / n1 - x2 / n2) / se > 1.96;
}

// k-anonymity: a breakdown only shows groups with at least k stories.
export const MIN_GROUP = 5;
export const MIN_COMPANY = 3;
export const minGroup = <T extends { stories: number }>(groups: T[], k = MIN_GROUP) => groups.filter((g) => g.stories >= k);

export type Bucket = "day" | "week" | "month";
export const bucketFor = (lengthDays: number): Bucket => (lengthDays <= 31 ? "day" : lengthDays <= 183 ? "week" : "month");

// Pay ranges: a role's range is the 10th–90th percentile of reported min/max (not the absolute
// extremes, which one typo can stretch), and its median is the median of midpoints.
export function salaryBand(mins: number[], maxs: number[]) {
  const mids = mins.map((m, i) => (m + (maxs[i] ?? m)) / 2);
  return {
    range: [Math.round(quantile(mins, mins.length >= 5 ? 0.1 : 0) ?? 0), Math.round(quantile(maxs, maxs.length >= 5 ? 0.9 : 1) ?? 0)] as [number, number],
    median: Math.round(quantile(mids, 0.5) ?? 0),
  };
}
