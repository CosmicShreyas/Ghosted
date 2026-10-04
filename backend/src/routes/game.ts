// Ghost Blasters leaderboard (cosmetic only; see the game in src/game/ghost-blasters.ts).
//
//   POST /v1/game/start        a sealed ticket holding who you are and when the run began
//   POST /v1/game/score        submit a finished run with its ticket; keeps your best
//   GET  /v1/game/leaderboard  the top runs, anonymous handles only (cached for a minute)
//   GET  /v1/game/me           your best and your rank
//
// Scores are never taken on trust. The run length is the time since the ticket was issued (the
// client's own number can only lower it), and Experience is capped by the most the game can award
// in that time: offers can't arrive faster than one every 7 seconds after the first at 4 seconds,
// and shooting yields at most ~50 Experience a second. Anything above the cap is lowered to it.
// It's a game: no rewards, no effect on anything else on Ghosted.
import { Hono } from "hono";
import { z } from "zod";
import { ApiError, dbFail } from "../errors.js";
import { unsealJson, sealJson } from "../lib/sealed.js";
import { me, optionalAuth, rateLimit, requireAuth, type AppEnv } from "../security.js";
import { admin } from "../supabase.js";
import { banOf } from "../platform.js";
import { validate } from "../validate.js";

const TICKET_HOURS = 3;
const SHOT_XP_PER_SECOND = 50;
const BOARD = 20;

type Ticket = { u: string; t: number; k: "gb" };

// The most offers a run of `seconds` can hold, and the Experience they give (100 × the new level).
export const maxOffers = (seconds: number) => (seconds < 4 ? 0 : 1 + Math.floor((seconds - 4) / 7));
export const offerXp = (offers: number) => { let xp = 0; for (let l = 2; l <= offers + 1; l++) xp += 100 * l; return xp; };
// Shooting: a big enemy is worth 55 in all (15, then 2 × 10, then 4 × 5) and big ones arrive at most
// one per 1.1 s after the first three, so ~50 a second plus the opening three (165) is the ceiling.
export const maxXp = (seconds: number, offers: number) => offerXp(Math.min(offers, maxOffers(seconds))) + SHOT_XP_PER_SECOND * seconds + 200;

const score = z.object({
  ticket: z.string().min(40).max(600),
  xp: z.number().int().min(0).max(10_000_000),
  level: z.number().int().min(1).max(10_000),
  offers: z.number().int().min(0).max(10_000),
  seconds: z.number().int().min(0).max(86_400),
}).strict();

type Row = { xp: number; level: number; offers: number; seconds: number; updated_at: string; profile: { handle: string; avatar_seed: string; pastel: string; kind?: string | null } | null };

export const gameRoutes = new Hono<AppEnv>()
  .post("/start", requireAuth, rateLimit({ name: "game-start", max: 120, windowSeconds: 3600, by: "user" }), (c) =>
    c.json({ ticket: sealJson({ u: me(c).id, t: Date.now(), k: "gb" } satisfies Ticket) }))

  .post("/score", requireAuth, rateLimit({ name: "game-score", max: 60, windowSeconds: 3600, by: "user" }), validate("json", score), async (c) => {
    const b = c.req.valid("json");
    const t = unsealJson<Ticket>(b.ticket);
    if (!t || t.k !== "gb" || t.u !== me(c).id) throw new ApiError(400, "bad_ticket", "That run can't be counted. Start a new one.");
    const elapsed = Math.floor((Date.now() - t.t) / 1000);
    if (elapsed < 0 || elapsed > TICKET_HOURS * 3600) throw new ApiError(400, "ticket_expired", "That run is too old to count. Start a new one.");
    // Clamp everything to what was actually possible in the time that really passed.
    const seconds = Math.min(b.seconds, elapsed);
    const offers = Math.min(b.offers, maxOffers(seconds));
    const xp = Math.min(b.xp, maxXp(seconds, offers));
    const level = offers + 1;
    const { data: cur, error: e1 } = await admin().from("game_scores").select("xp").eq("user_id", me(c).id).maybeSingle();
    if (e1) dbFail("game score (run the Ghost Blasters section of init_database.sql)", e1);
    const best = (cur as { xp: number } | null)?.xp ?? -1;
    if (xp > best) {
      const { error } = await admin().from("game_scores").upsert({ user_id: me(c).id, xp, level, offers, seconds, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) dbFail("save game score", error);
    }
    return c.json({ counted: xp, best: Math.max(xp, best), newBest: xp > best, clamped: xp < b.xp });
  })

  .get("/leaderboard", rateLimit({ name: "game-board", max: 120, windowSeconds: 60 }), async (c) => {
    const { data, error } = await admin().from("game_scores")
      .select("xp, level, offers, seconds, updated_at, profile:profiles!game_scores_user_id_fkey(handle, avatar_seed, pastel, kind, banned_at, banned_until)")
      .order("xp", { ascending: false }).order("updated_at", { ascending: true }).limit(BOARD + 10);
    if (error) dbFail("game leaderboard (run the Ghost Blasters section of init_database.sql)", error);
    // Banned members and bots never appear.
    const rows = ((data ?? []) as unknown as (Row & { profile: Row["profile"] & { banned_at?: string | null; banned_until?: string | null } })[])
      .filter((r) => r.profile && r.profile.kind !== "bot" && !banOf(r.profile))
      .slice(0, BOARD);
    c.header("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=300");
    // Anonymous handles and avatars only, never real names or profile links.
    return c.json({ entries: rows.map((r, i) => ({ rank: i + 1, handle: r.profile!.handle, avatarSeed: r.profile!.avatar_seed, pastel: r.profile!.pastel, xp: r.xp, level: r.level, offers: r.offers })) });
  })

  .get("/me", optionalAuth, rateLimit({ name: "game-me", max: 120, windowSeconds: 60 }), async (c) => {
    const p = c.get("profile");
    if (!p) return c.json({ signedIn: false, best: null, rank: null });
    const { data, error } = await admin().from("game_scores").select("xp").eq("user_id", p.id).maybeSingle();
    if (error) dbFail("game best", error);
    const best = (data as { xp: number } | null)?.xp ?? null;
    let rank: number | null = null;
    if (best != null) {
      const { count } = await admin().from("game_scores").select("user_id", { count: "exact", head: true }).gt("xp", best);
      rank = (count ?? 0) + 1;
    }
    return c.json({ signedIn: true, best, rank });
  });
