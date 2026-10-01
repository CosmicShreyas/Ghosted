// Cookie consent (DPDP Act 2023: consent must be free, specific, informed and as easy to withdraw as
// to give). Three choices, remembered for a year in this browser (localStorage and a first-party
// cookie), so it never asks again. "Cookie settings" in the footer reopens it.
//
// Essential cookies (your login session, security, the device id) are needed for the site to work
// and are always on. The only optional category is privacy-friendly usage analytics: anything that
// adds analytics must check consentFor("analytics") first.
import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { Cookie, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Choice = "all" | "necessary" | "declined";
type Stored = { v: 1; choice: Choice; at: string };
const KEY = "ghosted.consent";
const COOKIE = "ghosted_consent";
const YEAR = 365 * 86400;
export const OPEN_COOKIE_SETTINGS = "ghosted:open-cookie-settings";

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const s = JSON.parse(raw) as Stored; if (s?.v === 1 && ["all", "necessary", "declined"].includes(s.choice)) return s; }
  } catch { /* storage blocked: fall back to the cookie */ }
  const m = typeof document !== "undefined" ? document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=(all|necessary|declined)`)) : null;
  return m ? { v: 1, choice: m[1] as Choice, at: "" } : null;
}
function write(choice: Choice) {
  const s: Stored = { v: 1, choice, at: new Date().toISOString() };
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked: the cookie still remembers */ }
  document.cookie = `${COOKIE}=${choice}; max-age=${YEAR}; path=/; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
  window.dispatchEvent(new CustomEvent("ghosted:consent", { detail: choice }));
}

// For optional features: true only after "Accept all".
export const consentFor = (category: "analytics") => category === "analytics" && read()?.choice === "all";
export const openCookieSettings = () => window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS));

// Pages with the phone/tablet dock: the banner sits above it instead of covering it.
const DOCK_PAGES = /^\/(dashboard|u\/|c\/|s\/)/;

export function CookieConsent() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<Choice | null>(null);
  const path = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    const s = read();
    setCurrent(s?.choice ?? null);
    // A first-time visitor sees it after a beat, so it doesn't fight the page for attention.
    const t = s ? undefined : setTimeout(() => setOpen(true), 900);
    const reopen = () => { setCurrent(read()?.choice ?? null); setOpen(true); };
    window.addEventListener(OPEN_COOKIE_SETTINGS, reopen);
    return () => { if (t) clearTimeout(t); window.removeEventListener(OPEN_COOKIE_SETTINGS, reopen); };
  }, []);
  const choose = (c: Choice) => { write(c); setCurrent(c); setOpen(false); };
  const docked = DOCK_PAGES.test(path);

  return <AnimatePresence>
    {open && <motion.div role="dialog" aria-modal="false" aria-labelledby="cookie-title" aria-describedby="cookie-body"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className={cn("fixed inset-x-3 z-[60] mx-auto max-w-md rounded-xl border-2 border-foreground bg-card p-4 shadow-hard sm:inset-x-auto sm:left-4 sm:p-5",
        docked ? "bottom-[calc(max(0.5rem,env(safe-area-inset-bottom))+4.75rem)] lg:bottom-4" : "bottom-[max(0.75rem,env(safe-area-inset-bottom))] sm:bottom-4")}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg border-2 border-foreground bg-accent"><Cookie className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 id="cookie-title" className="font-display text-lg font-bold">Cookies, the boring kind</h2>
          <p id="cookie-body" className="mt-1 text-sm leading-relaxed text-muted-foreground">
            We use essential cookies to keep you signed in and secure; those are always on. With your OK we'd also use privacy-friendly analytics to see which pages help people. No ads, no cross-site tracking. <Link to="/privacy" hash="cookies" className="font-semibold text-foreground underline underline-offset-2">Details</Link>
          </p>
        </div>
        {current && <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-muted"><X className="size-4" /></button>}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto]">
        <Button onClick={() => choose("all")} className={cn("col-span-2 sm:col-span-1", current === "all" && "ring-2 ring-primary ring-offset-2 ring-offset-card")}>Accept all</Button>
        <Button variant="outline" onClick={() => choose("necessary")} className={cn(current === "necessary" && "ring-2 ring-primary ring-offset-2 ring-offset-card")}>Necessary only</Button>
        <Button variant="outline" onClick={() => choose("declined")} className={cn(current === "declined" && "ring-2 ring-primary ring-offset-2 ring-offset-card")}>Decline</Button>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Decline turns off everything optional. Sign-in cookies stay, or logging in wouldn't work. Change this anytime from “Cookie settings” at the bottom of the page.</p>
    </motion.div>}
  </AnimatePresence>;
}
