// What happens to held ("pending") content without anyone touching it. Run by the automation sweep:
// every held item is re-reviewed with today's word lists and decided by these rules.
//
// Held by the automatic review:
//   now passes                                     publish
//   now blocked (lists grew)                       remove, tell the author why
//   only a named individual                        hide the name ("[name]"), publish, tell the author
//   self-harm language (nothing else)              publish after 6 h; the author already got the helpline
//   accusation stated as fact                      ask the author to rephrase; remove after 72 h if unchanged
//   spam, links, duplicates, gibberish             remove after 24 h, unless the author is well trusted
//   insults aimed at a person, sexual abuse        remove after 24 h
//   anything else, low risk after 12 h             publish
//
// Hidden because of reports (auto_hidden):
//   re-triaged; weak evidence                      restore, dismiss the reports
//   strong evidence or content now blocked         take down (hidden), uphold the reports
//   in between                                     wait up to 72 h for more signal, then restore
import type { Review, ReasonCode } from "./moderation.js";

export type PendingAction = "publish" | "redact_publish" | "remove" | "ask_rephrase" | "wait";
export type PendingInput = { review: Review; ageHours: number; authorTrust: number; askedToRephrase: boolean };

const SPAMMY: ReasonCode[] = ["spam", "links", "duplicate", "gibberish"];
const ABUSIVE: ReasonCode[] = ["targeted_abuse", "sexual_abuse"];

export function decidePending({ review, ageHours, authorTrust, askedToRephrase }: PendingInput): PendingAction {
  const codes = new Set(review.reasons.map((r) => r.code));
  const only = (...allowed: ReasonCode[]) => [...codes].every((c) => allowed.includes(c) || c === "too_short" || c === "profanity" || c === "shouting");
  if (review.decision === "block") return "remove";
  if (review.decision === "allow") return "publish";
  if (codes.has("pii") && only("pii")) return "redact_publish";
  if (codes.has("self_harm") && only("self_harm")) return ageHours >= 6 ? "publish" : "wait";
  if (codes.has("defamation_risk")) return !askedToRephrase ? "ask_rephrase" : ageHours >= 72 ? "remove" : "wait";
  if (ABUSIVE.some((c) => codes.has(c))) return ageHours >= 24 ? "remove" : "wait";
  if (SPAMMY.some((c) => codes.has(c))) return authorTrust >= 0.8 ? "publish" : ageHours >= 24 ? "remove" : "wait";
  return ageHours >= 12 && review.score < 0.6 ? "publish" : ageHours >= 72 ? "remove" : "wait";
}

export type HiddenAction = "restore" | "take_down" | "wait";
export function decideHidden({ priority, contentBlocked, ageHours }: { priority: number; contentBlocked: boolean; ageHours: number }): HiddenAction {
  if (contentBlocked || priority >= 70) return "take_down";
  if (priority < 40) return "restore";
  return ageHours >= 72 ? "restore" : "wait";
}

// Reports nobody acted on: weak, old ones are dismissed so the queue never grows forever.
export const staleReport = ({ priority, ageDays }: { priority: number; ageDays: number }) => (priority < 30 && ageDays >= 14) || ageDays >= 60;
