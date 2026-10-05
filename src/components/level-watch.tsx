// Feedback for XP, while you use the site: a small "+N XP" toast whenever your total goes up, and a
// celebration when you reach a new level (also if it happened on another device or while you were
// away: the last level you saw is remembered in this browser). Your level refreshes live through
// the "me" topic (lib/session.ts), so this only compares what it sees.
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { usePrefs } from "@/lib/prefs";
import { Share2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { levelColor, levelFill, titleFor, useMyLevel } from "@/lib/levels";
import { useMe, useTone, voice } from "@/lib/session";

const SEEN = "ghosted.level-seen";
const readSeen = () => { try { return Number(localStorage.getItem(SEEN) ?? 0); } catch { return 0; } };
const writeSeen = (l: number) => { try { localStorage.setItem(SEEN, String(l)); } catch { /* storage blocked */ } };

export function LevelWatch() {
  const { signedIn, me } = useMe();
  const tone = useTone();
  // The confetti follows Settings → Reduce motion as well as the device setting.
  const reduce = usePrefs().reduceMotion || (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const { data } = useMyLevel(signedIn);
  const lastXp = useRef<number | null>(null);
  const [celebrate, setCelebrate] = useState<{ from: number; to: number } | null>(null);

  useEffect(() => {
    if (!data) return;
    // "+N XP" for anything earned while the page is open.
    if (lastXp.current != null && data.xp > lastXp.current) {
      const gain = data.xp - lastXp.current;
      toast(`+${gain} XP`, { description: data.activeToday && data.streak > 1 ? `${data.streak}-day streak` : `${Math.max(0, data.need - data.into)} XP to LV ${data.level + 1}`, duration: 2500 });
    }
    lastXp.current = data.xp;
    // A new level since you last looked. The first visit just records where you are.
    const seen = readSeen();
    if (!seen) writeSeen(data.level);
    else if (data.level > seen) { setCelebrate({ from: seen, to: data.level }); writeSeen(data.level); }
  }, [data]);

  if (!celebrate) return null;
  const to = celebrate.to;
  const shareLevel = async () => {
    const url = `${window.location.origin}/u/${me.publicId}`;
    try {
      if (navigator.share && window.matchMedia("(pointer: coarse)").matches) await navigator.share({ title: `I'm LV ${to} on Ghosted`, text: `LV ${to}, ${titleFor(to)}. Receipts, not résumés.`, url });
      else { await navigator.clipboard.writeText(url); toast.success("Profile link copied. Its preview shows your new badge."); }
    } catch (e) { if ((e as Error).name !== "AbortError") toast.error("Couldn't copy the link."); }
  };
  const confetti = ["#7C3AED", "#F5A524", "#22C55E", "#EC4899", "#5EE0CB", levelColor(to).bg];

  return <Dialog open onOpenChange={(v) => { if (!v) setCelebrate(null); }}>
    <DialogContent className="w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-2xl border-2 border-foreground bg-card p-6 text-center shadow-hard">
      <div className="relative mx-auto mt-2 grid size-32 place-items-center">
        {!reduce && confetti.flatMap((c, i) => [0, 1].map((k) => { const a = ((i * 2 + k) / 12) * Math.PI * 2; return <motion.span key={`${i}-${k}`} className="absolute size-2.5 rounded-full" style={{ background: c }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }} animate={{ x: Math.cos(a) * 110, y: Math.sin(a) * 110, opacity: 0, scale: 0.6 }} transition={{ duration: 1.1, delay: 0.2, ease: "easeOut" }} />; }))}
        <motion.div initial={reduce ? { opacity: 0 } : { scale: 0.3, rotate: -20, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 240, damping: 13 }}
          className="grid size-28 place-items-center rounded-full border-[3px] border-foreground font-display text-5xl font-bold shadow-hard" style={levelFill(to)}>{to}</motion.div>
      </div>
      <DialogTitle className="mt-4 font-display text-3xl">Level {to}</DialogTitle>
      <DialogDescription className="mt-1 text-base">
        <span className="block font-bold text-foreground">{titleFor(to)}</span>
        {voice(tone, "Look at you, actually showing up. Recruiters could never.", "Thanks for being an active part of Ghosted.")}
      </DialogDescription>
      <div className="mt-6 grid grid-cols-2 gap-2">
        <Button variant="outline" className="min-h-11" onClick={() => void shareLevel()}><Share2 />Show it off</Button>
        <Button className="min-h-11" asChild><Link to="/dashboard" search={{ view: "insights" }} onClick={() => setCelebrate(null)}><TrendingUp />What's next</Link></Button>
      </div>
    </DialogContent>
  </Dialog>;
}
