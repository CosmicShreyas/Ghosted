// Light / dark ("after hours") theme. The choice is per device (lib/prefs.ts); "system" follows the
// OS setting live. A tiny script in <head> (THEME_BOOT) applies it before the first paint, so dark
// mode never flashes white; this module keeps it in sync afterwards.
import { useEffect, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, apiEnabled } from "@/lib/api";
import { setPrefs, usePrefs, type Theme } from "@/lib/prefs";
import { useMe } from "@/lib/session";

const DARK_QUERY = "(prefers-color-scheme: dark)";

// Runs in <head> before anything renders: reads the saved choice and sets the class.
export const THEME_BOOT = `(function(){try{var t=(JSON.parse(localStorage.getItem("ghosted.prefs")||"{}").theme)||"system";var d=t==="dark"||(t==="system"&&matchMedia("${DARK_QUERY}").matches);var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light";}catch(_){}})()`;

const subscribeSystem = (cb: () => void) => {
  const m = window.matchMedia(DARK_QUERY);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const systemDark = () => window.matchMedia(DARK_QUERY).matches;

// The theme actually showing ("system" resolved to light or dark).
export function useResolvedTheme(): "light" | "dark" {
  const { theme } = usePrefs();
  const sys = useSyncExternalStore(subscribeSystem, systemDark, () => false);
  return theme === "system" ? (sys ? "dark" : "light") : theme;
}

// Mounted once (root layout): mirrors the resolved theme onto <html>.
export function useApplyTheme() {
  const resolved = useResolvedTheme();
  useEffect(() => {
    const e = document.documentElement;
    e.classList.toggle("dark", resolved === "dark");
    e.style.colorScheme = resolved;
    // The phone's status bar and browser chrome match the chosen theme, not just the OS setting.
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
      m.content = resolved === "dark" ? "#16111d" : "#FAF7F2";
    });
  }, [resolved]);
}

export const setTheme = (theme: Theme) => setPrefs({ theme });

// Emails follow the theme too: when the theme this person actually sees differs from the one saved
// on their account, save it (so the next code, alert or digest arrives in the same palette).
export function useSyncEmailTheme() {
  const resolved = useResolvedTheme();
  const { me, signedIn } = useMe();
  const qc = useQueryClient();
  useEffect(() => {
    if (!apiEnabled || !signedIn || me.emailTheme === resolved) return;
    const t = window.setTimeout(() => {
      void api("/v1/me", { method: "PATCH", body: { emailTheme: resolved } })
        .then(() => qc.setQueryData(["me"], (m: typeof me | null | undefined) => (m ? { ...m, emailTheme: resolved } : m)))
        .catch(() => undefined); // best effort: emails just stay in the previous palette
    }, 800);
    return () => window.clearTimeout(t);
  }, [resolved, signedIn, me.emailTheme, qc]);
}
