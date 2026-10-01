// Feedback, bug reports, feature ideas and the occasional check-in rating (the /feedback page and
// the "How's Ghosted treating you?" popup). Signed-in only; each person sees their own submissions
// and the team's reply. Text goes through the same automatic review as everything else.
import { Hono } from "hono";
import { z } from "zod";
import { ApiError, dbFail } from "../errors.js";
import { me, rateLimit, requireAuth, type AppEnv } from "../security.js";
import { admin } from "../supabase.js";
import { validate } from "../validate.js";
import { reviewText } from "../algorithms/index.js";
import { goofyControls } from "../platform.js";

const text = (max: number) => z.string().trim().max(max);
const submission = z.object({
  kind: z.enum(["bug", "feature", "feedback", "pulse"]),
  title: text(120).optional(),
  body: text(4000).optional(),
  area: z.enum(["feed", "stories", "chitchats", "companies", "waiting_room", "insights", "search", "profile", "settings", "sign_in", "goofy", "other"]).optional(),
  severity: z.enum(["minor", "annoying", "blocking"]).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  steps: text(2000).optional(),
  // Bug reports: what the browser says about itself. No IP, nothing identifying.
  device: z.object({ userAgent: text(300), screen: text(30), viewport: text(30), theme: text(10), url: text(200) }).partial().optional(),
}).strict().superRefine((b, ctx) => {
  if (b.kind === "pulse") { if (b.rating == null) ctx.addIssue({ code: "custom", path: ["rating"], message: "Pick a rating" }); return; }
  if (!b.title || b.title.length < 3) ctx.addIssue({ code: "custom", path: ["title"], message: "Give it a short title" });
  if (!b.body || b.body.length < 10) ctx.addIssue({ code: "custom", path: ["body"], message: "Tell us a little more (at least 10 characters)" });
});

export const feedbackRoutes = new Hono<AppEnv>()
  .use(requireAuth)

  .post("/", rateLimit({ name: "feedback", max: 20, windowSeconds: 3600, by: "user" }), validate("json", submission), async (c) => {
    const b = c.req.valid("json");
    const review = reviewText(`${b.title ?? ""}\n${b.body ?? ""}\n${b.steps ?? ""}`, { kind: "report" });
    // Vulgar or threatening feedback is refused; criticism of course is welcome.
    const goofy = await goofyControls();
    if (goofy.enabled && goofy.blockVulgarity && review.decision === "block" && review.reasons.some((r) => ["vulgar", "slur", "threat", "identity_attack"].includes(r.code))) {
      throw new ApiError(422, "moderation_blocked", "Goofy: we read every word of feedback, harsh is fine, abusive isn't. Try again without that language?", { body: "Please rephrase" });
    }
    const { data, error } = await admin().from("feedback").insert({
      user_id: me(c).id, kind: b.kind, title: b.title ?? null, body: b.body ?? null, area: b.area ?? null, severity: b.kind === "bug" ? b.severity ?? null : null,
      rating: b.rating ?? null, steps: b.kind === "bug" ? b.steps ?? null : null, device: b.kind === "bug" ? b.device ?? null : null,
    }).select("public_id").single();
    if (error) dbFail("feedback (run supabase/init_database.sql on a fresh project)", error);
    return c.json({ ok: true, publicId: String(data.public_id) }, 201);
  })

  .get("/mine", rateLimit({ name: "feedback-mine", max: 60, windowSeconds: 60, by: "user" }), async (c) => {
    const { data, error } = await admin().from("feedback").select("public_id, kind, title, area, severity, status, reply, created_at, updated_at")
      .eq("user_id", me(c).id).neq("kind", "pulse").order("created_at", { ascending: false }).limit(50);
    if (error) dbFail("my feedback", error);
    return c.json({ items: ((data ?? []) as { public_id: number; kind: string; title: string | null; area: string | null; severity: string | null; status: string; reply: string | null; created_at: string; updated_at: string }[])
      .map((r) => ({ publicId: String(r.public_id), kind: r.kind, title: r.title, area: r.area, severity: r.severity, status: r.status, reply: r.reply, createdAt: r.created_at, updatedAt: r.updated_at })) });
  });
