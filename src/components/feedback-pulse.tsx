// "How's Ghosted treating you?": a small check-in card, every so often, never in the way.
//
// When it appears: not in your first 3 days, only after 45 s on the dashboard, only while the tab
// is visible and nothing else (a dialog, the cookie banner) is open.
// How often: answering earns 21 quiet days. "Not now" waits 5 days, then 10, then 20 (it backs off
// every time). "Don't ask again" means at most twice a year. Remembered in this browser.
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { Angry, Bug, Code2, Frown, Heart, Laugh, Loader2, Meh, Send, Smile, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { submitFeedback } from "@/lib/feedback";
import { useTone, voice } from "@/lib/session";
import { cn } from "@/lib/utils";

const KEY = "ghosted.pulse";
const DAY = 86400_000;
type State = { firstSeen: number; next: number; snoozes: number };
const read = (): State => {
  try { const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as State | null; if (s && typeof s.next === "number") return s; } catch { /* storage blocked */ }
  const now = Date.now();
  return { firstSeen: now, next: now + 3 * DAY, snoozes: 0 };
};
const write = (s: State) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked */ } };

const FACES: { n: number; icon: LucideIcon; label: string }[] = [
  { n: 1, icon: Angry, label: "Awful" }, { n: 2, icon: Frown, label: "Not great" }, { n: 3, icon: Meh, label: "Okay" }, { n: 4, icon: Smile, label: "Good" }, { n: 5, icon: Laugh, label: "Love it" },
];

export function FeedbackPulse() {
  const tone = useTone();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const s = read();
    write(s); // remember the first visit
    if (Date.now() < s.next) return;
    // Wait for 45 s of the dashboard being on screen, then only if nothing else is open.
    let visible = 0;
    const t = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      visible += 5;
      if (visible < 45) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      setOpen(true);
      window.clearInterval(t);
    }, 5000);
    return () => window.clearInterval(t);
  }, []);

  const later = (days: number, resetSnoozes = false) => {
    const s = read();
    write({ ...s, next: Date.now() + days * DAY, snoozes: resetSnoozes ? 0 : s.snoozes + 1 });
  };
  const notNow = () => { const s = read(); later(Math.min(30, 5 * 2 ** s.snoozes)); setOpen(false); };
  const never = () => { later(180); setOpen(false); };
  const pick = (n: number) => { setRating(n); later(21, true); void submitFeedback({ kind: "pulse", rating: n }).catch(() => undefined); };
  const send = async () => {
    if (!rating || !note.trim()) { setDone(true); return; }
    setBusy(true);
    try { await submitFeedback({ kind: "pulse", rating, body: note.trim().slice(0, 4000) }); } catch { /* the rating already went in */ }
    setBusy(false); setDone(true);
  };
  const happy = (rating ?? 0) >= 4;

  return <AnimatePresence>
    {open && <motion.div role="dialog" aria-label="Quick feedback" aria-modal="false" initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24 }} transition={{ type: "spring", stiffness: 260, damping: 24 }}
      className="fixed inset-x-3 bottom-[calc(max(0.5rem,env(safe-area-inset-bottom))+4.75rem)] z-[55] mx-auto max-w-sm rounded-xl border-2 border-foreground bg-card p-4 shadow-hard sm:inset-x-auto sm:right-4 lg:bottom-4">
      <button type="button" onClick={rating ? () => setOpen(false) : notNow} aria-label="Close" className="absolute right-2 top-2 grid size-7 place-items-center rounded-md hover:bg-muted"><X className="size-4" /></button>
      <AnimatePresence mode="wait" initial={false}>
        {!rating ? <motion.div key="ask" exit={{ opacity: 0, x: -12 }}>
          <p className="pr-6 font-display text-lg font-bold">{voice(tone, "Quick one: how's Ghosted treating you?", "How is Ghosted working for you?")}</p>
          <p className="text-xs text-muted-foreground">One tap. We read every answer.</p>
          <div className="mt-3 grid grid-cols-5 gap-1.5">{FACES.map((f) => <motion.button key={f.n} type="button" whileHover={{ y: -2 }} whileTap={{ scale: 0.9 }} onClick={() => pick(f.n)} aria-label={f.label}
            className="group flex flex-col items-center gap-1 rounded-lg border-2 border-foreground/15 py-2 transition-colors hover:border-foreground hover:bg-accent">
            <f.icon className={cn("size-6", f.n <= 2 ? "text-flag-red" : f.n === 3 ? "text-flag-amber" : "text-flag-green")} /><span className="text-[10px] font-semibold text-muted-foreground group-hover:text-foreground">{f.label}</span>
          </motion.button>)}</div>
          <div className="mt-3 flex items-center justify-between text-xs"><button type="button" onClick={notNow} className="font-semibold text-muted-foreground hover:text-foreground">Not now</button><button type="button" onClick={never} className="text-muted-foreground hover:text-foreground">Don't ask again</button></div>
        </motion.div> : done ? <motion.div key="done" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="text-center">
          <Heart className="mx-auto size-8 fill-flag-red text-foreground" />
          <p className="mt-2 font-display text-lg font-bold">{voice(tone, "Thanks! That genuinely helps.", "Thank you, that helps.")}</p>
          {happy ? <div className="mt-3 grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline" asChild><Link to="/feedback" hash="build" onClick={() => setOpen(false)}><Code2 />Contribute</Link></Button>
            <Button size="sm" asChild><Link to="/feedback" hash="back" onClick={() => setOpen(false)}><Heart />Support us</Link></Button>
          </div> : <Button size="sm" variant="outline" className="mt-3" asChild><Link to="/feedback" search={{ type: "bug" }} onClick={() => setOpen(false)}><Bug />Report a bug in detail</Link></Button>}
          <button type="button" onClick={() => setOpen(false)} className="mt-3 block w-full text-xs font-semibold text-muted-foreground hover:text-foreground">Close</button>
        </motion.div> : <motion.div key="more" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}>
          <p className="pr-6 font-display text-lg font-bold">{happy ? voice(tone, "Love that. What's the best bit?", "Glad to hear it. What do you like most?") : voice(tone, "Ouch. What should we fix first?", "Sorry about that. What should we improve?")}</p>
          <Textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 600))} rows={3} autoFocus placeholder={happy ? "The Waiting Room timer, Goofy's comebacks…" : "Search didn't find my company, the feed felt…"} className="mt-2 rounded-lg border-2 border-foreground bg-background text-sm" />
          <div className="mt-2 flex items-center justify-between gap-2">
            <button type="button" onClick={() => setDone(true)} className="text-xs font-semibold text-muted-foreground hover:text-foreground">Skip</button>
            <Button size="sm" onClick={() => void send()} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Send />}Send</Button>
          </div>
        </motion.div>}
      </AnimatePresence>
    </motion.div>}
  </AnimatePresence>;
}
