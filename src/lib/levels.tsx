// Levels on the site: the LV badge, the progress bar and your level data (backend/src/levels.ts has
// the rules). XP comes from six things: reading, reacting, chitchatting, sharing your story,
// following, and inviting. Each level needs more XP than the last, and each action pays a little
// less the higher you are, so the top levels really mean something.
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Flame, Snowflake } from "lucide-react";
import { api, apiEnabled } from "@/lib/api";
import { cn, formatCount } from "@/lib/utils";

export type XpKind = "read" | "react" | "chitchat" | "story" | "follow" | "invite_join" | "invite";
export type LevelWay = { kind: XpKind; label: string; xp: number; base: number; cap: number; today: number };
export type MyLevel = {
  xp: number; level: number; title: string; nextTitle: string; into: number; need: number; multiplier: number;
  streak: number; bestStreak: number; activeToday: boolean; earnedToday: number; streakBonus: number;
  // Streak freezes (one per 7 days kept, up to 2) and the next milestone bonus. Missing until the
  // second levels SQL section runs.
  freezes?: number; freezeMax?: number; freezeEvery?: number; freezeCovering?: boolean;
  nextMilestone?: { days: number; xp: number } | null;
  ways: LevelWay[];
  invite: { code: string | null; joined: number; voices: number; stories: number; relatable: number };
};

// One colour per title band, in the site's own palette: accent cream-yellow, the avatar pastels
// (mint, sky, teal, lilac), the brand violet, pink, flag gold, and a red-to-violet gradient for
// Myth. Same as backend/src/levels.ts levelColor (used for share cards).
const BANDS: [number, string, string, string?][] = [
  [1, "#FDF3B4", "#141110"], [3, "#B7EFC5", "#141110"], [6, "#9ED8F7", "#141110"], [10, "#5EE0CB", "#141110"],
  [15, "#C9B8FF", "#141110"], [21, "#7C3AED", "#FFFFFF"], [28, "#EC4899", "#FFFFFF"], [36, "#F5A524", "#141110"],
  [45, "#EF4444", "#FFFFFF", "linear-gradient(135deg, #EF4444, #EC4899 50%, #7C3AED)"],
];
export function levelColor(level: number) {
  const b = [...BANDS].reverse().find(([l]) => level >= l)!;
  return { bg: b[1], fg: b[2], image: b[3] ?? null };
}
// For style={{...}}: the band's solid colour, or Myth's gradient.
export const levelFill = (level: number) => { const c = levelColor(level); return c.image ? { backgroundImage: c.image, color: c.fg } : { background: c.bg, color: c.fg }; };

const TITLES: [number, string][] = [[1, "Fresh face"], [3, "Regular"], [6, "Insider"], [10, "Receipt keeper"], [15, "Veteran"], [21, "Elder"], [28, "Oracle"], [36, "Legend"], [45, "Myth"]];
export const titleFor = (level: number) => [...TITLES].reverse().find(([l]) => level >= l)![1];
export const LEVEL_LADDER = TITLES;

// The badge: "LV 7" in its level's colour, ink border and a hard shadow like the rest of the kit.
export function LevelBadge({ level, size = "md", title, className }: { level: number | null | undefined; size?: "xs" | "sm" | "md" | "lg"; title?: boolean; className?: string }) {
  if (!level) return null;
  return <span title={`Level ${level}: ${titleFor(level)}`} aria-label={`Level ${level}, ${titleFor(level)}`}
    className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border-2 border-foreground font-display font-bold leading-none",
      size === "xs" && "px-1.5 py-0.5 text-[10px] border-[1.5px]", size === "sm" && "px-2 py-0.5 text-xs", size === "md" && "px-2.5 py-1 text-sm shadow-hard-sm", size === "lg" && "px-4 py-1.5 text-xl shadow-hard", className)}
    style={levelFill(level)}>
    LV {level}{title && <span className="font-sans text-[0.8em] font-semibold opacity-80">· {titleFor(level)}</span>}
  </span>;
}

// Progress to the next level, with the XP numbers. The marker is a ball, like every meter here.
export function LevelProgress({ level, into, need, className }: { level: number; into: number; need: number; className?: string }) {
  const pct = Math.min(100, Math.round((into / Math.max(1, need)) * 100));
  const next = levelColor(level + 1);
  return <div className={className}>
    <div className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
      <span><span className="font-bold text-foreground tabular-nums">{formatCount(into)}</span> / {formatCount(need)} XP</span>
      <span>{formatCount(Math.max(0, need - into))} to <span className="font-bold text-foreground">LV {level + 1}</span></span>
    </div>
    <div className="relative mt-1.5 h-3 rounded-full border-2 border-foreground bg-muted">
      <motion.div className="h-full rounded-full" style={{ background: `linear-gradient(90deg, ${levelColor(level).bg}, ${next.bg})` }} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ type: "spring", stiffness: 90, damping: 20 }} />
      <span className="absolute top-1/2 size-4 -translate-y-1/2 rounded-full border-2 border-foreground bg-card" style={{ left: `calc(${pct}% - 8px)` }} />
    </div>
  </div>;
}

export function StreakChip({ streak, activeToday, freezes, className }: { streak: number; activeToday: boolean; freezes?: number | undefined; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1.5", className)}>
    <span title={activeToday ? "You've earned XP today" : "Earn any XP today to keep it"} className={cn("inline-flex items-center gap-1 rounded-full border-2 border-foreground px-2 py-0.5 text-xs font-bold", activeToday ? "bg-flag-amber text-foreground" : "bg-card text-muted-foreground")}>
      <Flame className={cn("size-3.5", activeToday ? "text-flag-red" : "")} />{streak} day{streak === 1 ? "" : "s"}
    </span>
    {!!freezes && <span title={`${freezes} streak ${freezes === 1 ? "freeze" : "freezes"}: covers a missed day automatically`} className="inline-flex items-center gap-1 rounded-full border-2 border-foreground bg-avatar-sky px-2 py-0.5 text-xs font-bold text-foreground"><Snowflake className="size-3.5" />{freezes}</span>}
  </span>;
}

export function useMyLevel(enabled = true) {
  const q = useQuery({ queryKey: ["my-level"], queryFn: () => api<MyLevel>("/v1/me/level"), enabled: apiEnabled && enabled, staleTime: 20_000, retry: false });
  return { data: q.data ?? null, loading: apiEnabled && enabled && q.isPending };
}

// Reading a story: told to the server once the page has been open a few seconds (XP once per story).
const readSent = new Set<string>();
export function markRead(storyId: string) {
  if (!apiEnabled || readSent.has(storyId)) return;
  readSent.add(storyId);
  void api(`/v1/stories/${storyId}/read`, { method: "POST" }).catch(() => readSent.delete(storyId));
}
