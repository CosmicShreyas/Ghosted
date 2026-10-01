// Goofy, Ghosted's AutoMod: a real profile that acts on top of the moderation algorithms, and does
// the work before any human moderator has to.
//
//   removes     vulgar stories and chitchats (now, and when an updated word list catches old ones)
//   holds       risky posts for a check, then releases, redacts or removes them (automation sweep)
//   reports     files his own reports on stories, chitchats and companies that need a human eye
//   strikes     counts his removals per person: a warning at 2, a 3-day posting pause at 3 (30 days)
//   tells       every action to the person concerned, in their tone (sassy or calm), from 100+ lines
//   welcomes    new members with the ground rules
//   alerts      followers of a company when it piles up "ghost job" stories
//   reports in  weekly to his followers, and daily to the moderators about what needs a human
//
// Everything he does is logged in goofy_actions (an anonymous public activity feed on his page).
import { randomBytes } from "node:crypto";
import { ApiError } from "../errors.js";
import { env } from "../env.js";
import { bump } from "../live.js";
import { addNotification } from "../notify.js";
import { sendMail } from "../mail/mailer.js";
import { admin } from "../supabase.js";
import type { Profile } from "../security.js";
import { reviewText } from "../algorithms/index.js";
import { fromBytea } from "../lib/compression.js";
import { line, type GoofyEvent, type Tone } from "./lines.js";
import { goofyControls } from "../platform.js";

export const GOOFY_PUBLIC_ID = "600710000000001";
export const GOOFY = {
  handle: "Goofy",
  badge: "AutoMod",
  avatarUrl: "/goofy_automod.png",
  bio: "Hi, I'm Goofy, Ghosted's AutoMod. I read every story and chitchat the moment it's posted, eat the vulgar ones, hide people's names, check that accusations are told as experiences, and file reports so the humans only see what truly needs them. I'm strict about words and soft on people. Follow me for a weekly report of what I've been up to.",
};
const DAY = 86400_000;

// ---------- the account ----------

let goofyId: string | null = null;
export async function goofy(): Promise<string> {
  if (goofyId) return goofyId;
  const { data } = await admin().from("profiles").select("id").eq("public_id", GOOFY_PUBLIC_ID).maybeSingle();
  if (data) return (goofyId = (data as { id: string }).id);
  // First run: a sign-in-proof auth user (unreachable email, banned for 100 years, random password).
  const email = "goofy@automod.ghosted.invalid";
  let id: string | null = null;
  const created = await admin().auth.admin.createUser({ email, email_confirm: true, password: randomBytes(32).toString("base64url"), ban_duration: "876000h", user_metadata: {} });
  if (created.data.user) id = created.data.user.id;
  else {
    // Already exists (an earlier half-finished run): find it.
    for (let page = 1; page <= 20 && !id; page++) {
      const { data: list } = await admin().auth.admin.listUsers({ page, perPage: 200 });
      id = list?.users.find((u) => u.email === email)?.id ?? null;
      if (!list || list.users.length < 200) break;
    }
  }
  if (!id) throw new Error(`[goofy] couldn't create his account: ${created.error?.message ?? "unknown"}`);
  const { error } = await admin().from("profiles").upsert({ id, public_id: GOOFY_PUBLIC_ID, handle: GOOFY.handle, avatar_seed: "goofy-automod", pastel: "bg-avatar-lilac", kind: "bot", goofy_welcomed: true }, { onConflict: "id" });
  if (error) throw new Error(`[goofy] profile (run supabase/init_database.sql on a fresh project): ${error.message}`);
  return (goofyId = id);
}
export const isGoofyPublicId = (id: string) => id === GOOFY_PUBLIC_ID;

// ---------- log + tell ----------

export type GoofyAction = "removed_story" | "removed_chitchat" | "held" | "released" | "redacted" | "took_down" | "restored" | "reported_story" | "reported_chitchat" | "reported_company" | "asked_rephrase" | "warned" | "paused" | "welcomed" | "ghost_job_alert" | "dismissed_reports" | "escalated" | "lists_updated" | "learned";

export async function act(action: GoofyAction, o: { targetKind?: "story" | "chitchat" | "company" | "profile" | "system"; storyPublicId?: string | number | null; companySlug?: string | null; reason?: string; userId?: string | null } = {}) {
  const { error } = await admin().from("goofy_actions").insert({ action, target_kind: o.targetKind ?? null, story_public_id: o.storyPublicId ?? null, company_slug: o.companySlug ?? null, reason: o.reason?.slice(0, 200) ?? null, user_id: o.userId ?? null });
  if (error) console.error("[goofy] log", error.message);
  else await bump({ shared: [`person:${GOOFY_PUBLIC_ID}`] });
}

// A notification from Goofy, in the person's tone, linking to what it's about (or to Goofy).
export async function tell(userId: string, event: GoofyEvent, vars: { what?: string; reason?: string; company?: string } = {}, storyPublicId?: string | number | null) {
  const { data } = await admin().from("profiles").select("tone").eq("id", userId).maybeSingle();
  const tone = ((data as { tone?: Tone } | null)?.tone ?? "sassy") as Tone;
  await addNotification(userId, "goofy", line(event, tone, vars), storyPublicId ?? undefined, storyPublicId ? undefined : GOOFY_PUBLIC_ID);
}
export const say = (event: GoofyEvent, tone: Tone, vars: { what?: string; reason?: string; company?: string } = {}) => line(event, tone, vars);

// ---------- strikes ----------

export async function strike(userId: string) {
  const controls = await goofyControls(); if (!controls.enabled || !controls.strikes) return;
  const { count } = await admin().from("goofy_actions").select("id", { count: "exact", head: true }).eq("user_id", userId).in("action", ["removed_story", "removed_chitchat", "took_down"]).gte("created_at", new Date(Date.now() - 30 * DAY).toISOString());
  const n = count ?? 0;
  if (n === 2) { await tell(userId, "warned"); await act("warned", { targetKind: "profile", userId, reason: "second removal in 30 days" }); }
  if (n >= 3) {
    await admin().from("profiles").update({ posting_paused_until: new Date(Date.now() + 3 * DAY).toISOString() }).eq("id", userId);
    await tell(userId, "paused");
    await act("paused", { targetKind: "profile", userId, reason: "three removals in 30 days" });
  }
}
export function ensureCanPost(p: Pick<Profile, "tone"> & { posting_paused_until?: string | null }) {
  const until = p.posting_paused_until ? new Date(p.posting_paused_until) : null;
  if (until && until.getTime() > Date.now()) {
    const when = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(until);
    throw new ApiError(429, "posting_paused", `Goofy: posting is paused until ${when} after three removals this month. You can still read and react.`);
  }
}

// ---------- removals ----------

// Removes published content Goofy finds vulgar, tells the author, counts a strike.
export async function remove(kind: "story" | "chitchat", row: { id: string; author_id: string; public_id: number | string; storyPublicId?: number | string | null }, reason: string) {
  const controls = await goofyControls(); if (!controls.enabled || !controls.blockVulgarity) return;
  await admin().from(kind === "story" ? "stories" : "comments").update({ status: kind === "story" ? "hidden" : "removed", moderation: { autoRemoved: true, by: "goofy", reason, at: new Date().toISOString() } }).eq("id", row.id);
  await act(kind === "story" ? "removed_story" : "removed_chitchat", { targetKind: kind, userId: row.author_id, reason });
  await tell(row.author_id, "removed", { what: kind === "story" ? "story" : "chitchat", reason });
  await strike(row.author_id);
  await bump({ shared: ["feed", ...(row.storyPublicId ? [`story:${row.storyPublicId}`] : kind === "story" ? [`story:${row.public_id}`] : [])] });
}

// ---------- Goofy's own reports ----------

const REPORT_REASON: Record<string, string> = { pii: "identifies_person", defamation_risk: "false_info", spam: "spam", links: "spam", duplicate: "spam", targeted_abuse: "harassment", sexual_abuse: "harassment", confidential: "confidential", watchlist: "other", self_harm: "other" };
export async function reportAs(kind: "story" | "chitchat" | "company", targetId: string, codes: string[], details: string, ref?: { storyPublicId?: string | number | null; companySlug?: string | null }) {
  const controls = await goofyControls(); if (!controls.enabled || !controls.fileReports) return;
  const me = await goofy();
  const reason = REPORT_REASON[codes.find((c) => REPORT_REASON[c]) ?? ""] ?? (kind === "company" ? "fake" : "other");
  const table = kind === "story" ? "reports" : kind === "chitchat" ? "comment_reports" : "company_reports";
  const col = kind === "story" ? "story_id" : kind === "chitchat" ? "comment_id" : "company_id";
  // One open Goofy report per item.
  const { data: open } = await admin().from(table).select("id").eq(col, targetId).eq("reporter_id", me).eq("resolved", false).limit(1);
  if (open?.length) return;
  const companyReason = codes.some((c) => ["vulgar", "slur", "identity_attack", "profanity", "targeted_abuse"].includes(c)) ? "offensive" : codes.includes("spam") || codes.includes("links") ? "fake" : "other";
  const { error } = await admin().from(table).insert({ [col]: targetId, reporter_id: me, reason: kind === "company" ? companyReason : reason, details: `Goofy: ${details}`.slice(0, 1000) });
  if (error) { console.error("[goofy] report", error.message); return; }
  await act(kind === "story" ? "reported_story" : kind === "chitchat" ? "reported_chitchat" : "reported_company", { targetKind: kind, storyPublicId: ref?.storyPublicId ?? null, companySlug: ref?.companySlug ?? null, reason: details });
}

// ---------- welcome ----------

export async function welcome(p: Pick<Profile, "id"> & { goofy_welcomed?: boolean; kind?: string }) {
  const controls = await goofyControls(); if (!controls.enabled || !controls.welcomeMembers) return;
  if (p.goofy_welcomed || p.kind === "bot") return;
  await admin().from("profiles").update({ goofy_welcomed: true }).eq("id", p.id);
  await tell(p.id, "welcome");
  await act("welcomed", { targetKind: "profile", reason: "new member" });
}

// ---------- daily jobs ----------

// After the word lists change, yesterday's clean post can be today's vulgar one: re-check the last
// 30 days of published content, and remove what's now blocked for vulgarity, slurs or threats.
const REMOVE_CODES = new Set(["vulgar", "slur", "identity_attack", "threat"]);
export async function rescanPublished() {
  const since = new Date(Date.now() - 30 * DAY).toISOString();
  let removed = 0;
  const { data: stories } = await admin().from("stories").select("id, public_id, author_id, title, body_z").eq("status", "published").gte("created_at", since).limit(800);
  for (const s of (stories ?? []) as { id: string; public_id: number; author_id: string; title: string; body_z: string }[]) {
    const r = reviewText(`${s.title}\n${fromBytea(s.body_z)}`, { kind: "story" });
    const hit = r.reasons.find((x) => REMOVE_CODES.has(x.code));
    if (r.decision === "block" && hit) { await remove("story", s, hit.detail); removed++; }
  }
  const { data: comments } = await admin().from("comments").select("id, public_id, author_id, body_z, story:stories(public_id)").eq("status", "published").gte("created_at", since).limit(2000);
  for (const c of (comments ?? []) as unknown as { id: string; public_id: number; author_id: string; body_z: string; story: { public_id: number } | null }[]) {
    const r = reviewText(fromBytea(c.body_z), { kind: "chitchat" });
    const hit = r.reasons.find((x) => REMOVE_CODES.has(x.code));
    if (r.decision === "block" && hit) { await remove("chitchat", { ...c, storyPublicId: c.story?.public_id ?? null }, hit.detail); removed++; }
  }
  return removed;
}

// Companies collecting "ghost job" stories (3+ in 30 days): followers get a heads-up, once a month.
export async function ghostJobAlerts() {
  const since = new Date(Date.now() - 30 * DAY).toISOString();
  const { data } = await admin().from("stories").select("company_id, company:companies(slug, name)").eq("status", "published").eq("outcome", "ghost_job").gte("created_at", since).limit(5000);
  const by = new Map<string, { id: string; slug: string; name: string; n: number }>();
  for (const r of (data ?? []) as unknown as { company_id: string; company: { slug: string; name: string } | null }[]) {
    if (!r.company) continue;
    const e = by.get(r.company_id) ?? { id: r.company_id, slug: r.company.slug, name: r.company.name, n: 0 };
    e.n++; by.set(r.company_id, e);
  }
  let alerted = 0;
  for (const co of [...by.values()].filter((x) => x.n >= 3)) {
    const { data: recent } = await admin().from("goofy_actions").select("id").eq("action", "ghost_job_alert").eq("company_slug", co.slug).gte("created_at", since).limit(1);
    if (recent?.length) continue;
    const { data: followers } = await admin().from("company_follows").select("user_id").eq("company_id", co.id).limit(5000);
    for (const f of (followers ?? []) as { user_id: string }[]) {
      const { data: p } = await admin().from("profiles").select("tone").eq("id", f.user_id).maybeSingle();
      await addNotification(f.user_id, "goofy", line("ghost_job_alert", ((p as { tone?: Tone } | null)?.tone ?? "sassy") as Tone, { company: co.name }), undefined, undefined);
    }
    await act("ghost_job_alert", { targetKind: "company", companySlug: co.slug, reason: `${co.n} ghost-job stories in 30 days` });
    alerted++;
  }
  return alerted;
}

async function weekCounts(days = 7) {
  const since = new Date(Date.now() - days * DAY).toISOString();
  const { data } = await admin().from("goofy_actions").select("action").gte("created_at", since).limit(50000);
  const n: Record<string, number> = {};
  for (const r of (data ?? []) as { action: string }[]) n[r.action] = (n[r.action] ?? 0) + 1;
  return n;
}

// Weekly: Goofy's followers get his report card. Daily: moderators get what needs a human.
export async function weeklyReport() {
  const { data: last } = await admin().from("automation_runs").select("last_run").eq("job", "goofy_weekly").maybeSingle();
  if (last && Date.now() - new Date((last as { last_run: string }).last_run).getTime() < 6.5 * DAY) return 0;
  const n = await weekCounts();
  const summary = `${(n["removed_story"] ?? 0) + (n["removed_chitchat"] ?? 0)} vulgar posts removed, ${n["held"] ?? 0} held for a check, ${n["redacted"] ?? 0} names hidden, ${(n["reported_story"] ?? 0) + (n["reported_chitchat"] ?? 0) + (n["reported_company"] ?? 0)} reports filed, ${n["welcomed"] ?? 0} newcomers welcomed`;
  const me = await goofy();
  const { data: followers } = await admin().from("follows").select("follower_id").eq("followee_id", me).limit(20000);
  for (const f of (followers ?? []) as { follower_id: string }[]) {
    const { data: p } = await admin().from("profiles").select("tone").eq("id", f.follower_id).maybeSingle();
    await addNotification(f.follower_id, "goofy", line("weekly", ((p as { tone?: Tone } | null)?.tone ?? "sassy") as Tone, { reason: summary }), undefined, GOOFY_PUBLIC_ID);
  }
  await admin().from("automation_runs").upsert({ job: "goofy_weekly", last_run: new Date().toISOString(), stats: n }, { onConflict: "job" });
  return (followers ?? []).length;
}

export async function escalate() {
  // MODERATOR_EMAILS, plus admins who left "Daily brief" on in their panel settings.
  const { data: admins } = await admin().from("admin_users").select("email, notify").eq("active", true).is("disabled_at", null);
  const to = [...new Set([...env().MODERATOR_EMAILS, ...((admins ?? []) as { email: string; notify: Record<string, boolean> | null }[]).filter((a) => a.notify?.["dailyBrief"] !== false).map((a) => a.email)])];
  const [pending, urgent, selfHarm] = await Promise.all([
    admin().from("stories").select("public_id, title, moderation, created_at").eq("status", "pending").lte("created_at", new Date(Date.now() - 48 * 3600_000).toISOString()).limit(50),
    admin().from("reports").select("priority, reason, story:stories(public_id, title)").eq("resolved", false).gte("priority", 80).order("priority", { ascending: false }).limit(50),
    admin().from("stories").select("public_id, title").eq("status", "pending").eq("moderation->>selfHarm", "true").limit(50),
  ]);
  const items = [
    ...((urgent.data ?? []) as unknown as { priority: number; reason: string; story: { public_id: number; title: string } | null }[]).map((r) => `Report (${r.reason}, priority ${r.priority}): “${r.story?.title ?? "story"}” ${env().FRONTEND_URL}/s/${r.story?.public_id ?? ""}`),
    ...((selfHarm.data ?? []) as { public_id: number; title: string }[]).map((s) => `Self-harm language, consider reaching out: “${s.title}” (story ${s.public_id})`),
    ...((pending.data ?? []) as { public_id: number; title: string }[]).map((s) => `Held over 48 h: “${s.title}” (story ${s.public_id})`),
  ];
  if (!items.length) return 0;
  await act("escalated", { targetKind: "system", reason: `${items.length} items need a human` });
  if (!to.length) return items.length;
  const n = await weekCounts(1);
  const text = `Goofy's daily brief\n\nIn the last 24 hours I removed ${(n["removed_story"] ?? 0) + (n["removed_chitchat"] ?? 0)} posts, held ${n["held"] ?? 0} and filed ${(n["reported_story"] ?? 0) + (n["reported_chitchat"] ?? 0) + (n["reported_company"] ?? 0)} reports.\n\nThese need a human:\n${items.map((i) => `• ${i}`).join("\n")}\n`;
  const html = `<h2>Goofy's daily brief</h2><p>In the last 24 hours I removed <b>${(n["removed_story"] ?? 0) + (n["removed_chitchat"] ?? 0)}</b> posts, held <b>${n["held"] ?? 0}</b> and filed <b>${(n["reported_story"] ?? 0) + (n["reported_chitchat"] ?? 0) + (n["reported_company"] ?? 0)}</b> reports.</p><p>These need a human:</p><ul>${items.map((i) => `<li>${i.replace(/[<>&]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[ch]!)}</li>`).join("")}</ul>`;
  for (const addr of to) { try { await sendMail(addr, { subject: `Goofy: ${items.length} thing${items.length === 1 ? "" : "s"} need a human`, html, text }); } catch (e) { console.error("[goofy] brief", (e as Error).message); } }
  return items.length;
}

export async function dailyGoofy() {
  await goofy();
  const c = await goofyControls();
  if (!c.enabled) return { removed: 0, alerts: 0, weekly: 0, escalated: 0 };
  const [removed, alerts, weekly, escalated] = [c.rescanPublished ? await rescanPublished() : 0, c.ghostJobAlerts ? await ghostJobAlerts() : 0, c.weeklyReports ? await weeklyReport() : 0, c.dailyBriefs ? await escalate() : 0];
  return { removed, alerts, weekly, escalated };
}
