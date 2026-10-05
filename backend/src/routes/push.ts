// Phone notifications: the public key the browser needs, and turning notifications on or off for
// this device. See push.ts for sending.
//   GET  /v1/push/key           { enabled, publicKey } (public; null key until the server is set up)
//   POST /v1/push/subscribe     save this device for the signed-in member
//   POST /v1/push/unsubscribe   forget this device (turning off, or signing out)
import { Hono } from "hono";
import { z } from "zod";
import { ApiError, dbFail } from "../errors.js";
import { pushEnabled, pushPublicKey } from "../push.js";
import { me, optionalAuth, rateLimit, requireAuth, type AppEnv } from "../security.js";
import { admin } from "../supabase.js";
import { validate } from "../validate.js";

const subscription = z.object({
  endpoint: z.string().url().startsWith("https://").max(1000),
  keys: z.object({ p256dh: z.string().min(40).max(200), auth: z.string().min(10).max(100) }),
  device: z.string().trim().max(120).optional(),
}).strict();

export const pushRoutes = new Hono<AppEnv>()
  .get("/key", rateLimit({ name: "push-key", max: 120, windowSeconds: 60 }), (c) => {
    c.header("Cache-Control", "public, max-age=300");
    return c.json({ enabled: pushEnabled(), publicKey: pushPublicKey() });
  })

  .post("/subscribe", requireAuth, rateLimit({ name: "push-subscribe", max: 20, windowSeconds: 3600, by: "user" }), validate("json", subscription), async (c) => {
    if (!pushEnabled()) throw new ApiError(503, "push_off", "Phone notifications aren't set up yet.");
    const { endpoint, keys, device } = c.req.valid("json");
    // One device, one owner: if this phone was signed in as someone else before, it moves to you.
    const { error } = await admin().from("push_subscriptions").upsert({ user_id: me(c).id, endpoint, p256dh: keys.p256dh, auth: keys.auth, device: device ?? null, created_at: new Date().toISOString() }, { onConflict: "endpoint" });
    if (error) dbFail("push subscribe (run the Phone notifications section of init_database.sql)", error);
    return c.json({ ok: true });
  })

  // Signed out works too (the session may already be gone when a device is signed out); the
  // endpoint is a long unguessable address only that device knows.
  .post("/unsubscribe", optionalAuth, rateLimit({ name: "push-unsubscribe", max: 30, windowSeconds: 3600 }), validate("json", z.object({ endpoint: z.string().url().max(1000) }).strict()), async (c) => {
    const { error } = await admin().from("push_subscriptions").delete().eq("endpoint", c.req.valid("json").endpoint);
    if (error && error.code !== "42P01" && error.code !== "PGRST205") dbFail("push unsubscribe", error);
    return c.json({ ok: true });
  });
