// Phone notifications (Web Push) on the site side. Works on Android (Chrome, installed or not),
// iPhone and iPad once Ghosted is added to the Home Screen (iOS 16.4+), and desktop browsers.
// The service worker is public/sw.js; sending happens on the API (backend/src/push.ts).
import { useCallback, useEffect, useState } from "react";
import { api, apiEnabled } from "@/lib/api";

export type PushState =
  | "loading"
  | "unsupported"   // this browser can't do push at all
  | "ios-install"   // iPhone/iPad in Safari: push only works from the Home Screen app
  | "unavailable"   // the server isn't set up for push yet
  | "denied"        // notifications are blocked for Ghosted in the phone's settings
  | "off"
  | "on";

const isBrowser = () => typeof window !== "undefined";
export const isIos = () => isBrowser() && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1));
export const isStandalone = () => isBrowser() && ((navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches);
const supported = () => isBrowser() && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

// base64url → bytes, the form the browser wants the server's public key in.
function keyBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
}

let keyCache: Promise<string | null> | null = null;
const serverKey = () => (keyCache ??= api<{ enabled: boolean; publicKey: string | null }>("/v1/push/key").then((r) => (r.enabled ? r.publicKey : null)).catch(() => null));

async function registration() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

const deviceName = () => {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua) ? "Android" : isIos() ? (/iPad/.test(ua) || navigator.maxTouchPoints > 1 && /Macintosh/.test(ua) ? "iPad" : "iPhone") : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : "Linux";
  return `${os}${isStandalone() ? " app" : " browser"}`;
};

async function save(sub: PushSubscription) {
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await api("/v1/push/subscribe", { method: "POST", body: { endpoint: json.endpoint, keys: json.keys, device: deviceName() } });
}

// The current state for this device, and turning it on or off.
// `auto: false` skips the check on mount (the prompt only checks when it's asked to show).
export function usePush({ auto = true }: { auto?: boolean } = {}) {
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);

  const check = useCallback(async (): Promise<PushState> => {
    const next: PushState = await (async () => {
      if (!apiEnabled || !supported()) return isIos() && !isStandalone() ? "ios-install" : "unsupported";
      if (isIos() && !isStandalone()) return "ios-install";
      if (!(await serverKey())) return "unavailable";
      if (Notification.permission === "denied") return "denied";
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      return sub && Notification.permission === "granted" ? "on" : "off";
    })();
    setState(next);
    return next;
  }, []);
  useEffect(() => { if (auto) void check(); }, [auto, check]);

  // Must run from a tap: browsers only show the permission prompt in response to one.
  const enable = async () => {
    setBusy(true);
    try {
      const key = await serverKey();
      if (!key) { setState("unavailable"); return false; }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setState(permission === "denied" ? "denied" : "off"); return false; }
      const reg = await registration();
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
      await save(sub);
      setState("on");
      return true;
    } finally { setBusy(false); }
  };

  const disable = async () => {
    setBusy(true);
    try { await unsubscribeThisDevice(); setState("off"); }
    finally { setBusy(false); }
  };

  return { state, busy, enable, disable, refresh: check };
}

// Forget this device (turning off, and on sign-out so a shared phone stops getting someone else's
// notifications). Never throws.
export async function unsubscribeThisDevice() {
  if (!supported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await api("/v1/push/unsubscribe", { method: "POST", body: { endpoint: sub.endpoint } }).catch(() => undefined);
    await sub.unsubscribe();
  } catch { /* nothing to undo */ }
}

// Asking at the right moment: right after you track an application or follow a company, never on
// first load. This only raises the in-app card (components/push-prompt.tsx); the browser's own
// permission prompt appears when you tap "Turn on" there.
export type PushReason = "waiting" | "follow";
export const PUSH_ASK_EVENT = "ghosted:ask-push";
export function askForPush(reason: PushReason) {
  if (!isBrowser()) return;
  window.dispatchEvent(new CustomEvent<PushReason>(PUSH_ASK_EVENT, { detail: reason }));
}

// On every app start: if notifications are on for this device, make sure the server still has it
// (the push service can rotate a device's address), so pushes keep arriving.
export async function resyncPush() {
  if (!apiEnabled || !supported() || Notification.permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await save(sub);
  } catch { /* signed out, or offline: next time */ }
}
