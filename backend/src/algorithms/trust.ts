// How much weight a person's reports and signals carry, from their track record. A Beta-Bernoulli
// posterior: every upheld report or kept story counts as a success, every rejected report or
// removed story as a failure, starting from a mildly positive prior (new people are trusted, a
// little). Account age adds confidence slowly. Result: 0 (ignore) … 1 (very reliable).
//
// This never punishes anyone publicly; it only decides how fast the queue reacts to them.

export type TrustInput = {
  accountAgeDays: number;
  storiesKept: number;      // published and never removed by moderators
  storiesRemoved: number;   // taken down by moderators
  reportsUpheld: number;    // their reports that moderators acted on
  reportsRejected: number;  // their reports that were dismissed
  verifiedEmail?: boolean;
  twoFactor?: boolean;
};

const PRIOR_A = 3, PRIOR_B = 2; // prior mean 0.6

export function trustScore(t: TrustInput): number {
  const a = PRIOR_A + t.storiesKept * 0.5 + t.reportsUpheld * 2;
  const b = PRIOR_B + t.storiesRemoved * 3 + t.reportsRejected * 1;
  const mean = a / (a + b);
  // Brand-new accounts are capped (throwaways shouldn't be able to take things down fast).
  const age = Math.min(1, Math.log1p(Math.max(0, t.accountAgeDays)) / Math.log1p(90));
  const cap = 0.35 + 0.65 * age;
  const bonus = (t.verifiedEmail ? 0.03 : 0) + (t.twoFactor ? 0.05 : 0);
  return Math.max(0, Math.min(1, Math.min(mean, cap) + bonus));
}

// Anonymous reporters (signed out) get a fixed, low weight.
export const ANONYMOUS_TRUST = 0.2;
