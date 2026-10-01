// Glue between the routes and the moderation algorithms (src/algorithms): gathers the inputs they
// need from the database (trust, recent posts, open reports) and applies their decisions.
import { reviewText, trustScore, triage, ANONYMOUS_TRUST, type ContentKind, type Review, type ReportReason } from "./algorithms/index.js";
import { ApiError } from "./errors.js";
import { loadLive } from "./automation.js";
import { fromBytea } from "./lib/compression.js";
import type { Profile } from "./security.js";
import { admin } from "./supabase.js";

// Trust from the account's track record. Cheap: two count queries.
// How their past reports ended (set by the automation sweep) teaches trust who reports accurately.
export async function trustOf(p: Pick<Profile, "id" | "created_at" | "mfa_method">): Promise<number> {
  const n = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0);
  const [kept, removed, upS, upC, noS, noC] = await Promise.all([
    n(admin().from("stories").select("id", { count: "exact", head: true }).eq("author_id", p.id).eq("status", "published")),
    n(admin().from("stories").select("id", { count: "exact", head: true }).eq("author_id", p.id).eq("status", "hidden")),
    n(admin().from("reports").select("id", { count: "exact", head: true }).eq("reporter_id", p.id).eq("outcome", "upheld")),
    n(admin().from("comment_reports").select("id", { count: "exact", head: true }).eq("reporter_id", p.id).eq("outcome", "upheld")),
    n(admin().from("reports").select("id", { count: "exact", head: true }).eq("reporter_id", p.id).eq("outcome", "dismissed")),
    n(admin().from("comment_reports").select("id", { count: "exact", head: true }).eq("reporter_id", p.id).eq("outcome", "dismissed")),
  ]);
  return trustScore({
    accountAgeDays: (Date.now() - new Date(p.created_at).getTime()) / 86400_000,
    storiesKept: kept, storiesRemoved: removed, reportsUpheld: upS + upC, reportsRejected: noS + noC,
    verifiedEmail: true, twoFactor: p.mfa_method !== "none",
  });
}

async function recentTexts(p: Pick<Profile, "id">, kind: ContentKind): Promise<string[]> {
  const table = kind === "story" ? "stories" : "comments";
  const { data } = await admin().from(table).select("body_z").eq("author_id", p.id).order("created_at", { ascending: false }).limit(kind === "story" ? 3 : 6);
  return ((data ?? []) as { body_z: string }[]).map((r) => { try { return fromBytea(r.body_z); } catch { return ""; } }).filter(Boolean);
}

export async function reviewContent(p: Pick<Profile, "id" | "created_at" | "mfa_method">, kind: ContentKind, text: string, companyName?: string): Promise<Review> {
  const [trust, recent] = await Promise.all([trustOf(p), recentTexts(p, kind), loadLive()]);
  return reviewText(text, { kind, recent, trust, ...(companyName && { companyName }) });
}

// Throws the author-facing error for blocked content.
export function refuseIfBlocked(r: Review, field = "body") {
  if (r.decision === "block") throw new ApiError(422, "moderation_blocked", r.message ?? "This can't be published.", { [field]: r.message ?? "This can't be published." });
}

// What we keep about the review: no raw text, only reasons and a masked excerpt.
export const moderationRecord = (r: Review) => ({ decision: r.decision, score: r.score, reasons: r.reasons.map((x) => ({ code: x.code, detail: x.detail })), excerpt: r.excerpt, selfHarm: r.selfHarm, at: new Date().toISOString() });

// Re-scores every open report on one story or chitchat and hides it (pending) when triage says so.
export async function triageReports(target: { kind: "story" | "comment"; id: string; text: string; createdAt: string; engagement: number; authorId: string }) {
  const table = target.kind === "story" ? "reports" : "comment_reports";
  const col = target.kind === "story" ? "story_id" : "comment_id";
  const { data: open } = await admin().from(table).select("id, reason, details, reporter_id").eq(col, target.id).eq("resolved", false).limit(200);
  const rows = (open ?? []) as { id: string; reason: ReportReason; details: string | null; reporter_id: string | null }[];
  if (!rows.length) return;
  const reporterIds = [...new Set(rows.map((r) => r.reporter_id).filter((x): x is string => !!x))];
  const { data: people } = reporterIds.length ? await admin().from("profiles").select("id, created_at, mfa_method").in("id", reporterIds) : { data: [] };
  const trust = new Map<string, number>();
  await Promise.all(((people ?? []) as Pick<Profile, "id" | "created_at" | "mfa_method">[]).map(async (p) => trust.set(p.id, await trustOf(p))));
  const { data: author } = await admin().from("profiles").select("id, created_at, mfa_method").eq("id", target.authorId).maybeSingle();
  // One vote per reporter (their strongest reason): repeat reports by the same person don't stack.
  const seen = new Set<string>();
  const signals = rows.filter((r) => !r.reporter_id || (!seen.has(r.reporter_id) && seen.add(r.reporter_id))).map((r) => ({
    reason: r.reason, reporterTrust: r.reporter_id ? trust.get(r.reporter_id) ?? ANONYMOUS_TRUST : ANONYMOUS_TRUST,
    detailsReview: r.details ? reviewText(r.details, { kind: "report" }) : null,
  }));
  const t = triage({
    reports: signals, contentReview: reviewText(target.text, { kind: target.kind === "story" ? "story" : "chitchat" }),
    ageHours: (Date.now() - new Date(target.createdAt).getTime()) / 3600_000, engagement: target.engagement,
    authorTrust: author ? await trustOf(author as Pick<Profile, "id" | "created_at" | "mfa_method">) : 0.6,
  });
  await admin().from(table).update({ priority: t.priority, auto_hidden: t.autoHide }).in("id", rows.map((r) => r.id));
  if (t.autoHide) await admin().from(target.kind === "story" ? "stories" : "comments").update({ status: "pending" }).eq("id", target.id).eq("status", "published");
  return t;
}
