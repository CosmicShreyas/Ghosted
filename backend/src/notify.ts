// Notification emails, honouring each user's Settings → Notifications choices and tone.
// Sending is best-effort: a failed email never breaks the reaction or chitchat that triggered it.
import { env } from "./env.js";
import { digestEmail, relatableEmail, replyEmail, type DigestItem } from "./mail/notify-email.js";
import { fromBytea } from "./lib/compression.js";
import { sendMail } from "./mail/mailer.js";
import { emailOf } from "./mfa.js";
import type { Profile } from "./security.js";
import { admin } from "./supabase.js";
import { bump } from "./live.js";
import { storyAuthor } from "./dto.js";

// True the first time `key` is seen in the window, false after, so bursts become one email.
async function firstInWindow(key: string, windowSeconds: number) {
  const { data, error } = await admin().rpc("rate_limit_hit", { p_key: key, p_window_seconds: windowSeconds });
  return !error && Number(data) === 1;
}

async function authorOf(storyId: string) {
  const { data } = await admin().from("stories").select("author_id, public_id, title, author:profiles!stories_author_id_fkey(*)").eq("id", storyId).maybeSingle();
  return data as unknown as { author_id: string; public_id: number; title: string; author: Profile } | null;
}

const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// The bell in the dashboard. Always recorded (email preferences only decide the email), and the
// account's open pages are told straight away through the live "notifications" topic.
export async function addNotification(userId: string, kind: "relatable" | "reply" | "company" | "system" | "following" | "follower" | "goofy", body: string, storyPublicId?: number | string, profilePublicId?: number | string) {
  const { error } = await admin().from("notifications").insert({ user_id: userId, kind, body: short(body, 300), story_public_id: storyPublicId ?? null, ...(profilePublicId && { profile_public_id: profilePublicId }) });
  if (error) { console.error("[notify] in-app (run supabase/init_database.sql on a fresh project)", error.message); return; }
  await bump({ user: userId, topics: ["notifications"] });
}

// A new story: everyone following the author with the bell on hears about it (as the author
// currently appears: their handle, or their name if they've made it public).
export async function notifyFollowers(author: Profile, storyPublicId: string, title: string) {
  try {
    const { data } = await admin().from("follows").select("follower_id").eq("followee_id", author.id).eq("notify", true).limit(5000);
    const who = storyAuthor(author).name;
    for (const f of data ?? []) await addNotification(f.follower_id as string, "following", `${who} shared a new story: “${short(title)}”`, storyPublicId, author.public_id);
  } catch (err) { console.error("[notify] followers", (err as Error).message); }
}

// A new story about a company: everyone who rang that company's bell hears about it (not the author).
export async function notifyCompanyFollowers(company: { id: string; slug: string; name: string }, authorId: string, storyPublicId: string, title: string) {
  try {
    const { data } = await admin().from("company_follows").select("user_id").eq("company_id", company.id).eq("notify", true).neq("user_id", authorId).limit(5000);
    for (const f of data ?? []) {
      const { error } = await admin().from("notifications").insert({ user_id: f.user_id, kind: "company", body: short(`New story about ${company.name}: “${short(title)}”`, 300), story_public_id: storyPublicId, company_slug: company.slug });
      if (error) { console.error("[notify] company (run supabase/init_database.sql on a fresh project)", error.message); return; }
      await bump({ user: f.user_id as string, topics: ["notifications"] });
    }
  } catch (err) { console.error("[notify] company followers", (err as Error).message); }
}

export async function notifyRelatable(storyId: string, actorId: string) {
  try {
    const s = await authorOf(storyId);
    if (!s || s.author_id === actorId) return;
    if (!(await firstInWindow(`notify-rel:${storyId}`, 3600))) return; // max one per story per hour
    const { count } = await admin().from("reactions").select("story_id", { count: "exact", head: true }).eq("story_id", storyId).eq("kind", "relatable");
    const n = count ?? 1;
    await addNotification(s.author_id, "relatable", `Your story “${short(s.title)}” is helping people: ${n} ${n === 1 ? "person relates" : "people relate"}.`, s.public_id);
    if (s.author.notify?.relatable) await sendMail(await emailOf(s.author_id), relatableEmail({ appUrl: env().FRONTEND_URL, tone: s.author.tone, handle: s.author.handle, title: s.title, count: n }), { theme: s.author.email_theme ?? null });
  } catch (err) { console.error("[notify] relatable", (err as Error).message); }
}

export async function notifyReply(storyId: string, actorId: string, reply: string) {
  try {
    const s = await authorOf(storyId);
    if (!s || s.author_id === actorId) return;
    if (!(await firstInWindow(`notify-reply:${storyId}`, 600))) return; // max one per story per 10 minutes
    await addNotification(s.author_id, "reply", `New chitchat on “${short(s.title)}”: “${short(reply, 80)}”`, s.public_id);
    if (s.author.notify?.chitchatReplies) await sendMail(await emailOf(s.author_id), replyEmail({ appUrl: env().FRONTEND_URL, tone: s.author.tone, handle: s.author.handle, title: s.title, reply }), { theme: s.author.email_theme ?? null });
  } catch (err) { console.error("[notify] reply", (err as Error).message); }
}

// Weekly digest (run by Vercel Cron every Monday at 05:30 UTC / 11:00 IST). Sends to up to 200 opted-in users per run who
// haven't had one in 6 days; the next run picks up anyone left.
export async function runDigest() {
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const sixDaysAgo = new Date(Date.now() - 6 * 86400_000).toISOString();
  const { data: users } = await admin().from("profiles").select("*").eq("kind", "person").eq("notify->>weeklyDigest", "true").or(`digest_sent_at.is.null,digest_sent_at.lt.${sixDaysAgo}`).limit(200);
  const people = (users ?? []) as Profile[];
  if (!people.length) return { sent: 0, candidates: 0, quiet: 0 };

  // Gather once for the whole batch, then personalize in memory. Activity can revive an older
  // story, while company sections only contain stories actually published this week.
  const [{ data: recent }, { data: reactions }, { data: comments }] = await Promise.all([
    admin().from("stories").select("id, public_id, author_id, title, outcome, company_id, created_at, company:companies(name)").eq("status", "published").gte("created_at", weekAgo).order("created_at", { ascending: false }).limit(1000),
    admin().from("reactions").select("story_id, created_at").eq("kind", "relatable").gte("created_at", weekAgo).limit(20000),
    admin().from("comments").select("story_id, created_at").eq("status", "published").gte("created_at", weekAgo).limit(20000),
  ]);
  type Row = { id: string; public_id: number; author_id: string; title: string; outcome: string; company_id: string; created_at: string; company: { name: string } | null };
  const recentRows = (recent ?? []) as unknown as Row[];
  const activityIds = [...new Set([...(reactions ?? []).map((r) => r.story_id as string), ...(comments ?? []).map((r) => r.story_id as string)])];
  const { data: olderActive } = activityIds.length ? await admin().from("stories").select("id, public_id, author_id, title, outcome, company_id, created_at, company:companies(name)").eq("status", "published").in("id", activityIds.slice(0, 1000)).lt("created_at", weekAgo) : { data: [] };
  const rows = [...recentRows, ...((olderActive ?? []) as unknown as Row[])];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const { data: counts } = rows.length ? await admin().from("story_counts").select("story_id, relatable, comments").in("story_id", rows.map((r) => r.id)) : { data: [] };
  const totals = new Map((counts ?? []).map((c) => [c.story_id as string, { relatable: Number(c.relatable) || 0, comments: Number(c.comments) || 0 }]));
  const ids = people.map((p) => p.id);
  const [{ data: follows }, { data: flags }] = await Promise.all([
    admin().from("company_follows").select("user_id, company_id").in("user_id", ids).limit(20000),
    admin().from("reactions").select("user_id, story:stories(company_id)").in("user_id", ids).eq("kind", "flag").limit(20000),
  ]);
  const followed = new Map<string, Set<string>>(), redFlagged = new Map<string, Set<string>>();
  for (const f of (follows ?? []) as { user_id: string; company_id: string }[]) { const set = followed.get(f.user_id) ?? new Set<string>(); set.add(f.company_id); followed.set(f.user_id, set); }
  for (const f of (flags ?? []) as unknown as { user_id: string; story: { company_id: string } | null }[]) if (f.story?.company_id) { const set = redFlagged.get(f.user_id) ?? new Set<string>(); set.add(f.story.company_id); redFlagged.set(f.user_id, set); }
  const score = (r: Row) => { const n = totals.get(r.id); return (n?.relatable ?? 0) + (n?.comments ?? 0) * 2; };
  const item = (r: Row): DigestItem => ({ publicId: String(r.public_id), company: r.company?.name ?? "A company", title: r.title, outcome: r.outcome, relatable: totals.get(r.id)?.relatable ?? 0, comments: totals.get(r.id)?.comments ?? 0 });
  const globalTop = [...recentRows].sort((a, b) => score(b) - score(a));
  let sent = 0;
  let quiet = 0;
  for (const p of people) {
    try {
      const since = p.digest_sent_at && p.digest_sent_at > weekAgo ? p.digest_sent_at : weekAgo;
      const newRel = new Map<string, number>(), newComments = new Map<string, number>();
      for (const r of reactions ?? []) if ((r.created_at as string) > since) newRel.set(r.story_id as string, (newRel.get(r.story_id as string) ?? 0) + 1);
      for (const r of comments ?? []) if ((r.created_at as string) > since) newComments.set(r.story_id as string, (newComments.get(r.story_id as string) ?? 0) + 1);
      const activityScore = (id: string) => (newRel.get(id) ?? 0) + (newComments.get(id) ?? 0) * 2;
      const mine = [...new Set([...newRel.keys(), ...newComments.keys()])].map((id) => byId.get(id)).filter((r): r is Row => !!r && r.author_id === p.id).sort((a, b) => activityScore(b.id) - activityScore(a.id)).slice(0, 3).map((r) => ({ ...item(r), newRelatable: newRel.get(r.id) ?? 0, newComments: newComments.get(r.id) ?? 0 }));
      const seen = new Set(mine.map((x) => x.publicId));
      const followedItems = recentRows.filter((r) => r.author_id !== p.id && followed.get(p.id)?.has(r.company_id)).sort((a, b) => score(b) - score(a)).slice(0, 3).map(item); followedItems.forEach((x) => seen.add(x.publicId));
      const flaggedItems = p.notify?.flaggedCompanies ? recentRows.filter((r) => !seen.has(String(r.public_id)) && redFlagged.get(p.id)?.has(r.company_id)).sort((a, b) => score(b) - score(a)).slice(0, 3).map(item) : []; flaggedItems.forEach((x) => seen.add(x.publicId));
      const highlights = globalTop.filter((r) => r.author_id !== p.id && !seen.has(String(r.public_id)) && score(r) > 0).slice(0, mine.length || followedItems.length || flaggedItems.length ? 2 : 3).map(item);
      if (!mine.length && !followedItems.length && !flaggedItems.length && !highlights.length) {
        // Count this as an evaluated week so quiet accounts do not occupy the front of every
        // capped batch. No email is sent, and genuine delivery failures remain eligible to retry.
        await admin().from("profiles").update({ digest_sent_at: new Date().toISOString() }).eq("id", p.id);
        quiet++;
        continue;
      }
      await sendMail(await emailOf(p.id), digestEmail({ appUrl: env().FRONTEND_URL, tone: p.tone, handle: p.handle, mine, followed: followedItems, flagged: flaggedItems, highlights }), { theme: p.email_theme ?? null });
      await admin().from("profiles").update({ digest_sent_at: new Date().toISOString() }).eq("id", p.id);
      sent++;
    } catch (err) { console.error("[digest]", (err as Error).message); }
  }
  return { sent, candidates: people.length, quiet };
}

// Stories store their body compressed; exported for callers that need plain text.
export const plainBody = fromBytea;
