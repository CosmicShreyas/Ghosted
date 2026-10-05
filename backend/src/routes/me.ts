import { Hono } from "hono";
import { z } from "zod";
import { ApiError, dbFail } from "../errors.js";
import { listDevices, revokeDevice } from "../devices.js";
import { bump, later } from "../live.js";
import { isGeneratedHandle, randomHandle } from "../lib/handles.js";
import { publicAuthor } from "../dto.js";
import { hydrate, publishedStories } from "../stories.js";
import { forgetUser, isAvatarSeed, isPastel, me, rateLimit, requireAuth, type AppEnv, type Profile } from "../security.js";
import { admin } from "../supabase.js";
import { verifyChallenge } from "../captcha.js";
import { detailText, fullName, validate } from "../validate.js";
import { sealToBytea, unsealBytea, unsealJson, type Details } from "../lib/sealed.js";
import type { StoryRow } from "../dto.js";
import { codeFor, referralStats } from "../referral.js";
import { levelFor, titleFor } from "../levels.js";

// Your own profile, including private fields. Only ever returned to you.
export const privateProfile = (p: Profile) => ({
  ...publicAuthor(p),
  showReal: p.show_real,
  sharedFields: p.shared_fields,
  details: { name: null, role: null, experience: null, city: null, linkedin: null, ...unsealBytea(p.details_z) },
  tone: p.tone ?? "sassy",
  emailTheme: p.email_theme ?? "light",
  notify: p.notify,
  // Only the method and how many recovery codes are left. Secrets never leave the server.
  mfa: { method: p.mfa_method ?? "none", recoveryLeft: p.recovery_z ? (unsealJson<string[]>(p.recovery_z) ?? []).length : 0 },
  createdAt: p.created_at,
  level: Number((p as Profile & { level?: number }).level ?? 1),
  title: titleFor(Number((p as Profile & { level?: number }).level ?? 1)),
});

const field = z.enum(["name", "role", "experience", "city", "linkedin"]);

export const meRoutes = new Hono<AppEnv>()
  .use(requireAuth)

  .get("/", rateLimit({ name: "me", max: 180, windowSeconds: 60, by: "user" }), (c) => c.json({ profile: privateProfile(me(c)) }))

  // Your level, XP, streak and today's ways to earn (levels.ts), plus your invite link and what it
  // has done. Used by the invite page, your profile, the dashboard and Insights.
  .get("/level", rateLimit({ name: "me-level", max: 180, windowSeconds: 60, by: "user" }), async (c) => {
    const p = me(c) as Profile & { ref_code?: string | null };
    let code: string | null = null;
    try { code = await codeFor(p.id, p.ref_code); } catch { code = null; } // before the invites SQL runs
    const [level, invites] = await Promise.all([
      levelFor(p.id),
      referralStats(p.id).catch(() => ({ joined: 0, voices: 0, stories: 0, relatable: 0 })),
    ]);
    return c.json({ ...level, invite: { code, ...invites } });
  })

  .patch("/", rateLimit({ name: "me-update", max: 45, windowSeconds: 3600, by: "user" }), validate("json", z.object({
    handle: z.string().refine(isGeneratedHandle, "Pick a generated handle").optional(),
    rerollHandle: z.boolean().optional(),
    avatarSeed: z.string().refine(isAvatarSeed, "Invalid avatar").optional(),
    pastel: z.string().refine(isPastel, "Invalid colour").optional(),
    showReal: z.boolean().optional(),
    sharedFields: z.array(field).max(5).optional(),
    tone: z.enum(["sassy", "calm"]).optional(),
    // The theme this person sees the site in; their emails use the same palette.
    emailTheme: z.enum(["light", "dark"]).optional(),
    notify: z.object({ relatable: z.boolean(), chitchatReplies: z.boolean(), newFollowers: z.boolean(), flaggedCompanies: z.boolean(), weeklyDigest: z.boolean(), levelUps: z.boolean(), comeBack: z.boolean() }).partial().strict().optional(),
    // Omitted keys stay unchanged; null or "" clears a field. The full name can be changed but not cleared.
    details: z.object({
      name: fullName.optional(),
      role: detailText(80),
      experience: detailText(40),
      city: detailText(60),
      linkedin: z.union([z.string().trim().regex(/^in\/[A-Za-z0-9_-]{3,100}\/?$/, "Use the in/your-name format"), z.literal(""), z.null()]).optional(),
    }).strict().optional(),
  }).strict()), async (c) => {
    const body = c.req.valid("json");
    const update: Record<string, unknown> = {};
    if (body.rerollHandle) update.handle = randomHandle();
    else if (body.handle) update.handle = body.handle;
    if (body.avatarSeed) update.avatar_seed = body.avatarSeed;
    if (body.pastel) update.pastel = body.pastel;
    if (body.showReal !== undefined) update.show_real = body.showReal;
    // Public is simply "at least one detail shown": hide everything and you're anonymous again.
    if (body.sharedFields) { update.shared_fields = [...new Set(body.sharedFields)]; update.show_real = body.sharedFields.length > 0; }
    if (body.tone) update.tone = body.tone;
    if (body.emailTheme) update.email_theme = body.emailTheme;
    if (body.notify) update.notify = { ...me(c).notify, ...body.notify };
    if (body.details && Object.keys(body.details).length) {
      const merged: Details = { ...unsealBytea(me(c).details_z) };
      for (const [k, v] of Object.entries(body.details)) if (v !== undefined) merged[k as keyof Details] = v || null;
      update.details_z = sealToBytea(merged);
    }
    if (!Object.keys(update).length) return c.json({ profile: privateProfile(me(c)) });
    const { data, error } = await admin().from("profiles").update(update).eq("id", me(c).id).select("*").single();
    if (error) dbFail("update profile", error);
    later(bump({ user: me(c).id, topics: ["me"] })); // your other devices pick up the change
    return c.json({ profile: privateProfile(data as Profile) });
  })

  // The bell: latest 50 notifications, newest first, with the unread count.
  .get("/notifications", rateLimit({ name: "me-notifications", max: 180, windowSeconds: 600, by: "user" }), async (c) => {
    const list = (cols: string) => admin().from("notifications").select(cols).eq("user_id", me(c).id).order("created_at", { ascending: false }).limit(50);
    const [first, { count, error: cErr }] = await Promise.all([
      list("public_id, kind, body, story_public_id, profile_public_id, company_slug, created_at, read_at"),
      admin().from("notifications").select("id", { count: "exact", head: true }).eq("user_id", me(c).id).is("read_at", null),
    ]);
    // A database that hasn't run the latest migration lacks the link columns (Postgres 42703):
    // still show the notifications, just without links, and say which migration fixes it.
    let { data, error } = first as { data: Record<string, unknown>[] | null; error: { code?: string; message: string } | null };
    if (error?.code === "42703") {
      console.warn("[notifications] link columns missing; initialize the database with supabase/init_database.sql");
      ({ data, error } = (await list("public_id, kind, body, story_public_id, created_at, read_at")) as typeof first & { data: Record<string, unknown>[] | null });
    }
    if (error) dbFail("notifications", error);
    if (cErr) dbFail("unread count", cErr);
    const str = (v: unknown) => (v == null ? null : String(v));
    return c.json({
      unread: count ?? 0,
      notifications: (data ?? []).map((n) => ({ publicId: String(n.public_id), kind: n.kind, body: n.body, storyPublicId: str(n.story_public_id), profilePublicId: str(n.profile_public_id), companySlug: str(n.company_slug), createdAt: n.created_at, read: !!n.read_at })),
    });
  })

  // Marks one notification read (the eye button). Harmless to repeat.
  .post("/notifications/:publicId/read", rateLimit({ name: "me-notification-read", max: 240, windowSeconds: 600, by: "user" }), validate("param", z.object({ publicId: z.string().regex(/^\d{15}$/) })), async (c) => {
    const { error } = await admin().from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", me(c).id).eq("public_id", c.req.valid("param").publicId).is("read_at", null);
    if (error) dbFail("read notification", error);
    later(bump({ user: me(c).id, topics: ["notifications"] }));
    return c.json({ ok: true });
  })

  // Marks everything read (the double-eye button at the top).
  .post("/notifications/read-all", rateLimit({ name: "me-notification-read-all", max: 60, windowSeconds: 600, by: "user" }), async (c) => {
    const { error } = await admin().from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", me(c).id).is("read_at", null);
    if (error) dbFail("read all notifications", error);
    later(bump({ user: me(c).id, topics: ["notifications"] }));
    return c.json({ ok: true });
  })

  // Settings → Security: every device signed in to this account, this one first.
  .get("/sessions", rateLimit({ name: "me-sessions", max: 120, windowSeconds: 600, by: "user" }), async (c) =>
    c.json({ sessions: await listDevices(me(c).id, c.get("accessToken")) }))

  // Signs one device out. It's logged out on its next request (open pages notice within seconds).
  .delete("/sessions/:publicId", rateLimit({ name: "me-session-revoke", max: 30, windowSeconds: 3600, by: "user" }), validate("param", z.object({ publicId: z.string().regex(/^\d{15}$/) })), async (c) => {
    const ok = await revokeDevice(me(c).id, c.req.valid("param").publicId);
    if (!ok) throw new ApiError(404, "session_not_found", "That device is already signed out.");
    forgetUser(me(c).id);
    later(bump({ user: me(c).id, topics: ["sessions"] }));
    return c.json({ ok: true });
  })

  // Your numbers on the home card: stories shared, people your stories helped (distinct people who
  // found one relatable or chitchatted on it), and your day streak (consecutive days, India time,
  // with a story, chitchat or reaction; today counts if you've done something, else it runs to yesterday).
  .get("/stats", rateLimit({ name: "me-stats", max: 120, windowSeconds: 60, by: "user" }), async (c) => {
    const id = me(c).id;
    const since = new Date(Date.now() - 400 * 86400_000).toISOString();
    const { data: mine, error } = await admin().from("stories").select("id, created_at").eq("author_id", id).eq("status", "published").limit(2000);
    if (error) dbFail("my stats", error);
    const ids = ((mine ?? []) as { id: string }[]).map((s) => s.id);
    const [relators, chatters, myComments, myReactions, myCommentReactions] = await Promise.all([
      ids.length ? admin().from("reactions").select("user_id").in("story_id", ids).eq("kind", "relatable").neq("user_id", id).limit(50000) : Promise.resolve({ data: [] }),
      ids.length ? admin().from("comments").select("author_id").in("story_id", ids).eq("status", "published").neq("author_id", id).limit(50000) : Promise.resolve({ data: [] }),
      admin().from("comments").select("created_at").eq("author_id", id).gte("created_at", since).limit(5000),
      admin().from("reactions").select("created_at").eq("user_id", id).gte("created_at", since).limit(5000),
      admin().from("comment_reactions").select("created_at").eq("user_id", id).gte("created_at", since).limit(5000),
    ]);
    const helped = new Set([...((relators.data ?? []) as { user_id: string }[]).map((r) => r.user_id), ...((chatters.data ?? []) as { author_id: string }[]).map((r) => r.author_id)]);
    // Days in India time (UTC+5:30), so a late-night post counts for the right day.
    const dayOf = (iso: string) => new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 10);
    const days = new Set([...((mine ?? []) as { created_at: string }[]), ...((myComments.data ?? []) as { created_at: string }[]), ...((myReactions.data ?? []) as { created_at: string }[]), ...((myCommentReactions.data ?? []) as { created_at: string }[])].map((r) => dayOf(r.created_at)));
    let streak = 0;
    const cursor = new Date(Date.now() + 330 * 60_000);
    if (!days.has(cursor.toISOString().slice(0, 10))) cursor.setUTCDate(cursor.getUTCDate() - 1); // not yet today: count up to yesterday
    while (days.has(cursor.toISOString().slice(0, 10))) { streak++; cursor.setUTCDate(cursor.getUTCDate() - 1); }
    return c.json({ stories: ids.length, peopleHelped: helped.size, streak, activeToday: days.has(dayOf(new Date().toISOString())) });
  })

  .get("/stories", rateLimit({ name: "me-stories", max: 90, windowSeconds: 60, by: "user" }), async (c) => {
    const { data, error } = await publishedStories().eq("author_id", me(c).id).order("created_at", { ascending: false }).limit(100);
    if (error) dbFail("my stories", error);
    return c.json({ stories: await hydrate((data ?? []) as unknown as StoryRow[], me(c)) });
  })

  // DPDP right to erasure: deleting the auth user cascades to profile, stories, reactions and comments.
  .delete("/", rateLimit({ name: "me-delete", max: 5, windowSeconds: 3600, by: "user" }), validate("json", z.object({ confirm: z.literal("DELETE"), captchaToken: z.string().max(12000).optional() })), async (c) => {
    // A stolen session alone can't wipe an account: a passed Ghosted Shield check is required too.
    await verifyChallenge(c, c.req.valid("json").captchaToken);
    const { error } = await admin().auth.admin.deleteUser(me(c).id);
    if (error) dbFail("delete user", error);
    return c.json({ ok: true });
  });
