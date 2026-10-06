// Read first, join later: a signed-out visitor can read as much as they like. After 5 minutes of
// actual reading (the tab visible; counted across pages and visits in this browser) the join prompt
// appears once; if they keep reading, it comes back after another 3 minutes. Never for signed-in
// members, never in preview mode.
import { useEffect } from "react";
import { apiEnabled, NEED_ACCOUNT_EVENT } from "@/lib/api";
import { readingTime } from "@/lib/guest";
import { useMe } from "@/lib/session";
import { READING_REASON } from "./public-shell";

const FIRST = 300, AGAIN = 180, TICK = 5;

export function ReadingGate() {
  const { signedOut } = useMe();
  useEffect(() => {
    if (!apiEnabled || !signedOut) return;
    const t = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const s = readingTime.get() + TICK;
      if (s >= FIRST) {
        readingTime.set(FIRST - AGAIN); // next prompt after AGAIN more seconds
        window.dispatchEvent(new CustomEvent(NEED_ACCOUNT_EVENT, { detail: READING_REASON }));
      } else readingTime.set(s);
    }, TICK * 1000);
    return () => window.clearInterval(t);
  }, [signedOut]);
  return null;
}
