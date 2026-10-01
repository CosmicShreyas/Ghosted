// Today's writing prompt: a pseudo-random pick seeded by the viewer's local date, so it's the same all
// day (even across refreshes) and changes at their midnight. Read after mount, since the server's
// date and timezone can differ from the viewer's. Used by the home feed and the sidebar.
import { useEffect, useState } from "react";
import { dashboardPrompts } from "@/mock/data";

function promptForToday() {
  const d = new Date();
  let h = 2166136261;
  for (const ch of `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return dashboardPrompts[(h >>> 0) % dashboardPrompts.length]!;
}

export function useDailyPrompt() {
  const [prompt, setPrompt] = useState<string>(dashboardPrompts[0]);
  useEffect(() => {
    setPrompt(promptForToday());
    // If the tab stays open past midnight, switch to the new day's prompt.
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
    const t = window.setTimeout(() => setPrompt(promptForToday()), midnight + 1000);
    return () => window.clearTimeout(t);
  }, []);
  return prompt;
}
