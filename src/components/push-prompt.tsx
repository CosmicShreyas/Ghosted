// The "turn on notifications?" card. It never appears on first load: only right after you track an
// application in the Waiting Room or follow a company (askForPush in lib/push.ts), and only when
// notifications are off on this device. "Not now" waits two weeks before asking again. On iPhone in
// Safari it shows the Add to Home Screen hint instead, since iOS only notifies Home Screen apps.
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BellRing, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { IOS_INSTALL_EVENT } from "@/components/ios-install";
import { PUSH_ASK_EVENT, usePush, type PushReason } from "@/lib/push";
import { useTone, voice } from "@/lib/session";

const SNOOZE = "ghosted.push-ask";
const SNOOZE_DAYS = 14;
const snoozed = () => { try { return Number(localStorage.getItem(SNOOZE) ?? 0) > Date.now(); } catch { return false; } };

export function PushPrompt() {
  const push = usePush({ auto: false });
  const tone = useTone();
  const reduce = useReducedMotion();
  const [reason, setReason] = useState<PushReason | null>(null);

  useEffect(() => {
    const ask = (e: Event) => {
      if (snoozed()) return;
      const why = (e as CustomEvent<PushReason>).detail;
      void push.refresh().then((s) => {
        if (s === "off") setReason(why);
        else if (s === "ios-install") window.dispatchEvent(new Event(IOS_INSTALL_EVENT));
      });
    };
    window.addEventListener(PUSH_ASK_EVENT, ask);
    return () => window.removeEventListener(PUSH_ASK_EVENT, ask);
  }, [push.refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const later = () => { setReason(null); try { localStorage.setItem(SNOOZE, String(Date.now() + SNOOZE_DAYS * 86400_000)); } catch { /* storage blocked */ } };
  const turnOn = async () => {
    try {
      if (await push.enable()) { toast.success(voice(tone, "Done. We'll buzz you when it matters, never at night.", "Notifications are on for this device.")); setReason(null); }
      else later();
    } catch { toast.error("Couldn't turn on notifications. Try again from Settings."); setReason(null); }
  };

  const copy = reason === "waiting"
    ? { title: voice(tone, "Want a nudge on day 7 and day 14?", "Get follow-up reminders?"), body: voice(tone, "We'll tell you when it's time for a polite follow-up, so you don't have to count the days of silence yourself.", "We'll remind you on day 7 and day 14 if you haven't heard back, so you know when to follow up.") }
    : { title: voice(tone, "Hear the tea first?", "Get notified about new stories?"), body: voice(tone, "We'll ping you when someone shares a new story about the companies you follow.", "We'll notify you when a new story is shared about companies you follow.") };

  return <AnimatePresence>{reason && <motion.aside role="dialog" aria-label="Turn on notifications"
    initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }} transition={{ type: "spring", stiffness: 320, damping: 30 }}
    className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[55] mx-auto max-w-md rounded-xl border-2 border-foreground bg-card p-4 shadow-hard lg:bottom-4">
    <div className="flex items-start gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-foreground bg-accent"><BellRing className="size-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-base font-bold">{copy.title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{copy.body} Nothing between 9 PM and 8 AM.</p>
      </div>
      <button type="button" onClick={later} aria-label="Not now" className="-m-1 grid size-10 shrink-0 place-items-center rounded-full hover:bg-muted"><X className="size-4" /></button>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2">
      <Button variant="outline" className="min-h-11" onClick={later} disabled={push.busy}>Not now</Button>
      <Button className="min-h-11" onClick={() => void turnOn()} disabled={push.busy}>{push.busy ? <Loader2 className="animate-spin" /> : <BellRing />}Turn on</Button>
    </div>
  </motion.aside>}</AnimatePresence>;
}
