// Which ad brought this visit. An ad link carries utm_campaign and utm_content; they're kept for this
// browser tab only (sessionStorage, gone when the tab closes), counted once as an ad visit, and sent
// with sign-up so that ad's sign-up count goes up (backend ads.ts). Counts only, never tied to a person.
import { api, API_URL } from "@/lib/api";

const KEY = "ghosted.ad";
const LABEL = /^[a-z0-9_-]{1,40}$/;
export type AdAttribution = { campaign: string; content: string };

export function currentAd(): AdAttribution | undefined {
  if (typeof window === "undefined") return undefined;
  try { const v = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as AdAttribution | null; return v && LABEL.test(v.campaign) && LABEL.test(v.content) ? v : undefined; }
  catch { return undefined; }
}

// Call once when the app starts in the browser.
export function captureAd() {
  if (typeof window === "undefined" || !API_URL) return;
  const p = new URLSearchParams(window.location.search);
  if (p.get("utm_source") !== "meta" && p.get("utm_medium") !== "paid") return;
  const campaign = (p.get("utm_campaign") ?? "").toLowerCase(), content = (p.get("utm_content") ?? "").toLowerCase();
  if (!LABEL.test(campaign) || !LABEL.test(content)) return;
  try {
    const before = currentAd();
    if (before?.campaign === campaign && before.content === content) return; // a reload: already counted
    sessionStorage.setItem(KEY, JSON.stringify({ campaign, content }));
  } catch { /* storage blocked: still count the visit */ }
  void api("/v1/track", { method: "POST", body: { event: "ad_visit", ad: { campaign, content } } }).catch(() => undefined);
}
