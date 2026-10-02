// Feedback, bug reports, feature ideas, check-in ratings (POST /v1/feedback) and donations through
// Razorpay (/v1/donations). Without the API (mock mode) submissions are kept in this browser
// and donating explains it only works in the live app.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiEnabled } from "@/lib/api";
import { samplePublicId } from "@/lib/stories";
import { users } from "@/mock/data";

export type FeedbackKind = "bug" | "feature" | "feedback" | "pulse";
export type Submission = { kind: FeedbackKind; title?: string; body?: string; area?: string; severity?: "minor" | "annoying" | "blocking"; rating?: number; steps?: string; device?: Record<string, string> };
export type MyItem = { publicId: string; kind: FeedbackKind; title: string | null; area: string | null; severity: string | null; status: "new" | "seen" | "planned" | "in_progress" | "done" | "wont_do"; reply: string | null; createdAt: string; updatedAt: string };

const DEMO_KEY = "ghosted.demoFeedback";
const readDemo = (): MyItem[] => { try { return JSON.parse(localStorage.getItem(DEMO_KEY) ?? "[]") as MyItem[]; } catch { return []; } };

// What a bug report includes about the device: browser, screen, theme and the page. Never an IP.
export function deviceInfo(): Record<string, string> {
  return {
    userAgent: navigator.userAgent.slice(0, 300), screen: `${screen.width}×${screen.height}`, viewport: `${innerWidth}×${innerHeight}`,
    theme: document.documentElement.classList.contains("dark") ? "dark" : "light", url: location.pathname.slice(0, 200),
  };
}

export async function submitFeedback(s: Submission): Promise<void> {
  if (!apiEnabled) {
    if (s.kind === "pulse") return;
    const now = new Date().toISOString();
    try { localStorage.setItem(DEMO_KEY, JSON.stringify([{ publicId: `demo-${Date.now()}`, kind: s.kind, title: s.title ?? null, area: s.area ?? null, severity: s.severity ?? null, status: "new", reply: null, createdAt: now, updatedAt: now }, ...readDemo()].slice(0, 50))); } catch { /* storage blocked */ }
    return;
  }
  await api("/v1/feedback", { method: "POST", body: s });
}

export function useMyFeedback() {
  const q = useQuery({ queryKey: ["my-feedback"], queryFn: async () => (apiEnabled ? (await api<{ items: MyItem[] }>("/v1/feedback/mine")).items : readDemo()), staleTime: 30_000 });
  return { items: q.data ?? [], loading: q.isPending };
}
export const useRefreshFeedback = () => { const qc = useQueryClient(); return () => void qc.invalidateQueries({ queryKey: ["my-feedback"] }); };

// ---------- donations ----------

export type WallEntry = { author: { publicId: string; name: string; avatarSeed: string; pastel: string }; message: string | null; at: string; times?: number };
export type DonationSummary = { enabled: boolean; supporters: number; wall: WallEntry[]; mine: { publicId: string; amount: number; message: string | null; at: string }[] };

// Preview: the sample people, as if they'd chipped in, so the wall can be tried without the API.
const SAMPLE_NOTES = ["For everyone still waiting on a reply.", "Six rounds and silence. Never again, for anyone.", null, "Keep the receipts coming.", "Thank you for building this.", null, "From one ghosted candidate to the next.", "Honest hiring or bust.", null, "Goofy deserves a raise."];
function sampleWall(): WallEntry[] {
  return users.map((u, i) => ({ author: { publicId: samplePublicId(u.id), name: u.handle, avatarSeed: u.seed, pastel: u.pastel }, message: SAMPLE_NOTES[i % SAMPLE_NOTES.length] ?? null, at: new Date(Date.now() - i * 9 * 3600_000).toISOString(), times: 1 + (i % 3 === 0 ? 1 : 0) }));
}

export function useDonations() {
  const q = useQuery({ queryKey: ["donations"], queryFn: () => api<DonationSummary>("/v1/donations/summary"), enabled: apiEnabled, staleTime: 60_000 });
  return { summary: apiEnabled ? q.data ?? null : ({ enabled: false, supporters: users.length, wall: sampleWall().slice(0, 5), mine: [] } as DonationSummary), loading: apiEnabled && q.isPending };
}

// The whole wall, loaded only when someone opens it.
export function useThankYouWall(open: boolean) {
  const q = useQuery({ queryKey: ["donations", "wall"], queryFn: async () => (await api<{ wall: WallEntry[] }>("/v1/donations/wall")).wall, enabled: apiEnabled && open, staleTime: 60_000 });
  return { wall: apiEnabled ? q.data ?? [] : sampleWall(), loading: apiEnabled && open && q.isPending };
}

type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayInstance = { open: () => void; on: (e: string, cb: (r: { error?: { description?: string } }) => void) => void };
declare global { interface Window { Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance } }

let checkoutScript: Promise<void> | null = null;
function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  checkoutScript ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { checkoutScript = null; reject(new Error("Couldn't load Razorpay. Check your connection and try again.")); };
    document.head.appendChild(s);
  });
  return checkoutScript;
}

// Creates the order on our server, opens Razorpay Checkout, then has our server verify the signature.
// Resolves "paid" or "dismissed"; throws with a readable message on failure.
export async function donate(o: { amount: number; message?: string; showName: boolean; name?: string }): Promise<"paid" | "dismissed"> {
  if (!apiEnabled) throw new Error("Donations work in the live app. This preview can't take payments.");
  const [order] = await Promise.all([
    api<{ keyId: string; orderId: string; amount: number; currency: string }>("/v1/donations/order", { method: "POST", body: { amount: o.amount, ...(o.message && { message: o.message }), showName: o.showName } }),
    loadCheckout(),
  ]);
  const dark = document.documentElement.classList.contains("dark");
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: order.keyId, order_id: order.orderId, amount: order.amount, currency: order.currency,
      name: "Ghosted", description: "Support honest hiring", image: `${location.origin}/favicon-light-512x512.png`,
      ...(o.name && { prefill: { name: o.name } }),
      theme: { color: dark ? "#9b6bff" : "#6a2ee0" },
      handler: async (r: RazorpayResponse) => {
        try { await api("/v1/donations/verify", { method: "POST", body: { orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature } }); resolve("paid"); }
        catch (e) { reject(e instanceof Error ? e : new Error("We couldn't confirm the payment.")); }
      },
      modal: { ondismiss: () => resolve("dismissed"), confirm_close: true },
    });
    rzp.on("payment.failed", (r) => reject(new Error(r.error?.description ?? "The payment didn't go through. You haven't been charged.")));
    rzp.open();
  });
}
