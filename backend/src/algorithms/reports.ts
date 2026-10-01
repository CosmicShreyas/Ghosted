// Report triage: which reports a moderator should look at first, and when the platform should act
// on its own before anyone looks (Intermediary Rules 2021 expect quick action on clearly unlawful
// content; everything else waits for a human).
//
// priority (0–100) = severity of the reason
//                  × weight of evidence (distinct reporters, each weighted by trust, with
//                    diminishing returns so a pile-on of throwaways doesn't dominate)
//                  × what the automatic review already thinks of the content
//                  + urgency for fresh content that's still spreading
//
// Auto-hide (content hidden, pending review) only when the evidence is strong from several
// trustworthy people AND the content itself looks risky. One angry report never takes a story down.
import type { Review } from "./moderation.js";

export type ReportReason = "identifies_person" | "harassment" | "confidential" | "false_info" | "spam" | "off_topic" | "other";
const SEVERITY: Record<ReportReason, number> = { identifies_person: 1, harassment: 0.9, confidential: 0.8, false_info: 0.55, spam: 0.5, off_topic: 0.25, other: 0.35 };

export type ReportSignal = { reason: ReportReason; reporterTrust: number; detailsReview?: Review | null };
export type TriageInput = {
  reports: ReportSignal[];            // every open report on this item, including the new one
  contentReview: Review;              // reviewText() on the reported content itself
  ageHours: number;                   // how old the content is
  engagement: number;                 // relatable + chitchats, how far it has spread
  authorTrust: number;
};
export type Triage = { priority: number; autoHide: boolean; topReason: ReportReason; evidence: number };

export function triage(t: TriageInput): Triage {
  if (!t.reports.length) return { priority: 0, autoHide: false, topReason: "other", evidence: 0 };
  // Reports whose own note is abusive or spam count for less.
  const weight = (r: ReportSignal) => r.reporterTrust * (r.detailsReview?.decision === "block" ? 0.2 : r.detailsReview?.decision === "review" ? 0.6 : 1);
  const byReason = new Map<ReportReason, number>();
  for (const r of t.reports) byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + weight(r));
  const [topReason] = [...byReason.entries()].sort((a, b) => b[1] * SEVERITY[b[0]] - a[1] * SEVERITY[a[0]])[0]!;
  // Diminishing returns: 1 - e^(-x). One trusted report ≈ 0.45, three ≈ 0.85.
  const mass = t.reports.reduce((n, r) => n + weight(r), 0);
  const evidence = 1 - Math.exp(-mass / 1.2);
  const content = Math.max(0.15, t.contentReview.score);
  const urgency = t.ageHours < 24 ? Math.min(1, Math.log1p(t.engagement) / Math.log1p(50)) * 0.15 : 0;
  const authorDiscount = 1 - Math.max(0, t.authorTrust - 0.6) * 0.5; // long-trusted authors get a little benefit of the doubt
  const raw = SEVERITY[topReason] * (0.35 + 0.65 * evidence) * (0.4 + 0.6 * content) * authorDiscount + urgency;
  const priority = Math.round(Math.min(1, raw) * 100);
  const distinctTrusted = t.reports.filter((r) => r.reporterTrust >= 0.5).length;
  const autoHide = (SEVERITY[topReason] >= 0.8 && distinctTrusted >= 3 && content >= 0.35) || (t.contentReview.decision === "block" && distinctTrusted >= 1);
  return { priority, autoHide, topReason, evidence: Math.round(evidence * 100) / 100 };
}
