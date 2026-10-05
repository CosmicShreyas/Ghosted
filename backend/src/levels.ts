// Levels, XP and streaks: the member's seniority on Ghosted.
//
//   six ways to earn   read stories, react, chitchat, share your story, follow, invite
//   daily caps         each way pays only so many times a day, so nobody can farm it
//   diminishing XP     the higher your level, the less each action pays (award_xp in SQL)
//   steeper levels     level L → L+1 needs 100 × L^1.5 XP, so every level takes longer
//   streaks            any XP on an India day keeps the streak; the day's first XP adds a bonus
//                      that grows with the streak (5 + 1 per day, up to 30)
//   level ups          an in-app notification (and a phone push) plus an email, in the member's tone
//
// All XP goes through the award_xp() function in init_database.sql, which is atomic and ignores
// anything already paid for (the same story, reaction or follow can never pay twice).
import { env } from "./env.js";
import { later, bump } from "./live.js";
import { sendMail } from "./mail/mailer.js";
import { button, escape, layout } from "./mail/otp-email.js";
import { emailOf } from "./mfa.js";
import { addNotification } from "./notify.js";
import { admin } from "./supabase.js";

export type XpKind = "read" | "react" | "chitchat" | "story" | "follow" | "invite_join" | "invite" | "welcome";
// Base XP and how many times a day each pays. Shown on the invite page and Insights (/v1/me/level).
export const XP_RULES: Record<XpKind, { xp: number; cap: number; label: string }> = {
  read: { xp: 2, cap: 15, label: "Read a story" },
  react: { xp: 4, cap: 10, label: "React to a story" },
  chitchat: { xp: 10, cap: 6, label: "Leave a chitchat" },
  story: { xp: 50, cap: 2, label: "Share your story" },
  follow: { xp: 5, cap: 6, label: "Follow a company or person" },
  invite_join: { xp: 30, cap: 5, label: "Someone joins with your invite" },
  invite: { xp: 120, cap: 5, label: "Someone you invited shares a story" },
  // For the person invited: a head start the moment they join through an invite link (once).
  welcome: { xp: 25, cap: 0, label: "Joined through an invite" },
};
// Streak milestones (paid inside award_xp in SQL, once each, ever) and freezes.
export const STREAK_MILESTONES: [number, number][] = [[7, 50], [30, 200], [100, 500], [365, 1000]];
export const FREEZE_EVERY = 7, FREEZE_MAX = 2;

// Same curve as level_for_xp() in SQL.
export const stepFor = (level: number) => Math.round(100 * Math.pow(level, 1.5));
export function progressOf(xp: number) {
  let level = 1, floor = 0;
  while (level < 99 && xp >= floor + stepFor(level)) { floor += stepFor(level); level++; }
  return { level, into: xp - floor, need: stepFor(level), floor };
}
export const multiplierFor = (level: number) => 1 / (1 + 0.1 * (level - 1));

// Badge colour: one per title band, in the site's own palette (accent cream, the avatar pastels,
// the brand violet, flag gold), ending in a red-to-violet gradient for Myth. Same as src/lib/levels.tsx.
const BANDS: [number, string, string, string?][] = [
  [1, "#FDF3B4", "#141110"],   // Fresh face: the accent cream-yellow
  [3, "#B7EFC5", "#141110"],   // Regular: mint
  [6, "#9ED8F7", "#141110"],   // Insider: sky
  [10, "#5EE0CB", "#141110"],  // Receipt keeper: teal
  [15, "#C9B8FF", "#141110"],  // Veteran: lilac
  [21, "#7C3AED", "#FFFFFF"],  // Elder: brand violet
  [28, "#EC4899", "#FFFFFF"],  // Oracle: pink
  [36, "#F5A524", "#141110"],  // Legend: gold
  [45, "#EF4444", "#FFFFFF", "linear-gradient(135deg, #EF4444, #EC4899 50%, #7C3AED)"], // Myth
];
export function levelColor(level: number) {
  const b = [...BANDS].reverse().find(([l]) => level >= l)!;
  return { bg: b[1], fg: b[2], ...(b[3] && { image: b[3] }) };
}

// Seniority titles, every few levels.
const TITLES: [number, string][] = [[1, "Fresh face"], [3, "Regular"], [6, "Insider"], [10, "Receipt keeper"], [15, "Veteran"], [21, "Elder"], [28, "Oracle"], [36, "Legend"], [45, "Myth"]];
export const titleFor = (level: number) => [...TITLES].reverse().find(([l]) => level >= l)![1];

type Award = { awarded: number; bonus?: number; xp?: number; level?: number; from_level?: number; streak?: number; reason?: string; freeze_used?: boolean; freezes?: number; milestone?: number | null; milestone_xp?: number };

// Best effort and never blocks the action that earned it.
export function award(userId: string, kind: XpKind, ref: string) {
  later((async () => {
    const r = XP_RULES[kind];
    const { data, error } = await admin().rpc("award_xp", { p_user: userId, p_kind: kind, p_ref: ref.slice(0, 80), p_base: r.xp, p_cap: r.cap });
    if (error) { if (!/award_xp/.test(error.message)) console.error("[levels] award", error.message); return; }
    const a = data as Award;
    if (!a?.awarded) return;
    await bump({ user: userId, topics: ["me"] });
    if (a.freeze_used || a.milestone) await streakNews(userId, a);
    if (a.level && a.from_level && a.level > a.from_level) await levelledUp(userId, a.from_level, a.level, a.streak ?? 0);
  })().catch((e: Error) => console.error("[levels]", e.message)));
}

// ---------- streak news: a freeze saved you, or you hit a milestone ----------

async function streakNews(userId: string, a: Award) {
  const { data } = await admin().from("profiles").select("tone").eq("id", userId).maybeSingle();
  const sassy = ((data as { tone?: string } | null)?.tone ?? "sassy") === "sassy";
  if (a.freeze_used) await addNotification(userId, "system", sassy
    ? `A streak freeze just saved your ${a.streak}-day streak. You missed a day, we looked the other way. ${a.freezes ? `${a.freezes} left.` : "That was your last one, so no more skipping."}`
    : `A streak freeze covered the day you missed, so your streak is ${a.streak} days. ${a.freezes ? `${a.freezes} freeze left.` : "No freezes left."}`);
  if (a.milestone) await addNotification(userId, "system", sassy
    ? `${a.milestone}-day streak. +${a.milestone_xp} XP bonus. That's more consistency than any recruiter has ever shown you.`
    : `You reached a ${a.milestone}-day streak and earned a ${a.milestone_xp} XP bonus.`);
}

// Morning nudge (daily automation, 09:45 IST): a push to members on a 3+ day streak who were active
// yesterday, so today's first action is top of mind. Push only, never during quiet hours.
export async function remindStreaks() {
  const { quietHoursIST, sendPush, pushEnabled } = await import("./push.js");
  if (!pushEnabled() || quietHoursIST()) return { sent: 0, skipped: "quiet hours or push off" };
  const yesterday = istDay(new Date(Date.now() - 86400_000));
  const { data, error } = await admin().from("profiles").select("id, streak, tone").eq("streak_day", yesterday).gte("streak", 3).limit(5000);
  if (error) return { sent: 0, error: error.message };
  let sent = 0;
  for (const p of (data ?? []) as { id: string; streak: number; tone: string | null }[]) {
    const day = p.streak + 1;
    const body = (p.tone ?? "sassy") === "sassy"
      ? `Day ${day} is waiting. Read one story, keep the streak, collect the bonus. Unlike HR, we remember you.`
      : `Keep your ${p.streak}-day streak going: any action today counts, and adds a streak bonus.`;
    await sendPush(p.id, { kind: "streak", body, url: "/dashboard", tag: "ghosted-streak" });
    sent++;
  }
  return { sent };
}

// ---------- level-up messages ----------

const sassyLine = (level: number) => [
  "Look at you, actually showing up. Recruiters could never.",
  "Another level. Your consistency is louder than any 'we'll get back to you'.",
  "You're climbing faster than a hiring freeze can thaw.",
  "Senior energy. Somebody tell HR you replied within 24 hours.",
  "The receipts are stacking up, and so are you.",
][level % 5]!;
const calmLine = (level: number) => `Thanks for being an active part of Ghosted. Level ${level} reflects everything you've read, shared and added.`;

async function levelledUp(userId: string, from: number, to: number, streak: number) {
  const { data } = await admin().from("profiles").select("handle, tone, email_theme, notify").eq("id", userId).maybeSingle();
  const p = data as { handle: string; tone: "sassy" | "calm" | null; email_theme: "light" | "dark" | null; notify: { levelUps?: boolean } | null } | null;
  const tone = p?.tone ?? "sassy";
  const title = titleFor(to);
  const body = tone === "sassy"
    ? `Level ${to} unlocked: ${title}. ${sassyLine(to)}${streak > 1 ? ` ${streak}-day streak, keep it alive.` : ""}`
    : `You reached Level ${to} (${title}).${streak > 1 ? ` Your streak is ${streak} days.` : ""}`;
  await addNotification(userId, "system", body);
  if (p?.notify?.levelUps === false) return;
  const email = await emailOf(userId).catch(() => null);
  if (!email) return;
  const appUrl = env().FRONTEND_URL;
  const subject = tone === "sassy" ? `Level ${to}. Main character behaviour.` : `You've reached Level ${to} on Ghosted`;
  const html = layout({
    appUrl, subject, banner: `Level ${from} → Level ${to}`,
    heading: tone === "sassy" ? `${escape(p?.handle ?? "You")}, you levelled up.` : `Congratulations, ${escape(p?.handle ?? "")}.`,
    ...(tone === "sassy" && { tagline: `Level ${to}: ${title}` }),
    intro: tone === "sassy"
      ? `${escape(sassyLine(to))}<br><br>Every story you read, react to and add makes the next candidate's job hunt a little less haunted.${streak > 1 ? ` You're on a <strong>${streak}-day streak</strong>. Don't break it now.` : ""}`
      : `${escape(calmLine(to))}${streak > 1 ? ` You're on a <strong>${streak}-day streak</strong>.` : ""} Your new title is <strong>${escape(title)}</strong>.`,
    preheader: `Level ${to}: ${title}. See what it takes to reach Level ${to + 1}.`,
    body: button(`${appUrl}/dashboard?view=insights`, tone === "sassy" ? "See how to hit the next level" : "See your progress"),
    footnote: "You're getting this because you levelled up on Ghosted. Turn level-up emails off in Settings → Notifications.",
  });
  try { await sendMail(email, { subject, html, text: `You reached Level ${to} (${title}) on Ghosted. See your progress: ${appUrl}/dashboard?view=insights` }, { theme: p?.email_theme ?? "light" }); }
  catch (e) { console.error("[levels] email", (e as Error).message); }
}

// ---------- your level, for the invite page, profile and Insights ----------

const istDay = (d = new Date()) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);

export async function levelFor(userId: string) {
  // streak_freezes comes from the second levels section; before it runs, the first select fails and
  // the fallback without it is used.
  let { data: prof, error: pErr } = await admin().from("profiles").select("xp, level, streak, best_streak, streak_day, streak_freezes").eq("id", userId).maybeSingle();
  if (pErr) ({ data: prof } = await admin().from("profiles").select("xp, level, streak, best_streak, streak_day").eq("id", userId).maybeSingle());
  const p = (prof ?? { xp: 0, level: 1, streak: 0, best_streak: 0, streak_day: null }) as { xp: number; level: number; streak: number; best_streak: number; streak_day: string | null; streak_freezes?: number };
  const today = istDay();
  const yesterday = istDay(new Date(Date.now() - 86400_000));
  const { data: rows } = await admin().from("xp_events").select("kind, xp").eq("user_id", userId).eq("day", today).limit(500);
  const todayRows = (rows ?? []) as { kind: string; xp: number }[];
  const prog = progressOf(p.xp);
  const mult = multiplierFor(prog.level);
  const dayBefore = istDay(new Date(Date.now() - 2 * 86400_000));
  const freezes = p.streak_freezes ?? 0;
  // Alive if active today or yesterday, or the day before with a freeze to cover yesterday.
  const alive = p.streak_day === today || p.streak_day === yesterday || (p.streak_day === dayBefore && freezes > 0);
  const nextMilestone = STREAK_MILESTONES.find(([d]) => d > (alive ? p.streak : 0)) ?? null;
  return {
    xp: p.xp, level: prog.level, title: titleFor(prog.level), nextTitle: titleFor(prog.level + 1),
    into: prog.into, need: prog.need, multiplier: Math.round(mult * 100) / 100,
    streak: alive ? p.streak : 0, bestStreak: p.best_streak, activeToday: p.streak_day === today,
    freezes, freezeMax: FREEZE_MAX, freezeEvery: FREEZE_EVERY, // You missed yesterday but hold a freeze: act today and it covers the gap.
    freezeCovering: alive && p.streak_day !== today && p.streak_day !== yesterday,
    nextMilestone: nextMilestone && { days: nextMilestone[0], xp: Math.max(1, Math.round(nextMilestone[1] * mult)) },
    earnedToday: todayRows.reduce((n, r) => n + r.xp, 0),
    ways: (Object.entries(XP_RULES) as [XpKind, (typeof XP_RULES)[XpKind]][]).filter(([kind]) => kind !== "welcome").map(([kind, r]) => ({
      kind, label: r.label, xp: Math.max(1, Math.round(r.xp * mult)), base: r.xp, cap: r.cap, today: todayRows.filter((x) => x.kind === kind).length,
    })),
    streakBonus: Math.max(1, Math.round((5 + Math.min((alive ? p.streak : 0) + 1, 30)) * mult)),
  };
}

// Levels for a batch of authors (by public id), for story cards. Tolerates the column not existing yet.
export async function levelsFor(publicIds: (number | string)[]) {
  const map = new Map<string, number>();
  if (!publicIds.length) return map;
  const { data, error } = await admin().from("profiles").select("public_id, level").in("public_id", [...new Set(publicIds.map(String))]);
  if (error) return map;
  for (const r of (data ?? []) as { public_id: number; level: number | null }[]) map.set(String(r.public_id), r.level ?? 1);
  return map;
}
