import { useEffect, useState } from "react";

const SAVED_KEY = "ghosted.saved";

// Saved stories: a per-browser list of story ids, shared by the dashboard and people pages.
export function useSaved() {
  const [saved, setSaved] = useState<Set<string>>(new Set());
  useEffect(() => {
    try { setSaved(new Set(JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]") as string[])); } catch { /* storage blocked */ }
  }, []);
  const toggle = (id: string) => setSaved((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    try { localStorage.setItem(SAVED_KEY, JSON.stringify([...next])); } catch { /* storage blocked */ }
    return next;
  });
  return [saved, toggle] as const;
}
