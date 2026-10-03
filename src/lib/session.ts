import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { api, ApiRequestError, apiEnabled, authApi, UNAUTHORIZED_EVENT } from "@/lib/api";
import { useLive } from "@/lib/live";
import { getUser } from "@/mock/data";
import { setPrefs, usePrefs } from "@/lib/prefs";

// The voice for the whole site: the account's tone when logged in, this device's otherwise.
export function useTone(): Tone {
  return usePrefs().tone;
}
// Picks the sassy or calm version of a piece of copy.
export const voice = <T,>(tone: Tone, sassy: T, calm: T) => (tone === "calm" ? calm : sassy);

export type Field = "name" | "role" | "experience" | "city" | "linkedin";
export type Me = {
  publicId: string | null;
  handle: string;
  avatarSeed: string;
  pastel: string;
  showReal: boolean;
  sharedFields: Field[];
  details: Record<Field, string | null>;
  tone: Tone;
  // Palette for this person's emails, kept in step with the theme they use on the site.
  emailTheme: "light" | "dark";
  notify: Notify;
  mfa: { method: "none" | "totp" | "email"; recoveryLeft: number };
  // When the account was made (the API sends it; the demo profile doesn't have one).
  createdAt?: string;
};
export type Tone = "sassy" | "calm";
export type Notify = { relatable: boolean; chitchatReplies: boolean; newFollowers: boolean; flaggedCompanies: boolean; weeklyDigest: boolean };

// The one rule for which name to show: your real name only if you've gone public AND chosen to
// show your name; otherwise your anonymous handle. Use these everywhere a name is displayed.
export const nameIsPublic = (me: Me) => me.showReal && me.sharedFields.includes("name") && !!me.details.name?.trim();
// Public means at least one detail is shown (the server keeps showReal in step with that).
export const isPublic = (me: Me) => me.showReal && me.sharedFields.length > 0;
export const displayName = (me: Me) => (nameIsPublic(me) ? me.details.name!.trim() : me.handle);
export const firstName = (me: Me) => (nameIsPublic(me) ? me.details.name!.trim().split(/\s+/)[0]! : me.handle);

// Demo profile used when the API isn't configured (mock mode).
const mock = getUser("u1");
export const demoMe: Me = {
  publicId: null, handle: mock.handle, avatarSeed: mock.seed, pastel: mock.pastel, showReal: false, sharedFields: [],
  details: { name: "Demo User", role: null, experience: null, city: null, linkedin: null },
  tone: "sassy",
  emailTheme: "light",
  notify: { relatable: true, chitchatReplies: true, newFollowers: true, flaggedCompanies: false, weeklyDigest: true },
  mfa: { method: "none", recoveryLeft: 0 },};

// Fills in defaults for any field an older API (or a database without the latest migration)
// doesn't send yet, so no page can crash on a missing field.
export function normalizeMe(p: Partial<Me>): Me {
  return {
    ...demoMe,
    ...p,
    sharedFields: p.sharedFields ?? [],
    details: { ...demoMe.details, name: null, ...p.details },
    tone: p.tone ?? "sassy",
    emailTheme: p.emailTheme ?? "light",
    notify: { ...demoMe.notify, ...p.notify },
    mfa: { ...demoMe.mfa, ...p.mfa },
  };
}

// Asks the API who we are. The session cookie does the work; if the access token expired, the API
// refreshes it inside this same request, so returning visitors land logged in with no redirects.
// Resolves to null (not an error) when there's simply no session.
async function fetchMe(): Promise<Me | null> {
  if (!apiEnabled) return demoMe;
  try {
    return normalizeMe((await api<{ profile: Partial<Me> }>("/v1/me")).profile);
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 401) return null;
    throw err;
  }
}

// A non-secret UI hint ("this browser was logged in last time"), so pages can show the loading
// screen instead of flashing the landing page before redirecting. It holds no token: the API still
// decides, and a stale hint just means a short loading screen.
const HINT = "ghosted.signedIn";
export const signedInHint = {
  get: () => { try { return localStorage.getItem(HINT) === "1"; } catch { return false; } },
  set: (on: boolean) => { try { if (on) localStorage.setItem(HINT, "1"); else localStorage.removeItem(HINT); } catch { /* storage blocked */ } },
};

export function useMe() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    enabled: typeof window !== "undefined",
    retry: (count, err) => !(err instanceof ApiRequestError && err.status < 500) && count < 2,
    staleTime: 5 * 60_000,
  });
  // Any API call that comes back 401 (both tokens expired or revoked) signs this tab out,
  // and the page guards send the user to /auth.
  useEffect(() => {
    const out = () => qc.setQueryData(["me"], null);
    window.addEventListener(UNAUTHORIZED_EVENT, out);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, out);
  }, [qc]);
  useEffect(() => { if (apiEnabled && query.isSuccess) signedInHint.set(query.data !== null); }, [query.isSuccess, query.data]);
  // Profile or settings changed on another device (or tab): fetch the fresh copy. While signed in,
  // the same live check also notices if this device gets signed out and logs out here.
  useLive(query.data ? "me" : null, () => void qc.invalidateQueries({ queryKey: ["me"] }));
  // Mirror the account's tone onto this device, so pages without a profile (loading screen,
  // log-in page) speak in the same voice.
  useEffect(() => { if (query.data?.tone) setPrefs({ tone: query.data.tone }); }, [query.data?.tone]);
  // `checking` is true until we know; pages wait instead of flashing a redirect.
  const checking = typeof window === "undefined" || query.isPending;
  return { me: query.data ?? demoMe, checking, signedOut: !checking && query.data === null, signedIn: !checking && query.data !== null && query.data !== undefined };
}

// Page guard: sends signed-in users away from public-only pages and signed-out users away from
// private ones. `waiting` is true while the answer isn't known yet (show the preloader then).
// `optional`: readable signed out or in (shared story and company links); never redirects.
// `returnTo` (public-only pages): where a signed-in visitor goes instead of the dashboard.
export function useAuthGuard(page: "public-only" | "private" | "optional", { returnTo }: { returnTo?: string | null } = {}) {
  const navigate = useNavigate();
  const { checking, signedIn, signedOut } = useMe();
  const [hint, setHint] = useState(false);
  useEffect(() => setHint(signedInHint.get()), []);
  useEffect(() => {
    if (!apiEnabled) return; // demo mode has no real sessions
    if (page === "public-only" && signedIn) { const back = safeReturnTo(returnTo); if (back) navigate({ href: back, replace: true }); else navigate({ to: "/dashboard", replace: true }); }
    if (page === "private" && signedOut) navigate({ to: "/auth", replace: true });
  }, [page, signedIn, signedOut, navigate, returnTo]);
  if (!apiEnabled) return { waiting: false, signedOut: false };
  // Private pages always wait. Public and optional pages only wait if this browser was probably
  // logged in, so first-time visitors see the page instantly.
  const waiting = page === "private" ? checking || signedOut : page === "optional" ? checking && hint : (checking && hint) || signedIn;
  return { waiting, signedOut: page === "optional" ? signedOut || (checking && !hint) : signedOut };
}

// Only a story or company page can be a return address after signing in (no open redirects).
export const safeReturnTo = (p: string | null | undefined) => (p && /^\/(s|c)\/[A-Za-z0-9-]{1,60}$/.test(p) ? p : null);

export function useAccountActions() {
  const qc = useQueryClient();
  return {
    // Saves profile changes, then refreshes everything that shows the profile.
    async update(patch: Partial<{ showReal: boolean; sharedFields: Field[]; details: Partial<Record<Field, string | null>>; rerollHandle: boolean; avatarSeed: string; pastel: string; tone: Tone; notify: Partial<Notify> }>) {
      if (!apiEnabled) {
        const cur = qc.getQueryData<Me>(["me"]) ?? demoMe;
        const next: Me = {
          ...cur,
          ...(patch.showReal !== undefined && { showReal: patch.showReal }), ...(patch.sharedFields && { sharedFields: patch.sharedFields }),
          ...(patch.avatarSeed && { avatarSeed: patch.avatarSeed }), ...(patch.pastel && { pastel: patch.pastel }), ...(patch.tone && { tone: patch.tone }),
          notify: { ...cur.notify, ...patch.notify }, details: { ...cur.details, ...patch.details },
        };
        qc.setQueryData(["me"], next);
        return next;
      }
      const profile = normalizeMe((await api<{ profile: Partial<Me> }>("/v1/me", { method: "PATCH", body: patch })).profile);
      qc.setQueryData(["me"], profile);
      return profile;
    },
    async logout() {
      await authApi.logout();
      qc.setQueryData(["me"], null);
    },
    async deleteAccount(captchaToken: string | undefined) {
      if (apiEnabled) await api("/v1/me", { method: "DELETE", body: { confirm: "DELETE", captchaToken } });
      await authApi.logout();
      qc.setQueryData(["me"], null);
    },
    // After log-in or sign-up the cookies are set; fetch the fresh profile before navigating.
    refresh: () => qc.fetchQuery({ queryKey: ["me"], queryFn: fetchMe }),
    // Log-in already returns the profile: store it directly and skip the extra round trip.
    prime: (profile: Partial<Me>) => qc.setQueryData(["me"], normalizeMe(profile)),
  };
}
