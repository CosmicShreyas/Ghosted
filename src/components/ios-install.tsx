// Safari on iPhone and iPad has no install prompt (Chrome on Android offers one from the manifest),
// so we show how to do it by hand: Share, then "Add to Home Screen". Only on iOS / iPadOS Safari,
// only when not already installed, and only after the cookie choice is made. It can show once on the
// public site and once inside the dashboard (closing one doesn't hide the other); never again after.
import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Share, SquarePlus, X } from "lucide-react";
import { cn } from "@/lib/utils";

const KEY = "ghosted.ios-install";
export const IOS_INSTALL_EVENT = "ghosted:ios-install";
const DELAY = { site: 20_000, app: 8_000 };
type Where = keyof typeof DELAY;

function isIosSafari() {
  const nav = navigator as Navigator & { standalone?: boolean };
  const ua = nav.userAgent;
  // iPadOS reports itself as a Mac; a real Mac has no multi-touch screen.
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && nav.maxTouchPoints > 1);
  // `navigator.standalone` exists only in Apple's WebKit, and a touch screen rules out desktop Safari.
  const webkitTouch = "standalone" in nav && nav.maxTouchPoints > 0;
  // Chrome, Firefox, Edge, Opera, Google and in-app browsers on iOS can't add to the home screen this way.
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA|Instagram|FBAN|FBAV|LinkedInApp|Line\//.test(ua);
  const installed = nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  return ios && webkitTouch && safari && !installed;
}

function eligible(where: Where) {
  try { return isIosSafari() && !!localStorage.getItem("ghosted.consent") && !localStorage.getItem(`${KEY}.${where}`); } catch { return false; }
}

export function IosInstallHint() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const where: Where = path.startsWith("/dashboard") ? "app" : "site";
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  useEffect(() => {
    setOpen(false);
    if (!eligible(where)) return;
    const t = window.setTimeout(() => setOpen(true), DELAY[where]);
    return () => window.clearTimeout(t);
  }, [where]);
  // Asked to show because notifications need the Home Screen app (components/push-prompt.tsx): opens
  // now, even if the hint was closed before, with copy about notifications.
  const [forPush, setForPush] = useState(false);
  useEffect(() => {
    const show = () => { if (isIosSafari()) { setForPush(true); setOpen(true); } };
    window.addEventListener(IOS_INSTALL_EVENT, show);
    return () => window.removeEventListener(IOS_INSTALL_EVENT, show);
  }, []);
  const dismiss = () => { setOpen(false); setForPush(false); try { localStorage.setItem(`${KEY}.${where}`, "1"); } catch { /* storage blocked */ } };

  return <AnimatePresence>{open && <motion.aside role="dialog" aria-label="Add Ghosted to your home screen"
    initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }} transition={{ type: "spring", stiffness: 320, damping: 30 }}
    // In the dashboard it sits above the bottom navigation bar (phones and tablets).
    className={cn("fixed inset-x-3 z-[55] mx-auto max-w-md rounded-xl border-2 border-foreground bg-card p-4 shadow-hard",
      where === "app" ? "bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] lg:bottom-4" : "bottom-[calc(env(safe-area-inset-bottom)+0.75rem)]")}>
    <div className="flex items-start gap-3">
      <img src="/apple-touch-icon.png" alt="" className="size-12 shrink-0 rounded-xl border-2 border-foreground" />
      <div className="min-w-0 flex-1">
        <p className="font-display text-base font-bold">{forPush ? "Add Ghosted to get notifications" : where === "app" ? "Keep your dashboard one tap away" : "Get Ghosted on your home screen"}</p>
        <p className="mt-1 text-sm text-muted-foreground">{forPush ? "iPhone only sends notifications to Home Screen apps. Add it, open it from there, then turn them on in Settings." : "Opens full screen, like an app."}</p>
      </div>
      <button type="button" onClick={dismiss} aria-label="Not now" className="-m-1 grid size-10 shrink-0 place-items-center rounded-full hover:bg-muted"><X className="size-4" /></button>
    </div>
    <ol className="mt-3 grid gap-2 text-sm">
      <li className="flex items-center gap-2 rounded-lg border-2 border-foreground/15 px-3 py-2">Tap <Share className="size-4 text-primary" aria-label="Share" /> <b>Share</b> in Safari's toolbar</li>
      <li className="flex items-center gap-2 rounded-lg border-2 border-foreground/15 px-3 py-2">Choose <SquarePlus className="size-4 text-primary" aria-hidden="true" /> <b>Add to Home Screen</b></li>
    </ol>
  </motion.aside>}</AnimatePresence>;
}
