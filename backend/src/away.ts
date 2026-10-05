// "We miss you": members who haven't opened Ghosted for 2+ days get one personalised email (plus an
// in-app notification and a phone push), with what actually happened while they were away:
//   - new stories in the feed, and about the companies they follow
//   - reactions and chitchats on their own stories
//   - their streak (lost, or saved by a freeze) and how close they are to the next level
// At most one every 7 days per member (profiles.away_nudged_at), never in the first 2 days after
// signing up, and switchable off in Settings → Notifications ("While you're away"). Runs with the
// daily automation (09:45 IST). "Away" is the newest last_seen_at across their signed-in devices.
import { env } from "./env.js";
import { sendMail } from "./mail/mailer.js";
import { button, escape, layout, type Tone } from "./mail/otp-email.js";
import { emailOf } from "./mfa.js";
import { addNotification } from "./notify.js";
import { admin } from "./supabase.js";
import { progressOf } from "./levels.js";

const DAY = 86400_000;
const AWAY_DAYS = 2, EVERY_DAYS = 7, MAX_PER_RUN = 300;

type Member = { id: string; handle: string; tone: Tone | null; email_theme: "light" | "dark" | null; notify: { comeBack?: boolean } | null; xp: number | null; streak: number | null; best_streak: number | null; created_at: string; away_nudged_at: string | null };
type Since = { feed: number; followed: number; followedNames: string[]; reactions: number; chitchats: number };

async function whatHappened(userId: string, since: string): Promise<Since> {
  const [feed, follows, mine] = await Promise.all([
    admin().from("stories").select("id", { count: "exact", head: true }).eq("status", "published").gte("created_at", since).neq("author_id", userId),
    admin().from("company_follows").select("company_id, company:companies(name)").eq("user_id", userId).limit(200),
    admin().from("stories").select("id").eq("author_id", userId).eq("status", "published").limit(500),
  ]);
  const followRows = (follows.data ?? []) as unknown as { company_id: string; company: { name: string } | null }[];
  const ids = followRows.map((f) => f.company_id);
  const myIds = ((mine.data ?? []) as { id: string }[]).map((s) => s.id);
  const [followed, reactions, chitchats] = await Promise.all([
    ids.length ? admin().from("stories").select("company_id").eq("status", "published").gte("created_at", since).in("company_id", ids).neq("author_id", userId).limit(500) : Promise.resolve({ data: [] }),
    myIds.length ? admin().from("reactions").select("story_id", { count: "exact", head: true }).in("story_id", myIds).gte("created_at", since) : Promise.resolve({ count: 0 }),
    myIds.length ? admin().from("comments").select("id", { count: "exact", head: true }).in("story_id", myIds).eq("status", "published").gte("created_at", since).neq("author_id", userId) : Promise.resolve({ count: 0 }),
  ]);
  const hit = new Set(((followed.data ?? []) as { company_id: string }[]).map((r) => r.company_id));
  return {
    feed: feed.count ?? 0,
    followed: (followed.data ?? []).length,
    followedNames: followRows.filter((f) => hit.has(f.company_id)).map((f) => f.company?.name).filter((n): n is string => !!n).slice(0, 3),
    reactions: (reactions as { count: number | null }).count ?? 0,
    chitchats: (chitchats as { count: number | null }).count ?? 0,
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function awayEmail({ appUrl, tone, handle, days, s, streakLost, toNext, nextLevel }: { appUrl: string; tone: Tone; handle: string; days: number; s: Since; streakLost: number; toNext: number; nextLevel: number }) {
  const sassy = tone === "sassy";
  const lines: string[] = [];
  if (s.reactions || s.chitchats) lines.push(`Your stories got ${[s.reactions && plural(s.reactions, "reaction"), s.chitchats && plural(s.chitchats, "new chitchat")].filter(Boolean).join(" and ")}.`);
  if (s.followed) lines.push(`${plural(s.followed, "new story", "new stories")} about ${s.followedNames.length ? escape(s.followedNames.join(", ")) : "companies you follow"}.`);
  if (s.feed) lines.push(`${plural(s.feed, "story", "stories")} posted on Ghosted overall.`);
  if (streakLost > 1) lines.push(sassy ? `Your ${streakLost}-day streak ghosted you. Start a new one today.` : `Your ${streakLost}-day streak ended. Any action today starts a new one.`);
  lines.push(`You're ${toNext.toLocaleString("en-IN")} XP from Level ${nextLevel}.`);
  const subject = sassy
    ? (s.reactions || s.chitchats ? `${escape(handle)}, people reacted to your story while you were gone` : `${days} days of silence? That's our line, ${escape(handle)}.`)
    : (s.reactions || s.chitchats ? "New activity on your Ghosted stories" : "Here's what you missed on Ghosted");
  const html = layout({
    appUrl, subject, banner: "While you were away",
    heading: sassy ? `${escape(handle)}, we noticed you went quiet.` : `Hi ${escape(handle)}, here's what you missed.`,
    ...(sassy && { tagline: "We don't ghost. We check in." }),
    intro: `${sassy ? `It's been ${days} days. Here's the tea you missed:` : `In the last ${days} days on Ghosted:`}<br><br>${lines.map((l) => `&bull; ${l}`).join("<br>")}`,
    body: button(`${appUrl}/dashboard`, sassy ? "Catch up on the feed" : "See what's new"),
    preheader: lines[0] ?? "Here's what's new on Ghosted.",
    footnote: sassy
      ? "We send this at most once a week when you've been away. Turn it off in Settings → Notifications → While you're away. No hard feelings, unlike some recruiters."
      : "We send this at most once a week when you've been away. You can turn it off in Settings → Notifications → While you're away.",
  });
  const text = [subject, "", ...lines.map((l) => `- ${l.replace(/<[^>]+>/g, "")}`), "", `${appUrl}/dashboard`].join("\n");
  return { subject: subject.replace(/&amp;/g, "&"), html, text };
}

export async function nudgeAway() {
  const now = Date.now();
  const awaySince = new Date(now - AWAY_DAYS * DAY).toISOString();
  const { data: seen, error } = await admin().from("session_devices").select("user_id, last_seen_at").order("last_seen_at", { ascending: false }).limit(20000);
  if (error) return { error: error.message };
  // Newest sign-in activity per member; away = nothing newer than 2 days ago.
  const last = new Map<string, string>();
  for (const r of (seen ?? []) as { user_id: string; last_seen_at: string }[]) if (!last.has(r.user_id)) last.set(r.user_id, r.last_seen_at);
  const away = [...last].filter(([, at]) => at < awaySince && at > new Date(now - 60 * DAY).toISOString()).map(([id]) => id);
  if (!away.length) return { sent: 0 };
  const { data: rows, error: pErr } = await admin().from("profiles").select("id, handle, tone, email_theme, notify, xp, streak, best_streak, created_at, away_nudged_at, kind").in("id", away.slice(0, 2000));
  if (pErr) return { error: `${pErr.message} (run the While you're away section of init_database.sql)` };
  let sent = 0;
  for (const m of (rows ?? []) as (Member & { kind?: string })[]) {
    if (sent >= MAX_PER_RUN) break;
    if (m.kind === "bot" || m.notify?.comeBack === false) continue;
    if (m.away_nudged_at && now - new Date(m.away_nudged_at).getTime() < EVERY_DAYS * DAY) continue;
    if (now - new Date(m.created_at).getTime() < AWAY_DAYS * DAY) continue;
    // Claimed first, so two runs can never send it twice.
    const { data: claimed } = await admin().from("profiles").update({ away_nudged_at: new Date().toISOString() }).eq("id", m.id).or(`away_nudged_at.is.null,away_nudged_at.lt.${new Date(now - EVERY_DAYS * DAY).toISOString()}`).select("id");
    if (!claimed?.length) continue;
    const lastSeen = last.get(m.id)!;
    const days = Math.max(AWAY_DAYS, Math.floor((now - new Date(lastSeen).getTime()) / DAY));
    const s = await whatHappened(m.id, lastSeen);
    const prog = progressOf(m.xp ?? 0);
    const tone = m.tone ?? "sassy";
    // The streak counter only resets on the next action, so "lost" is what they had going.
    const streakLost = m.streak ?? 0;
    const headline = s.reactions || s.chitchats ? `Your stories got ${[s.reactions && plural(s.reactions, "reaction"), s.chitchats && plural(s.chitchats, "chitchat")].filter(Boolean).join(" and ")} while you were away.` : `${plural(s.feed, "new story", "new stories")} since you last visited.`;
    await addNotification(m.id, "system", tone === "sassy" ? `${headline} Come see what the tea is.` : `${headline} Take a look.`);
    const email = await emailOf(m.id).catch(() => null);
    if (email) {
      try { await sendMail(email, awayEmail({ appUrl: env().FRONTEND_URL, tone, handle: m.handle, days, s, streakLost, toNext: prog.need - prog.into, nextLevel: prog.level + 1 }), { theme: m.email_theme ?? "light" }); }
      catch (e) { console.error("[away] email", (e as Error).message); }
    }
    sent++;
  }
  return { sent };
}
