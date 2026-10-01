import { useSyncExternalStore } from "react";

// Per-device preferences (appearance, notification choices). Kept in localStorage because they
// describe this browser, not the account; nothing sensitive lives here.
export type Theme = "system" | "light" | "dark";
export type Prefs = {
  reduceMotion: boolean;
  // Light, dark ("after hours"), or follow the device. Applied to <html> by lib/theme.ts.
  theme: Theme;
  tone: "sassy" | "calm";
  notify: { relatable: boolean; chitchatReplies: boolean; flaggedCompanies: boolean; weeklyDigest: boolean };
};

const KEY = "ghosted.prefs";
const DEFAULTS: Prefs = { reduceMotion: false, theme: "system", tone: "sassy", notify: { relatable: true, chitchatReplies: true, flaggedCompanies: false, weeklyDigest: true } };
const listeners = new Set<() => void>();
let cache: Prefs | null = null;

function read(): Prefs {
  if (cache) return cache;
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Prefs>;
    cache = { ...DEFAULTS, ...stored, notify: { ...DEFAULTS.notify, ...stored.notify } };
  } catch { cache = DEFAULTS; }
  return cache;
}

export function setPrefs(patch: Partial<Prefs>) {
  const next = { ...read(), ...patch, notify: { ...read().notify, ...patch.notify } };
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, read, () => DEFAULTS);
}
