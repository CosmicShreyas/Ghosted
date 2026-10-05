// Your level, wherever it helps you climb:
//   LevelCard    dashboard home: badge, progress to the next level, streak, and the best next move
//   LevelGuide   Insights: the full picture, today's XP checklist (what's left, worth how much),
//                streak advice and the ladder ahead
// Rules live on the server (backend/src/levels.ts); this only shows what /v1/me/level returns.
import { Link, useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import { BookOpen, Check, ChevronRight, Flame, Gift, HeartHandshake, MessageCircle, PenLine, Snowflake, TrendingUp, UserPlus, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LEVEL_LADDER, LevelBadge, LevelProgress, StreakChip, levelColor, useMyLevel, type LevelWay, type MyLevel, type XpKind } from "@/lib/levels";
import { useTone, voice } from "@/lib/session";
import { cn, formatCount } from "@/lib/utils";
import { card } from "./ui-kit";

type Way = { id: XpKind; icon: LucideIcon; label: string; how: string; go: "share" | "home" | "companies" | "invite" };
// The six ways to earn, in the order people usually discover them. Inviting pays twice: when they
// join and when they share their first story.
const WAYS: Way[] = [
  { id: "read", icon: BookOpen, label: "Read stories", how: "Open a story and read it", go: "home" },
  { id: "react", icon: HeartHandshake, label: "React", how: "Relatable, eye-opening, with you…", go: "home" },
  { id: "chitchat", icon: MessageCircle, label: "Chitchat", how: "Add what you know under a story", go: "home" },
  { id: "story", icon: PenLine, label: "Share your story", how: "A quick one takes about 30 seconds", go: "share" },
  { id: "follow", icon: UserPlus, label: "Follow", how: "A company or a person", go: "companies" },
  { id: "invite", icon: Gift, label: "Invite a friend", how: "More when they join, the most when they share", go: "invite" },
];

const way = (d: MyLevel, k: XpKind) => d.ways.find((w) => w.kind === k);
const left = (w: LevelWay | undefined) => (w ? Math.max(0, w.cap - w.today) : 0);

// The single most valuable thing still open today.
function bestMove(d: MyLevel) {
  const scored = WAYS.filter((w) => w.id !== "invite").map((w) => ({ w, data: way(d, w.id) })).filter((x) => left(x.data) > 0).sort((a, b) => b.data!.xp - a.data!.xp);
  return scored[0] ?? null;
}

function useGo(onShare?: () => void) {
  const navigate = useNavigate();
  return (go: Way["go"]) => {
    if (go === "share") return onShare?.();
    if (go === "invite") return void navigate({ to: "/invite" });
    void navigate({ to: "/dashboard", search: { view: go } });
    window.scrollTo({ top: 0 });
  };
}

function streakLine(d: MyLevel, tone: "sassy" | "calm") {
  if (d.freezeCovering) return voice(tone, `You skipped yesterday, but a streak freeze has your back. Do one thing today and your ${d.streak}-day streak lives.`, `You missed yesterday. Earn XP today and a streak freeze keeps your ${d.streak}-day streak.`);
  if (d.activeToday) return voice(tone, `Streak safe for today. Come back tomorrow for +${d.streakBonus} XP.`, `Today counts. Tomorrow's first action adds a ${d.streakBonus} XP streak bonus.`);
  if (d.streak > 0) return voice(tone, `${d.streak}-day streak on the line. One action today keeps it, plus a +${d.streakBonus} XP bonus.`, `Do anything that earns XP today to keep your ${d.streak}-day streak (+${d.streakBonus} XP bonus).`);
  return voice(tone, `Start a streak today: your first action pays a +${d.streakBonus} XP bonus.`, `Your first action today starts a streak and adds ${d.streakBonus} XP.`);
}

// Freezes held, the next one, and the next milestone, in one line.
function d2(d: MyLevel, tone: "sassy" | "calm") {
  if (d.freezes == null) return null;
  const every = d.freezeEvery ?? 7, max = d.freezeMax ?? 2;
  const nextFreeze = d.freezes >= max ? null : every - (d.streak % every);
  const parts = [
    d.freezes ? `${d.freezes} ${d.freezes === 1 ? "freeze" : "freezes"} in the bank` : null,
    nextFreeze ? `${nextFreeze} more ${nextFreeze === 1 ? "day" : "days"} earns ${d.freezes ? "another" : "a"} freeze` : null,
    d.nextMilestone ? `day ${d.nextMilestone.days} pays a +${d.nextMilestone.xp} XP milestone bonus` : null,
  ].filter(Boolean);
  if (!parts.length) return null;
  const s = parts.join(", ");
  return voice(tone, `${s[0]!.toUpperCase()}${s.slice(1)}. Don't fumble it.`, `${s[0]!.toUpperCase()}${s.slice(1)}.`);
}

export function LevelCard({ onShare }: { onShare: () => void }) {
  const tone = useTone();
  const { data } = useMyLevel();
  const go = useGo(onShare);
  if (!data) return null;
  const move = bestMove(data);
  return <section className={cn(card, "p-4 sm:p-5")}>
    <div className="flex flex-wrap items-center gap-3">
      <LevelBadge level={data.level} size="lg" />
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-xl font-bold leading-tight">{data.title}</h2>
        <p className="text-xs text-muted-foreground">{formatCount(data.xp)} XP total · {formatCount(data.earnedToday)} today</p>
      </div>
      <StreakChip streak={data.streak} activeToday={data.activeToday} freezes={data.freezes} />
    </div>
    <LevelProgress className="mt-4" level={data.level} into={data.into} need={data.need} />
    <p className="mt-2 text-xs text-muted-foreground">{streakLine(data, tone)}</p>
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {move && <Button className="min-h-11 justify-between" onClick={() => go(move.w.go)}><span className="flex items-center gap-2"><move.w.icon />{move.w.label}</span><span className="rounded-full bg-primary-foreground/20 px-2 text-xs">+{move.data!.xp} XP</span></Button>}
      <Button variant="outline" className="min-h-11 justify-between" asChild><Link to="/invite"><span className="flex items-center gap-2"><Gift />Invite a friend</span><span className="text-xs text-muted-foreground">+{way(data, "invite")?.xp ?? 0} XP</span></Link></Button>
    </div>
    <Link to="/dashboard" search={{ view: "insights" }} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">Everything you can do today<ChevronRight className="size-3.5" /></Link>
  </section>;
}

// Insights: your own numbers, and exactly what gets you to the next level.
export function LevelGuide({ onShare }: { onShare?: () => void }) {
  const tone = useTone();
  const { data, loading } = useMyLevel();
  const go = useGo(onShare);
  if (loading) return <div className={cn(card, "space-y-3 p-5")} role="status" aria-label="Loading your level"><div className="skeleton h-5 w-40" /><div className="skeleton h-3 w-full rounded-full" /><div className="grid gap-2 sm:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-16" />)}</div></div>;
  if (!data) return null;
  const remaining = Math.max(0, data.need - data.into);
  // What's still on the table today, best first, and roughly how many of the best move it takes.
  const open = WAYS.map((w) => ({ w, d: way(data, w.id === "invite" ? "invite" : w.id) })).filter((x) => x.d);
  const todayLeftXp = open.filter((x) => x.w.id !== "invite").reduce((n, x) => n + left(x.d) * x.d!.xp, 0);
  const move = bestMove(data);
  const ahead = LEVEL_LADDER.filter(([l]) => l > data.level).slice(0, 3);
  const pct = data.multiplier < 1 ? Math.round((1 - data.multiplier) * 100) : 0;

  return <section className={cn(card, "p-5 sm:p-6")} aria-label="Your level">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 font-display text-xl font-bold"><TrendingUp className="size-5 text-primary" />You, on Ghosted</h3>
        <p className="text-xs text-muted-foreground">Only you see this. Your level badge is public, your XP isn't.</p>
      </div>
      <div className="flex items-center gap-2"><LevelBadge level={data.level} size="md" title /><StreakChip streak={data.streak} activeToday={data.activeToday} freezes={data.freezes} /></div>
    </div>

    <LevelProgress className="mt-4" level={data.level} into={data.into} need={data.need} />

    {/* Three quick numbers. */}
    <dl className="mt-4 grid grid-cols-3 gap-2">
      {([["To next level", `${formatCount(remaining)} XP`], ["Earned today", `${formatCount(data.earnedToday)} XP`], ["Best streak", `${data.bestStreak} ${data.bestStreak === 1 ? "day" : "days"}`]] as const).map(([k, v]) => <div key={k} className="rounded-lg border-2 border-foreground/15 p-2.5 sm:p-3">
        <dt className="text-[11px] font-semibold text-muted-foreground">{k}</dt><dd className="font-display text-lg font-bold tabular-nums sm:text-xl">{v}</dd></div>)}
    </dl>

    {/* The advice, in one or two sentences. */}
    <div className="mt-4 rounded-lg border-2 border-foreground bg-accent p-3 text-sm">
      <p className="flex items-start gap-2 font-semibold"><Flame className="mt-0.5 size-4 shrink-0 text-flag-red" />{streakLine(data, tone)}</p>
      {/* Freezes and the next milestone: the two reasons not to break the chain. */}
      {d2(data, tone) && <p className="mt-1.5 flex items-start gap-2 pl-0.5 text-muted-foreground"><Snowflake className="mt-0.5 size-4 shrink-0 text-sky-600 dark:text-sky-300" />{d2(data, tone)}</p>}
      {move && <p className="mt-1.5 pl-6 text-muted-foreground">{voice(tone,
        `Fastest win right now: ${move.w.label.toLowerCase()} for +${move.data!.xp} XP. ${todayLeftXp >= remaining ? "You could hit the next level today." : `There's about ${formatCount(todayLeftXp)} XP left on the table today.`}`,
        `Best next step: ${move.w.label.toLowerCase()} (+${move.data!.xp} XP). ${todayLeftXp >= remaining ? "You can reach the next level today." : `About ${formatCount(todayLeftXp)} XP is still available today.`}`)}</p>}
    </div>

    {/* Today's checklist: every way to earn, how much it pays at your level, and what's left today. */}
    <ul className="mt-4 grid gap-2 sm:grid-cols-2">{open.map(({ w, d }) => {
      const done = left(d) === 0;
      const extra = w.id === "invite" ? way(data, "invite_join") : null;
      return <li key={w.id}><button type="button" onClick={() => go(w.go)} disabled={done && w.id !== "invite"} className={cn("flex min-h-14 w-full items-center gap-3 rounded-lg border-2 p-2.5 text-left transition-colors", done ? "border-flag-green/40 bg-flag-green/10" : "border-foreground/15 hover:border-foreground")}>
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-full border-2", done ? "border-flag-green bg-flag-green text-primary-foreground" : "border-foreground bg-accent")}>{done ? <Check className="size-4" /> : <w.icon className="size-4" />}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">{w.label}</span>
          <span className="block truncate text-xs text-muted-foreground">{done ? "Maxed out for today" : w.id === "invite" ? `+${extra?.xp ?? 0} when they join, +${d!.xp} when they share` : `${d!.today} of ${d!.cap} today · ${w.how}`}</span>
        </span>
        <span className="shrink-0 rounded-full border-2 border-foreground bg-card px-2 py-0.5 text-xs font-bold tabular-nums">+{d!.xp}</span>
      </button></li>;
    })}</ul>

    {/* Why it gets harder, said honestly, and what's ahead. */}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t-2 border-foreground/10 pt-4">
      <p className="min-w-0 flex-1 basis-64 text-xs text-muted-foreground">{pct > 0 ? voice(tone, `At LV ${data.level}, actions pay ${pct}% less than they did at LV 1, and each level needs more XP. Seniority is earned, not farmed.`, `At level ${data.level}, each action earns ${pct}% less XP than at level 1, and each level needs more XP than the last.`) : "Each level needs more XP than the last, and actions pay a little less as you climb. The early levels come fast."}</p>
      {ahead.length > 0 && <div className="flex flex-wrap items-center gap-1.5">{ahead.map(([l, t]) => <motion.span key={l} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-1 rounded-full border-2 border-foreground/20 px-2 py-0.5 text-[11px] font-bold" style={{ boxShadow: `inset 0 -4px 0 ${levelColor(l).bg}` }}>LV {l} · {t}</motion.span>)}</div>}
    </div>
  </section>;
}
