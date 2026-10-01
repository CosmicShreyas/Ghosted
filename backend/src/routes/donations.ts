// Donations through Razorpay (the /feedback page).
//
//   POST /order     creates a Razorpay order for the amount; the page opens Razorpay Checkout with it
//   POST /verify    checks Checkout's signature (HMAC-SHA256 of "order_id|payment_id" with the key
//                   secret) and marks the donation paid
//   POST /webhook   Razorpay's server-to-server "payment.captured", verified with the webhook secret,
//                   so a payment counts even if the person closes the tab before /verify runs
//   GET  /summary   how many people have chipped in, the 5 latest on the wall, and your own donations
//   GET  /wall      everyone on the thank-you wall (who chose to show their name), once each
//
// Amounts are decided by the server from what the person picked (₹10 to ₹1,00,000), never trusted
// from Checkout. The key secret never leaves the server.
import { createHmac, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import { ApiError, dbFail } from "../errors.js";
import { env } from "../env.js";
import { me, rateLimit, requireAuth, type AppEnv } from "../security.js";
import { ensureOpen } from "../platform.js";
import { admin } from "../supabase.js";
import { validate } from "../validate.js";
import { storyAuthor, AUTHOR_COLUMNS, type AuthorRow } from "../dto.js";
import { addNotification } from "../notify.js";

const keys = () => {
  const { RAZORPAY_KEY_ID: id, RAZORPAY_KEY_SECRET: secret } = env();
  if (!id || !secret) throw new ApiError(503, "donations_off", "Donations aren't switched on yet. Thank you for wanting to help!");
  return { id, secret };
};
const sameHex = (a: string, b: string) => { const x = Buffer.from(a, "hex"), y = Buffer.from(b, "hex"); return x.length === y.length && x.length > 0 && timingSafeEqual(x, y); };

async function markPaid(orderId: string, paymentId: string) {
  const { data } = await admin().from("donations").update({ status: "paid", razorpay_payment_id: paymentId, paid_at: new Date().toISOString() })
    .eq("razorpay_order_id", orderId).neq("status", "paid").select("user_id, amount_paise");
  // First time this payment is confirmed: a thank-you in their notifications.
  const row = (data ?? [])[0] as { user_id: string | null; amount_paise: number } | undefined;
  if (row?.user_id) await addNotification(row.user_id, "system", `Thank you for supporting Ghosted with ₹${(row.amount_paise / 100).toLocaleString("en-IN")}. It keeps the lights on and the receipts honest.`);
}

export const donationRoutes = new Hono<AppEnv>()
  // Razorpay calls this directly (no session): verified by signature instead.
  .post("/webhook", async (c) => {
    const secret = env().RAZORPAY_WEBHOOK_SECRET;
    if (!secret) return c.json({ ok: false }, 503);
    const raw = await c.req.text();
    const sig = c.req.header("x-razorpay-signature") ?? "";
    if (!sameHex(createHmac("sha256", secret).update(raw).digest("hex"), sig)) return c.json({ ok: false }, 401);
    const evt = JSON.parse(raw) as { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string } } } };
    const p = evt.payload?.payment?.entity;
    if (evt.event === "payment.captured" && p?.id && p.order_id) await markPaid(p.order_id, p.id);
    if (evt.event === "payment.failed" && p?.order_id) await admin().from("donations").update({ status: "failed" }).eq("razorpay_order_id", p.order_id).eq("status", "created");
    return c.json({ ok: true });
  })

  .use(requireAuth)

  .get("/summary", rateLimit({ name: "donations-summary", max: 60, windowSeconds: 60, by: "user" }), async (c) => {
    const [paid, mine, wall] = await Promise.all([
      admin().from("donations").select("user_id").eq("status", "paid").limit(100000),
      admin().from("donations").select("public_id, amount_paise, status, message, created_at, paid_at").eq("user_id", me(c).id).eq("status", "paid").order("paid_at", { ascending: false }).limit(20),
      admin().from("donations").select(`message, paid_at, user:profiles(${AUTHOR_COLUMNS})`).eq("status", "paid").eq("show_name", true).order("paid_at", { ascending: false }).limit(5),
    ]);
    if (paid.error) dbFail("donations (run supabase/init_database.sql on a fresh project)", paid.error);
    const supporters = new Set(((paid.data ?? []) as { user_id: string | null }[]).map((r) => r.user_id ?? "anon")).size;
    return c.json({
      enabled: !!(env().RAZORPAY_KEY_ID && env().RAZORPAY_KEY_SECRET),
      supporters,
      wall: ((wall.data ?? []) as unknown as { message: string | null; paid_at: string; user: AuthorRow | null }[]).filter((w) => w.user).map((w) => ({ author: storyAuthor(w.user!), message: w.message, at: w.paid_at })),
      mine: ((mine.data ?? []) as { public_id: number; amount_paise: number; message: string | null; paid_at: string }[]).map((d) => ({ publicId: String(d.public_id), amount: d.amount_paise / 100, message: d.message, at: d.paid_at })),
    });
  })

  // The whole thank-you wall: everyone who chose to show their name, once each (their latest note),
  // newest first.
  .get("/wall", rateLimit({ name: "donations-wall", max: 60, windowSeconds: 60, by: "user" }), async (c) => {
    const { data, error } = await admin().from("donations").select(`user_id, message, paid_at, user:profiles(${AUTHOR_COLUMNS})`).eq("status", "paid").eq("show_name", true).order("paid_at", { ascending: false }).limit(2000);
    if (error) dbFail("thank-you wall", error);
    const seen = new Map<string, { author: ReturnType<typeof storyAuthor>; message: string | null; at: string; times: number }>();
    for (const r of (data ?? []) as unknown as { user_id: string | null; message: string | null; paid_at: string; user: AuthorRow | null }[]) {
      if (!r.user || !r.user_id) continue;
      const cur = seen.get(r.user_id);
      if (cur) { cur.times++; if (!cur.message && r.message) cur.message = r.message; continue; }
      seen.set(r.user_id, { author: storyAuthor(r.user), message: r.message, at: r.paid_at, times: 1 });
    }
    return c.json({ wall: [...seen.values()].slice(0, 500) });
  })

  .post("/order", rateLimit({ name: "donation-order", max: 15, windowSeconds: 3600, by: "user" }), validate("json", z.object({
    amount: z.number().int().min(10, "The smallest donation is ₹10").max(100000, "For gifts above ₹1,00,000, write to us"),
    message: z.string().trim().max(280).optional(),
    showName: z.boolean().default(false),
  }).strict()), async (c) => {
    await ensureOpen("donationsOpen");
    const { id, secret } = keys();
    const b = c.req.valid("json");
    const receipt = `gh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST", signal: AbortSignal.timeout(10_000),
      headers: { "content-type": "application/json", authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` },
      body: JSON.stringify({ amount: b.amount * 100, currency: "INR", receipt, notes: { purpose: "Ghosted donation", user: String(me(c).public_id) } }),
    }).catch(() => null);
    const order = res?.ok ? ((await res.json()) as { id: string; amount: number; currency: string }) : null;
    if (!order) throw new ApiError(502, "razorpay_unavailable", "Razorpay didn't answer. Try again in a moment.");
    const { error } = await admin().from("donations").insert({ user_id: me(c).id, amount_paise: order.amount, razorpay_order_id: order.id, message: b.message || null, show_name: b.showName });
    if (error) dbFail("donation order", error);
    return c.json({ keyId: id, orderId: order.id, amount: order.amount, currency: order.currency });
  })

  .post("/verify", rateLimit({ name: "donation-verify", max: 30, windowSeconds: 3600, by: "user" }), validate("json", z.object({
    orderId: z.string().regex(/^order_[A-Za-z0-9]+$/), paymentId: z.string().regex(/^pay_[A-Za-z0-9]+$/), signature: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict()), async (c) => {
    const { secret } = keys();
    const b = c.req.valid("json");
    const { data: row } = await admin().from("donations").select("id, user_id").eq("razorpay_order_id", b.orderId).maybeSingle();
    if (!row || (row as { user_id: string | null }).user_id !== me(c).id) throw new ApiError(404, "not_found", "We couldn't find that donation.");
    if (!sameHex(createHmac("sha256", secret).update(`${b.orderId}|${b.paymentId}`).digest("hex"), b.signature)) throw new ApiError(400, "bad_signature", "We couldn't confirm that payment. If money left your account, it's safe: Razorpay refunds unconfirmed payments.");
    await markPaid(b.orderId, b.paymentId);
    return c.json({ ok: true });
  });
