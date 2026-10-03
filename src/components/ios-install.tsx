// Safari on iPhone and iPad has no install prompt (Chrome on Android offers one from the manifest),
// so we show how to do it by hand: Share, then "Add to Home Screen". Only in Safari, only when not
// already installed, only after the cookie choice is made, and never again once dismissed.
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Share, SquarePlus, X } from "lucide-react";

const KEY = "ghosted.ios-install";
const DELAY = 20_000;

function eligible() {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch points give it away.
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  // Only Safari can add to the home screen this way; Chrome, Firefox, Edge and in-app browsers on iOS say CriOS/FxiOS/EdgiOS or lack "Safari".
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA|Instagram|FBAN|FBAV|LinkedInApp/.test(ua);
  const installed = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  try { if (localStorage.getItem(KEY) || !localStorage.getItem("ghosted.consent")) return false; } catch { return false; }
  return ios && safari && !installed;
}

export function IosInstallHint() {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!eligible()) return;
    const t = window.setTimeout(() => setOpen(true), DELAY);
    return () => window.clearTimeout(t);
  }, []);
  const dismiss = () => { setOpen(false); try { localStorage.setItem(KEY, "1"); } catch { /* storage blocked */ } };

  return <AnimatePresence>{open && <motion.aside role="dialog" aria-label="Add Ghosted to your home screen"
    initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }} transition={{ type: "spring", stiffness: 320, damping: 30 }}
    className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-[55] mx-auto max-w-md rounded-xl border-2 border-foreground bg-card p-4 shadow-hard">
    <div className="flex items-start gap-3">
      <img src="/apple-touch-icon.png" alt="" className="size-12 shrink-0 rounded-xl border-2 border-foreground" />
      <div className="min-w-0 flex-1">
        <p className="font-display text-base font-bold">Get Ghosted on your home screen</p>
        <p className="mt-1 text-sm text-muted-foreground">Opens full screen, like an app.</p>
      </div>
      <button type="button" onClick={dismiss} aria-label="Not now" className="-m-1 grid size-10 shrink-0 place-items-center rounded-full hover:bg-muted"><X className="size-4" /></button>
    </div>
    <ol className="mt-3 grid gap-2 text-sm">
      <li className="flex items-center gap-2 rounded-lg border-2 border-foreground/15 px-3 py-2">Tap <Share className="size-4 text-primary" aria-label="Share" /> <b>Share</b> in Safari's toolbar</li>
      <li className="flex items-center gap-2 rounded-lg border-2 border-foreground/15 px-3 py-2">Choose <SquarePlus className="size-4 text-primary" aria-hidden="true" /> <b>Add to Home Screen</b></li>
    </ol>
  </motion.aside>}</AnimatePresence>;
}
