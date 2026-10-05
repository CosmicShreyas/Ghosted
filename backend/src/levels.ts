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

export type XpKind = "read" | "react" | "chitchat" | "story" | "follow" | "invite_join" | "invite";
// Base XP and how many times a day each pays. Shown on the invite page and Insights (/v1/me/level).
export const XP_RULES: Record<XpKind, { xp: number; cap: number; label: string }> = {
  read: { xp: 2, cap: 15, label: "Read a story" },
  react: { xp: 4, cap: 10, label: "React to a story" },
  chitchat: { xp: 10, cap: 6, label: "Leave a chitchat" },
  story: { xp: 50, cap: 2, label: "Share your story" },
  follow: { xp: 5, cap: 6, label: "Follow a company or person" },
  invite_join: { xp: 30, cap: 5, label: "Someone joins with your invite" },
  invite: { xp: 120, cap: 5, label: "Someone you invited shares a story" },
};

// Same curve as level_for_xp() in SQL.
export const stepFor = (level: number) => Math.round(100 * Math.pow(level, 1.5));
export function progressOf(xp: number) {
  let level = 1, floor = 0;
  while (level < 99 && xp >= floor + stepFor(level)) { floor += stepFor(level); level++; }
  return { level, into: xp - floor, need: stepFor(level), floor };
}
export const multiplierFor = (level: number) => 1 / (1 + 0.1 * (level - 1));

// Badge colour: pale yellow at level 1, through gold, amber, orange and coral, to deep red by
// level 40. Same formula as src/lib/levels.tsx.
export function levelColor(level: number) {
  const t = Math.min(1, Math.max(0, (level - 1) / 39));
  const hue = Math.round(56 - 56 * t);           // 56 yellow → 0 red
  const light = Math.round(84 - 40 * t);         // 84% pale → 44% deep
  const sat = Math.round(92 - 12 * t);
  return { bg: `hsl(${hue} ${sat}% ${light}%)`, fg: light > 60 ? "#141110" : "#FFFFFF" };
}

// Seniority titles, every few levels.
const TITLES: [number, string][] = [[1, "Fresh face"], [3, "Regular"], [6, "Insider"], [10, "Receipt keeper"], [15, "Veteran"], [21, "Elder"], [28, "Oracle"], [36, "Legend"], [45, "Myth"]];
export const titleFor = (level: number) => [...TITLES].reverse().find(([l]) => level >= l)![1];

type Award = { awarded: number; bonus?: number; xp?: number; level?: number; from_level?: number; streak?: number; reason?: string };

// Best effort and never blocks the action that earned it.
export function award(userId: string, kind: XpKind, ref: string) {
  later((async () => {
    const r = XP_RULES[kind];
    const { data, error } = await admin().rpc("award_xp", { p_user: userId, p_kind: kind, p_ref: ref.slice(0, 80), p_base: r.xp, p_cap: r.cap });
    if (error) { if (!/award_xp/.test(error.message)) console.error("[levels] award", error.message); return; }
    const a = data as Award;
    if (!a?.awarded) return;
    await bump({ user: userId, topics: ["me"] });
    if (a.level && a.from_level && a.level > a.from_level) await levelledUp(userId, a.from_level, a.level, a.streak ?? 0);
  })().catch((e: Error) => console.error("[levels]", e.message)));
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
  const { data: prof } = await admin().from("profiles").select("xp, level, streak, best_streak, streak_day").eq("id", userId).maybeSingle();
  const p = (prof ?? { xp: 0, level: 1, streak: 0, best_streak: 0, streak_day: null }) as { xp: number; level: number; streak: number; best_streak: number; streak_day: string | null };
  const today = istDay();
  const yesterday = istDay(new Date(Date.now() - 86400_000));
  const { data: rows } = await admin().from("xp_events").select("kind, xp").eq("user_id", userId).eq("day", today).limit(500);
  const todayRows = (rows ?? []) as { kind: string; xp: number }[];
  const prog = progressOf(p.xp);
  const mult = multiplierFor(prog.level);
  const alive = p.streak_day === today || p.streak_day === yesterday;
  return {
    xp: p.xp, level: prog.level, title: titleFor(prog.level), nextTitle: titleFor(prog.level + 1),
    into: prog.into, need: prog.need, multiplier: Math.round(mult * 100) / 100,
    streak: alive ? p.streak : 0, bestStreak: p.best_streak, activeToday: p.streak_day === today,
    earnedToday: todayRows.reduce((n, r) => n + r.xp, 0),
    ways: (Object.entries(XP_RULES) as [XpKind, (typeof XP_RULES)[XpKind]][]).map(([kind, r]) => ({
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
