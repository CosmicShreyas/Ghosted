// Live updates on the page side. Components say which topics they care about; one shared poller asks
// the API for the current version of each (GET /v1/live) and tells subscribers when one moves.
//
// "Smart" polling: every 5 s while you're active, every 20 s after two idle minutes, paused while
// the tab is hidden, and an instant check when you come back, refocus or reconnect.
//
// Built to be swapped: when WebSockets arrive, replace `checkNow`'s fetch with a socket message
// handler that calls `apply(versions)`. `useLive` and every caller stay exactly the same.
//
// Your own topics (always watched when signed in): "me", "sessions", "stories", "notifications", "applications".
// Public topics (watched on request): "feed", "story:<publicId>".
import { useEffect, useRef } from "react";
import { api, apiEnabled, UNAUTHORIZED_EVENT } from "@/lib/api";

type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();
let known: Record<string, number> | null = null; // null until the first answer sets the baseline
let wasSignedIn = false;
let timer: number | undefined;
let inFlight = false;
let lastActivity = Date.now();

const ACTIVE_MS = 5_000;
const IDLE_MS = 20_000;
const IDLE_AFTER = 2 * 60_000;
const USER_TOPICS = new Set(["me", "sessions", "stories", "notifications", "applications"]);

const sharedTopics = () => [...listeners.keys()].filter((t) => !USER_TOPICS.has(t) && listeners.get(t)!.size);

// Compares fresh numbers with what the page last saw and notifies subscribers of anything that moved.
function apply(versions: Record<string, number>) {
  const prev = known;
  known = { ...(known ?? {}), ...versions };
  if (!prev) return; // first answer: just remember where things stand
  for (const [topic, v] of Object.entries(versions)) {
    if (prev[topic] !== undefined && prev[topic] !== v) listeners.get(topic)?.forEach((fn) => fn());
  }
}

async function checkNow() {
  if (inFlight || !listeners.size) return;
  inFlight = true;
  try {
    const topics = sharedTopics();
    const r = await api<{ signedIn: boolean; versions: Record<string, number> }>(`/v1/live${topics.length ? `?topics=${encodeURIComponent(topics.join(","))}` : ""}`, { timeoutMs: 10_000 });
    // Signed in a moment ago, not any more: this device was signed out elsewhere. Log out here too.
    if (wasSignedIn && !r.signedIn) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    wasSignedIn = r.signedIn;
    apply(r.versions);
  } catch { /* offline or a blip: the next tick tries again */ }
  finally { inFlight = false; }
}

function schedule() {
  window.clearTimeout(timer);
  if (!listeners.size || document.visibilityState === "hidden") return;
  const delay = Date.now() - lastActivity > IDLE_AFTER ? IDLE_MS : ACTIVE_MS;
  timer = window.setTimeout(async () => { await checkNow(); schedule(); }, delay);
}

let started = false;
function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  const wake = () => { lastActivity = Date.now(); };
  const resume = () => { if (document.visibilityState === "visible") { wake(); void checkNow().then(schedule); } else window.clearTimeout(timer); };
  for (const e of ["pointerdown", "keydown", "scroll", "touchstart"]) window.addEventListener(e, wake, { passive: true });
  document.addEventListener("visibilitychange", resume);
  window.addEventListener("focus", resume);
  window.addEventListener("online", resume);
}

// Calls `onChange` whenever `topic` changes anywhere: on another device, in another tab, or by
// someone else (public topics). Does nothing without the API (mock data).
export function useLive(topic: string | null, onChange: () => void) {
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    if (!apiEnabled || !topic) return;
    start();
    const fn = () => cb.current();
    const set = listeners.get(topic) ?? new Set<Listener>();
    set.add(fn);
    listeners.set(topic, set);
    // A new public topic needs its baseline; a check also starts the loop if it was idle.
    void checkNow().then(schedule);
    return () => { set.delete(fn); if (!set.size) listeners.delete(topic); if (!listeners.size) window.clearTimeout(timer); };
  }, [topic]);
}

// After this page changes something itself, check straight away so its other views update too.
export const liveNudge = () => { if (apiEnabled) void checkNow(); };
