// Everything that keeps moderation and search up to date without anyone doing it by hand. Runs daily
// from Vercel Cron (/v1/cron/automation), and the queue sweep also runs at most every 15 minutes
// after new posts and reports (kickSweep), so held content never waits a day.
//
//   refreshLists   download the open word lists, map them to tiers, upsert; retire what a source dropped
//   learn          from the platform: normal words (allow-list), wording typical of removed posts
//                  (watch tier), new disguised spellings, search synonyms
//   sweep          decide every held or report-hidden item (algorithms/queue.ts), notify authors,
//                  close stale reports; report outcomes feed reporter trust
//   loadLive       installs the live list into the moderation and search algorithms (10-minute cache)
import {
  commonWords, decideHidden, decidePending, discriminativeTerms, installLearnedConcepts, installLexicon, learnConcepts, NEVER_FLAG, obfuscatedVariants,
  parseDsojevic, parseLdnoobw, reviewText, SOURCES, staleReport, type Doc, type ImportedTerm, type LiveTerm,
} from "./algorithms/index.js";
import { CONCEPTS } from "./algorithms/lexicon.js";
import { findPii } from "./algorithms/pii.js";
import { fromBytea, toBytea } from "./lib/compression.js";
import { bump } from "./live.js";
import { act, dailyGoofy, strike, tell } from "./goofy/index.js";
import { admin } from "./supabase.js";
import { trustOf, triageReports } from "./moderation.js";
import type { Profile } from "./security.js";
import { goofyControls } from "./platform.js";
import { sweepWaiting } from "./interest.js";
import { nudgeQuietApplications, remindFollowups } from "./nudges.js";
import { remindStreaks } from "./levels.js";

const DAY = 86400_000;
const text = (z: string | null) => { if (!z) return ""; try { return fromBytea(z); } catch { return ""; } };
async function record(job: string, stats: Record<string, unknown>) {
  await admin().from("automation_runs").upsert({ job, last_run: new Date().toISOString(), stats }, { onConflict: "job" });
}

// ---------- the live list ----------

let loadedAt = 0;
let loading: Promise<void> | null = null;
export async function loadLive(force = false) {
  if (!force && Date.now() - loadedAt < 10 * 60_000) return;
  loading ??= (async () => {
    try {
      const [terms, allow, concepts] = await Promise.all([
        admin().from("moderation_terms").select("term, tier, weight, pattern, exceptions").eq("status", "active").limit(20000),
        admin().from("moderation_allow").select("term").limit(50000),
        admin().from("search_concepts").select("seed, term, weight").limit(5000),
      ]);
      if (terms.error) { console.error("[automation] load (run supabase/init_database.sql on a fresh project)", terms.error.message); return; }
      installLexicon((terms.data ?? []) as LiveTerm[], [...NEVER_FLAG, ...((allow.data ?? []) as { term: string }[]).map((r) => r.term)]);
      installLearnedConcepts((concepts.data ?? []) as { seed: string; term: string; weight: number }[]);
      loadedAt = Date.now();
    } finally { loading = null; }
  })();
  await loading;
}

// ---------- 1. open word lists ----------

async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { "user-agent": "GhostedModeration/1.0 (+https://ghosted.app)" } });
    if (!r.ok) return null;
    const t = await r.text();
    return t.length > 3_000_000 ? null : t;
  } catch { return null; }
}

export async function refreshLists() {
  const stats: Record<string, number | string> = {};
  const parsers: [keyof typeof SOURCES, (t: string) => ImportedTerm[]][] = [
    ["dsojevic", (t) => { try { return parseDsojevic(JSON.parse(t)); } catch { return []; } }],
    ["ldnoobw_en", (t) => parseLdnoobw(t, "en")],
    ["ldnoobw_hi", (t) => parseLdnoobw(t, "hi")],
  ];
  for (const [source, parse] of parsers) {
    const raw = await fetchText(SOURCES[source]);
    const terms = raw ? parse(raw) : [];
    // A failed or suspiciously small download never wipes what we have.
    if (terms.length < 30) { stats[source] = raw ? `skipped: only ${terms.length} terms` : "download failed"; continue; }
    const now = new Date().toISOString();
    // Learned/variant rows win over imports for the same term (they're specific to Ghosted).
    const { data: mine } = await admin().from("moderation_terms").select("term").in("source", ["learned", "variant"]).in("term", terms.map((t) => t.term).slice(0, 5000));
    const skip = new Set(((mine ?? []) as { term: string }[]).map((r) => r.term));
    const rows = terms.filter((t) => !skip.has(t.term)).map((t) => ({ ...t, status: "active", updated_at: now }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin().from("moderation_terms").upsert(rows.slice(i, i + 500), { onConflict: "term" });
      if (error) { stats[source] = `error: ${error.message}`; break; }
    }
    // Anything this source no longer lists is retired (not deleted, so history stays explainable).
    await admin().from("moderation_terms").update({ status: "retired", updated_at: now }).eq("source", source).eq("status", "active").lt("updated_at", now);
    stats[source] ??= rows.length;
  }
  await record("refresh_lists", stats);
  return stats;
}

// ---------- 2. learning from the platform ----------

async function corpus() {
  const since = new Date(Date.now() - 365 * DAY).toISOString(), settled = new Date(Date.now() - 7 * DAY).toISOString();
  const [good, reported, badStories, autoComments, upheldComments] = await Promise.all([
    admin().from("stories").select("id, author_id, title, body_z").eq("status", "published").gte("created_at", since).lte("created_at", settled).order("created_at", { ascending: false }).limit(3000),
    admin().from("reports").select("story_id").limit(20000),
    admin().from("stories").select("id, author_id, title, body_z").eq("status", "hidden").limit(1500),
    admin().from("comments").select("id, author_id, body_z").eq("status", "removed").eq("moderation->>autoRemoved", "true").limit(1500),
    admin().from("comment_reports").select("comment:comments(id, author_id, body_z)").eq("outcome", "upheld").limit(1500),
  ]);
  const reportedIds = new Set(((reported.data ?? []) as { story_id: string }[]).map((r) => r.story_id));
  type S = { id: string; author_id: string; title?: string; body_z: string };
  const goodDocs: Doc[] = ((good.data ?? []) as S[]).filter((s) => !reportedIds.has(s.id)).map((s) => ({ text: `${s.title ?? ""}\n${text(s.body_z)}`, author: s.author_id }));
  const badDocs: Doc[] = [
    ...((badStories.data ?? []) as S[]).map((s) => ({ text: `${s.title ?? ""}\n${text(s.body_z)}`, author: s.author_id })),
    ...((autoComments.data ?? []) as S[]).map((s) => ({ text: text(s.body_z), author: s.author_id })),
    ...((upheldComments.data ?? []) as unknown as { comment: S | null }[]).filter((r) => r.comment).map((r) => ({ text: text(r.comment!.body_z), author: r.comment!.author_id })),
  ];
  return { goodDocs, badDocs };
}

export async function learn() {
  const { goodDocs, badDocs } = await corpus();
  const now = new Date().toISOString();
  // a) Normal vocabulary on Ghosted: never flaggable by imported or learned terms.
  const common = commonWords(goodDocs);
  for (let i = 0; i < common.length; i += 500) await admin().from("moderation_allow").upsert(common.slice(i, i + 500).map((term) => ({ term, reason: "common in clean stories" })), { onConflict: "term", ignoreDuplicates: true });
  const allow = new Set([...NEVER_FLAG, ...common]);

  // b) Wording typical of removed content → "watch" (can hold for review, never block).
  const learnedTerms = discriminativeTerms(badDocs, goodDocs).filter((t) => !allow.has(t.term));
  const { data: existing } = await admin().from("moderation_terms").select("term, source").in("term", learnedTerms.map((t) => t.term));
  const taken = new Set(((existing ?? []) as { term: string; source: string }[]).filter((r) => r.source !== "learned").map((r) => r.term));
  const learnedRows = learnedTerms.filter((t) => !taken.has(t.term)).map((t) => ({ term: t.term, tier: "watch", source: "learned", weight: Math.min(1, t.z / 8), pattern: false, exceptions: [], status: "active", evidence: t, updated_at: now }));
  if (learnedRows.length) await admin().from("moderation_terms").upsert(learnedRows, { onConflict: "term" });
  // Learned terms that stopped standing out for 30 days are retired.
  await admin().from("moderation_terms").update({ status: "retired" }).eq("source", "learned").eq("status", "active").lt("updated_at", new Date(Date.now() - 30 * DAY).toISOString());

  // c) New disguised spellings of known terms, from removed and reported content.
  const { data: knownRows } = await admin().from("moderation_terms").select("term, tier").eq("status", "active").neq("tier", "watch").eq("pattern", false).limit(20000);
  const known = new Map(((knownRows ?? []) as { term: string; tier: string }[]).map((r) => [r.term, r.tier]));
  const variants = obfuscatedVariants(badDocs.map((d) => d.text), known).filter((v) => !allow.has(v.variant));
  // A variant of a slur holds for review rather than blocking outright (it was learned, not curated).
  if (variants.length) await admin().from("moderation_terms").upsert(variants.map((v) => ({ term: v.variant, tier: v.tier === "slur" ? "severe" : v.tier, source: "variant", weight: 0.8, pattern: false, exceptions: [], status: "active", evidence: { of: v.of }, updated_at: now })), { onConflict: "term", ignoreDuplicates: true });

  // d) Search synonyms from co-occurrence.
  const concepts = learnConcepts(goodDocs.map((d) => d.text), CONCEPTS);
  if (concepts.length) {
    await admin().from("search_concepts").delete().lt("updated_at", now);
    await admin().from("search_concepts").upsert(concepts.map((c) => ({ ...c, updated_at: now })), { onConflict: "seed,term" });
  }
  const stats = { goodDocs: goodDocs.length, badDocs: badDocs.length, allowAdded: common.length, learned: learnedRows.length, variants: variants.length, concepts: concepts.length };
  await record("learn", stats);
  await loadLive(true);
  return stats;
}

// ---------- 3. the queue ----------

type Pending = { id: string; public_id: number; author_id: string; created_at: string; moderation: Record<string, unknown> | null; title?: string; body_z: string; company?: { name: string } | null; story?: { public_id: number } | null };
const hours = (iso: string) => (Date.now() - new Date(iso).getTime()) / 3600_000;
const redactNames = (s: string) => { let out = s; for (const h of findPii(s).filter((x) => x.kind === "person").reverse()) out = out.slice(0, h.index) + h.text.replace(/[A-Z][a-z]+(\s+[A-Z][a-z]+)?$/, "[name]") + out.slice(h.index + h.text.length); return out; };

async function settleReports(table: "reports" | "comment_reports", col: "story_id" | "comment_id", id: string, outcome: "upheld" | "dismissed") {
  await admin().from(table).update({ resolved: true, outcome, resolved_at: new Date().toISOString() }).eq(col, id).eq("resolved", false);
}

export async function sweep() {
  const controls = await goofyControls();
  if (!controls.enabled || !controls.queueSweep) return { published: 0, redacted: 0, removed: 0, asked: 0, restored: 0, takenDown: 0, waiting: 0, staleReports: 0, disabled: true };
  await loadLive();
  const stats = { published: 0, redacted: 0, removed: 0, asked: 0, restored: 0, takenDown: 0, waiting: 0, staleReports: 0 };
  for (const kind of ["story", "comment"] as const) {
    const table = kind === "story" ? "stories" : "comments";
    const cols = kind === "story" ? "id, public_id, author_id, created_at, moderation, title, body_z, company:companies(name)" : "id, public_id, author_id, created_at, moderation, body_z, story:stories(public_id)";
    const { data } = await admin().from(table).select(cols).eq("status", "pending").order("created_at").limit(200);
    for (const row of (data ?? []) as unknown as Pending[]) {
      const body = text(row.body_z);
      const full = kind === "story" ? `${row.title ?? ""}\n${body}` : body;
      const storyRef = kind === "story" ? row.public_id : row.story?.public_id;
      const reportsTable = kind === "story" ? "reports" : "comment_reports", col = kind === "story" ? "story_id" : "comment_id";
      const { data: hiddenBy } = await admin().from(reportsTable).select("id").eq(col, row.id).eq("auto_hidden", true).eq("resolved", false).limit(1);
      const { data: author } = await admin().from("profiles").select("id, created_at, mfa_method").eq("id", row.author_id).maybeSingle();
      const trust = author ? await trustOf(author as Pick<Profile, "id" | "created_at" | "mfa_method">) : 0.5;
      const review = reviewText(full, { kind: kind === "story" ? "story" : "chitchat", trust, ...(row.company?.name && { companyName: row.company.name }) });
      const set = (patch: Record<string, unknown>) => admin().from(table).update({ ...patch, moderation: { ...(row.moderation ?? {}), ...((patch["moderation"] as object) ?? {}), sweptAt: new Date().toISOString() } }).eq("id", row.id);

      if (hiddenBy?.length) {
        // Hidden because of reports: re-triage with everything known now.
        const t = await triageReports({ kind: kind === "story" ? "story" : "comment", id: row.id, text: full, createdAt: row.created_at, engagement: 0, authorId: row.author_id });
        const action = decideHidden({ priority: t?.priority ?? 0, contentBlocked: review.decision === "block", ageHours: hours(row.created_at) });
        const w = kind === "story" ? "story" : "chitchat";
        if (action === "restore") {
          await set({ status: "published" }); await settleReports(reportsTable, col, row.id, "dismissed");
          await tell(row.author_id, "restored", { what: w }, storyRef); await act("restored", { targetKind: w, storyPublicId: kind === "story" ? row.public_id : storyRef ?? null, reason: "reports didn't hold up" });
          stats.restored++;
        } else if (action === "take_down") {
          await set({ status: kind === "story" ? "hidden" : "removed", moderation: { autoRemoved: true, by: "goofy" } });
          await settleReports(reportsTable, col, row.id, "upheld");
          const reason = review.reasons[0]?.detail ?? "breaking the community guidelines";
          await tell(row.author_id, "took_down", { what: w, reason }); await act("took_down", { targetKind: w, userId: row.author_id, reason }); await strike(row.author_id);
          stats.takenDown++;
        } else stats.waiting++;
        continue;
      }

      const action = decidePending({ review, ageHours: hours(row.created_at), authorTrust: trust, askedToRephrase: !!row.moderation?.["askedAt"] });
      const w = kind === "story" ? "story" : "chitchat";
      const ref = kind === "story" ? row.public_id : storyRef ?? null;
      if (action === "publish") {
        await set({ status: "published" });
        await tell(row.author_id, "released", { what: w }, storyRef); await act("released", { targetKind: w, storyPublicId: ref, reason: "passed the check" });
        stats.published++;
      } else if (action === "redact_publish" && controls.redactNames) {
        const patch: Record<string, unknown> = { status: "published", body_z: toBytea(redactNames(body)), moderation: { redactedBy: "goofy" } };
        if (kind === "story") patch["title"] = redactNames(row.title ?? "").slice(0, 90);
        await set(patch);
        await tell(row.author_id, "redacted", { what: w }, storyRef); await act("redacted", { targetKind: w, storyPublicId: ref, reason: "hid a person's name" });
        stats.redacted++;
      } else if (action === "remove") {
        await set({ status: kind === "story" ? "hidden" : "removed", moderation: { autoRemoved: true, by: "goofy" } });
        const reason = review.reasons[0]?.detail ?? "not passing the check";
        await tell(row.author_id, "removed", { what: w, reason }); await act(kind === "story" ? "removed_story" : "removed_chitchat", { targetKind: w, userId: row.author_id, reason }); await strike(row.author_id);
        stats.removed++;
      } else if (action === "ask_rephrase") {
        await set({ moderation: { askedAt: new Date().toISOString() } });
        await tell(row.author_id, "asked_rephrase", { what: w }, storyRef); await act("asked_rephrase", { targetKind: w, reason: "accusation stated as fact" });
        stats.asked++;
      } else stats.waiting++;
    }
  }
  // Stale, weak reports on content that stayed up are dismissed.
  for (const table of ["reports", "comment_reports"] as const) {
    const { data } = await admin().from(table).select("id, priority, created_at").eq("resolved", false).limit(2000);
    const stale = ((data ?? []) as { id: string; priority: number; created_at: string }[]).filter((r) => staleReport({ priority: r.priority, ageDays: hours(r.created_at) / 24 })).map((r) => r.id);
    if (stale.length) { await admin().from(table).update({ resolved: true, outcome: "dismissed", resolved_at: new Date().toISOString() }).in("id", stale); stats.staleReports += stale.length; }
  }
  if (stats.staleReports) await act("dismissed_reports", { targetKind: "system", reason: `${stats.staleReports} stale reports closed` });
  if (stats.published || stats.redacted || stats.restored || stats.takenDown) await bump({ shared: ["feed"] });
  await record("sweep", stats);
  return stats;
}

// After new posts and reports: sweep at most every 15 minutes (per instance, and across instances
// via automation_runs).
let lastKick = 0;
export async function kickSweep() {
  const controls = await goofyControls(); if (!controls.enabled || !controls.queueSweep) return;
  if (Date.now() - lastKick < 15 * 60_000) return;
  lastKick = Date.now();
  const { data } = await admin().from("automation_runs").select("last_run").eq("job", "sweep").maybeSingle();
  if (data && Date.now() - new Date((data as { last_run: string }).last_run).getTime() < 15 * 60_000) return;
  await sweep();
  await sweepWaiting(); // a story the sweep just released may be a company's first
}

export async function runAll() {
  const controls = await goofyControls();
  const lists = controls.enabled && controls.refreshWordLists ? await refreshLists().catch((e: Error) => ({ error: e.message })) : { disabled: true };
  const learned = controls.enabled && controls.learnFromOutcomes ? await learn().catch((e: Error) => ({ error: e.message })) : { disabled: true };
  const swept = await sweep().catch((e: Error) => ({ error: e.message }));
  const goofyRun = await dailyGoofy().catch((e: Error) => ({ error: e.message }));
  // Stories that went live another way (released by Goofy, approved by an admin): tell anyone waiting.
  const waiting = await sweepWaiting().catch((e: Error) => ({ error: e.message }));
  // Tracked applications that went quiet: one gentle "share what happened" per application.
  const nudged = await nudgeQuietApplications().catch((e: Error) => ({ error: e.message }));
  // Day 7 and day 14 "time for a polite follow-up" pushes (skipped in quiet hours).
  const reminded = await remindFollowups().catch((e: Error) => ({ error: e.message }));
  // Streaks of 3+ days: a morning nudge to keep them going (levels.ts).
  const streaks = await remindStreaks().catch((e: Error) => ({ error: e.message }));
  if (!("error" in lists) && !("disabled" in lists)) await act("lists_updated", { targetKind: "system", reason: Object.entries(lists).map(([k, v]) => `${k}: ${v}`).join(", ").slice(0, 200) }).catch(() => undefined);
  if (!("error" in learned) && !("disabled" in learned)) await act("learned", { targetKind: "system", reason: `${learned.learned} new watch words, ${learned.variants} new spellings, ${learned.concepts} synonyms` }).catch(() => undefined);
  return { lists, learned, swept, goofy: goofyRun, waiting, nudged, reminded, streaks };
}
