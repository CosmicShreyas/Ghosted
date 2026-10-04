import { useSyncExternalStore } from "react";

// Per-device preferences (appearance, notification choices). Kept in localStorage because they
// describe this browser, not the account; nothing sensitive lives here.
export type Theme = "system" | "light" | "dark";
export type Prefs = {
  reduceMotion: boolean;
  // Light, dark ("after hours"), or follow the device. Applied to <html> by lib/theme.ts.
  theme: Theme;
  tone: "sassy" | "calm";
  // Interface language (src/lib/i18n.ts). Stories are always shown as their authors wrote them.
  lang: Lang;
  // Ghost Blasters: which keys move the ship, and the best Experience on this device.
  game: { controls: GameControls; best: number };
  notify: { relatable: boolean; chitchatReplies: boolean; newFollowers: boolean; flaggedCompanies: boolean; weeklyDigest: boolean };
};

const KEY = "ghosted.prefs";
export type Lang = "en" | "hi" | "kn" | "hinglish";
export type GameControls = "both" | "arrows" | "wasd";
const DEFAULTS: Prefs = { reduceMotion: false, theme: "system", tone: "sassy", lang: "en", game: { controls: "both", best: 0 }, notify: { relatable: true, chitchatReplies: true, newFollowers: true, flaggedCompanies: false, weeklyDigest: true } };
const listeners = new Set<() => void>();
let cache: Prefs | null = null;

function read(): Prefs {
  if (cache) return cache;
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Prefs>;
    cache = { ...DEFAULTS, ...stored, game: { ...DEFAULTS.game, ...stored.game }, notify: { ...DEFAULTS.notify, ...stored.notify } };
  } catch { cache = DEFAULTS; }
  return cache;
}

export function setPrefs(patch: Partial<Prefs>) {
  const next = { ...read(), ...patch, game: { ...read().game, ...patch.game }, notify: { ...read().notify, ...patch.notify } };
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  listeners.forEach((l) => l());
}

// The current prefs outside React (event handlers and callbacks set up once).
export const getPrefs = (): Prefs => (typeof window === "undefined" ? DEFAULTS : read());

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, read, () => DEFAULTS);
}
