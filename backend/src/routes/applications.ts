// Waiting Room (GET/POST/PATCH/DELETE /v1/me/applications): your private tracker of applications
// you're waiting on. Only ever returned to its owner; never public, never in any statistic.
//
// Each application comes back with how long people usually wait at that company and round, from
// real published stories: the company at that round (3+ stories), else the company overall (3+),
// else the whole platform at that round. That's what the page compares your clock against.
import { Hono } from "hono";
import { z } from "zod";
import { ApiError, dbFail } from "../errors.js";
import { bump, later } from "../live.js";
import { me, rateLimit, requireAuth, type AppEnv } from "../security.js";
import { admin } from "../supabase.js";
import { sealJson, unsealJson } from "../lib/sealed.js";
import { detailText, publicId, validate } from "../validate.js";

const STAGES = ["application", "screening", "technical", "final", "offer"] as const;
const OUTCOMES = ["ghosted", "rejected", "offer", "offer_revoked", "ghost_job", "withdrew"] as const;
const MAX_OPEN = 100;
const MIN_STORIES = 3;
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-03-31").refine((s) => {
  const t = Date.parse(s);
  return !Number.isNaN(t) && t <= Date.now() + 86400_000 && t >= Date.now() - 730 * 86400_000;
}, "Pick a date in the last two years");

type Row = {
  id: string; public_id: number; company_id: string | null; company_name: string; role: string | null; stage: string; status: string; outcome: string | null;
  applied_on: string; waiting_since: string; followups: number; last_followup: string | null; note_z: string | null; closed_at: string | null; created_at: string;
  company: { slug: string; name: string; color: string; logo_url: string | null } | null; story: { public_id: number } | null;
};
const SELECT = "id, public_id, company_id, company_name, role, stage, status, outcome, applied_on, waiting_since, followups, last_followup, note_z, closed_at, created_at, company:companies(slug, name, color, logo_url), story:stories(public_id)";

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)]! : null; };

// Usual waits for the companies in this list, plus the platform's per round.
async function benchmarks(companyIds: string[]) {
  const since = new Date(Date.now() - 365 * 86400_000).toISOString();
  const [co, all] = await Promise.all([
    companyIds.length
      ? admin().from("stories").select("company_id, stage, days_waited").eq("status", "published").in("company_id", companyIds).not("days_waited", "is", null).limit(5000)
      : Promise.resolve({ data: [], error: null }),
    admin().from("stories").select("stage, days_waited").eq("status", "published").not("days_waited", "is", null).gte("created_at", since).limit(10000),
  ]);
  if (co.error) dbFail("waiting benchmarks", co.error);
  if (all.error) dbFail("waiting benchmarks", all.error);
  const byCo = new Map<string, number[]>(), byCoStage = new Map<string, number[]>(), byStage = new Map<string, number[]>();
  const push = (m: Map<string, number[]>, k: string, v: number) => { const a = m.get(k) ?? []; a.push(v); m.set(k, a); };
  for (const r of (co.data ?? []) as { company_id: string; stage: string; days_waited: number }[]) { push(byCo, r.company_id, r.days_waited); push(byCoStage, `${r.company_id}:${r.stage}`, r.days_waited); }
  for (const r of (all.data ?? []) as { stage: string; days_waited: number }[]) push(byStage, r.stage, r.days_waited);
  return (companyId: string | null, stage: string) => {
    const cs = companyId ? byCoStage.get(`${companyId}:${stage}`) : undefined;
    if (cs && cs.length >= MIN_STORIES) return { days: median(cs)!, basis: "company_stage" as const, stories: cs.length };
    const c = companyId ? byCo.get(companyId) : undefined;
    if (c && c.length >= MIN_STORIES) return { days: median(c)!, basis: "company" as const, stories: c.length };
    const p = byStage.get(stage);
    if (p && p.length >= MIN_STORIES) return { days: median(p)!, basis: "platform" as const, stories: p.length };
    return null;
  };
}

const toDto = (r: Row, usual: Awaited<ReturnType<typeof benchmarks>>) => ({
  publicId: String(r.public_id),
  company: r.company ? { slug: r.company.slug, name: r.company.name, color: r.company.color, logoUrl: r.company.logo_url } : { slug: null, name: r.company_name, color: null, logoUrl: null },
  role: r.role, stage: r.stage, status: r.status, outcome: r.outcome,
  appliedOn: r.applied_on, waitingSince: r.waiting_since, followups: r.followups, lastFollowup: r.last_followup,
  note: unsealJson<string>(r.note_z) ?? null,
  storyPublicId: r.story ? String(r.story.public_id) : null,
  closedAt: r.closed_at, createdAt: r.created_at,
  usual: r.status === "waiting" ? usual(r.company_id, r.stage) : null,
});

const company = async (slug: string) => {
  const { data, error } = await admin().from("companies").select("id, name").eq("slug", slug).maybeSingle();
  if (error) dbFail("waiting company", error);
  if (!data) throw new ApiError(404, "company_not_found", "That company isn't listed.");
  return data as { id: string; name: string };
};

const note = z.union([z.string().trim().max(1000), z.null()]).optional();
const create = z.object({
  companySlug: z.string().regex(/^[a-z0-9-]{2,60}$/).optional(),
  companyName: z.string().trim().min(1).max(80).optional(),
  role: detailText(80),
  stage: z.enum(STAGES).default("application"),
  appliedOn: day.optional(),
  waitingSince: day.optional(),
  note,
}).strict().refine((b) => b.companySlug || b.companyName, "Pick a company");

const update = z.object({
  role: detailText(80),
  stage: z.enum(STAGES).optional(),
  waitingSince: day.optional(),
  appliedOn: day.optional(),
  note,
  // "I followed up today": counts it without resetting the clock (a follow-up isn't a reply).
  followedUp: z.literal(true).optional(),
  // Heard back and moved on to the next round: new stage, clock restarts today.
  advance: z.enum(STAGES).optional(),
  // Done: closes it with how it ended. `reopen` puts it back in the waiting list.
  close: z.enum(OUTCOMES).optional(),
  reopen: z.literal(true).optional(),
  storyPublicId: publicId.optional(),
}).strict();

const today = () => new Date().toISOString().slice(0, 10);

export const applicationRoutes = new Hono<AppEnv>()
  .use(requireAuth)

  .get("/", rateLimit({ name: "apps-list", max: 120, windowSeconds: 60, by: "user" }), async (c) => {
    const { data, error } = await admin().from("applications").select(SELECT).eq("user_id", me(c).id).order("status", { ascending: false }).order("waiting_since", { ascending: true }).limit(300);
    if (error) dbFail("applications (run supabase/init_database.sql on a fresh project)", error);
    const rows = (data ?? []) as unknown as Row[];
    const usual = await benchmarks([...new Set(rows.filter((r) => r.status === "waiting" && r.company_id).map((r) => r.company_id!))]);
    return c.json({ applications: rows.map((r) => toDto(r, usual)) });
  })

  .post("/", rateLimit({ name: "apps-create", max: 60, windowSeconds: 3600, by: "user" }), validate("json", create), async (c) => {
    const b = c.req.valid("json");
    const { count } = await admin().from("applications").select("id", { count: "exact", head: true }).eq("user_id", me(c).id).eq("status", "waiting");
    if ((count ?? 0) >= MAX_OPEN) throw new ApiError(429, "too_many_open", `You're tracking ${MAX_OPEN} open applications already. Close a few first.`);
    const co = b.companySlug ? await company(b.companySlug) : null;
    const applied = b.appliedOn ?? today();
    const since = b.waitingSince ?? applied;
    if (since < applied) throw new ApiError(400, "bad_dates", "The last reply can't be before you applied.", { waitingSince: "Can't be before the application date" });
    const { data, error } = await admin().from("applications").insert({
      user_id: me(c).id, company_id: co?.id ?? null, company_name: co?.name ?? b.companyName!, role: b.role ?? null, stage: b.stage,
      applied_on: applied, waiting_since: since, note_z: b.note ? sealJson(b.note) : null,
    }).select(SELECT).single();
    if (error) dbFail("add application", error);
    later(bump({ user: me(c).id, topics: ["applications"] }));
    const row = data as unknown as Row;
    return c.json({ application: toDto(row, await benchmarks(row.company_id ? [row.company_id] : [])) }, 201);
  })

  .patch("/:publicId", rateLimit({ name: "apps-update", max: 240, windowSeconds: 3600, by: "user" }), validate("param", z.object({ publicId })), validate("json", update), async (c) => {
    const b = c.req.valid("json");
    const { data: cur, error: e1 } = await admin().from("applications").select("id, applied_on, waiting_since, followups, status").eq("user_id", me(c).id).eq("public_id", c.req.valid("param").publicId).maybeSingle();
    if (e1) dbFail("application", e1);
    if (!cur) throw new ApiError(404, "not_found", "That application isn't in your Waiting Room.");
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (b.role !== undefined) patch["role"] = b.role;
    if (b.stage) patch["stage"] = b.stage;
    if (b.appliedOn) patch["applied_on"] = b.appliedOn;
    if (b.waitingSince) patch["waiting_since"] = b.waitingSince;
    if (b.note !== undefined) patch["note_z"] = b.note ? sealJson(b.note) : null;
    if (b.followedUp) { patch["followups"] = Math.min(99, cur.followups + 1); patch["last_followup"] = today(); }
    if (b.advance) { patch["stage"] = b.advance; patch["waiting_since"] = today(); patch["status"] = "waiting"; }
    if (b.close) { patch["status"] = "closed"; patch["outcome"] = b.close; patch["closed_at"] = new Date().toISOString(); }
    if (b.reopen) { patch["status"] = "waiting"; patch["outcome"] = null; patch["closed_at"] = null; }
    if (b.storyPublicId) {
      const { data: s } = await admin().from("stories").select("id").eq("public_id", b.storyPublicId).eq("author_id", me(c).id).maybeSingle();
      if (!s) throw new ApiError(404, "story_not_found", "That story isn't yours.");
      patch["story_id"] = (s as { id: string }).id;
    }
    const applied = (patch["applied_on"] as string | undefined) ?? cur.applied_on;
    const since = (patch["waiting_since"] as string | undefined) ?? cur.waiting_since;
    if (since < applied) throw new ApiError(400, "bad_dates", "The last reply can't be before you applied.", { waitingSince: "Can't be before the application date" });
    const { data, error } = await admin().from("applications").update(patch).eq("id", cur.id).select(SELECT).single();
    if (error) dbFail("update application", error);
    later(bump({ user: me(c).id, topics: ["applications"] }));
    const row = data as unknown as Row;
    return c.json({ application: toDto(row, await benchmarks(row.company_id ? [row.company_id] : [])) });
  })

  .delete("/:publicId", rateLimit({ name: "apps-delete", max: 120, windowSeconds: 3600, by: "user" }), validate("param", z.object({ publicId })), async (c) => {
    const { data, error } = await admin().from("applications").delete().eq("user_id", me(c).id).eq("public_id", c.req.valid("param").publicId).select("id");
    if (error) dbFail("delete application", error);
    if (!data?.length) throw new ApiError(404, "not_found", "That application is already gone.");
    later(bump({ user: me(c).id, topics: ["applications"] }));
    return c.json({ ok: true });
  });
