// Reply pledges (badge rules in lib/pledge.ts). One live pledge per company at a time; a rep makes
// it, any of the company's reps can withdraw it, moderators can withdraw it too. Withdrawn pledges
// stay on record and show "Pledge withdrawn" until the company makes a new one. Never purchasable.
// The badge is recomputed nightly (automation.ts) and right after a pledge is made.
import { ApiError, dbFail } from "./errors.js";
import { bump } from "./live.js";
import { admin } from "./supabase.js";
import { pledgeBadge, type PledgeDays } from "./lib/pledge.js";

type PledgeRow = { id: string; company_id: string; days: number; made_at: string; withdrawn_at: string | null; badge: string; stories_n: number; kept_n: number };

// The pledge shown for each company: the live one, or else the most recent withdrawn one.
export async function pledgesFor(companyIds: string[]) {
  const out = new Map<string, { days: number; madeAt: string; withdrawnAt: string | null; badge: string; stories: number; kept: number }>();
  if (!companyIds.length) return out;
  const { data, error } = await admin().from("company_pledges").select("company_id, days, made_at, withdrawn_at, badge, stories_n, kept_n").in("company_id", companyIds).order("made_at", { ascending: false }).limit(2000);
  if (error) return out; // before the SQL runs
  for (const r of (data ?? []) as Omit<PledgeRow, "id">[]) {
    const cur = out.get(r.company_id);
    if (cur && (!cur.withdrawnAt || r.withdrawn_at)) continue; // keep the live one, or the newest
    out.set(r.company_id, { days: r.days, madeAt: r.made_at, withdrawnAt: r.withdrawn_at, badge: r.badge, stories: r.stories_n, kept: r.kept_n });
  }
  return out;
}

async function recompute(p: Pick<PledgeRow, "id" | "company_id" | "days" | "made_at" | "withdrawn_at">) {
  const { data } = await admin().from("stories").select("outcome, days_waited, created_at").eq("company_id", p.company_id).eq("status", "published").gte("created_at", p.made_at).limit(5000);
  const b = pledgeBadge((data ?? []) as { outcome: string; days_waited: number | null; created_at: string }[], p.days, p.made_at, !!p.withdrawn_at);
  await admin().from("company_pledges").update({ badge: b.badge, stories_n: b.stories, kept_n: b.kept, computed_at: new Date().toISOString() }).eq("id", p.id);
}

export async function makePledge(repId: string, company: { id: string; slug: string }, days: PledgeDays) {
  const { data, error } = await admin().from("company_pledges").insert({ company_id: company.id, rep_user_id: repId, days }).select("id, company_id, days, made_at, withdrawn_at").single();
  if (error?.code === "23505") throw new ApiError(409, "pledge_exists", "Your company already has a live pledge. Withdraw it first to make a new one.");
  if (error) dbFail("pledge (run the Reply pledges section of init_database.sql)", error);
  await recompute(data as PledgeRow);
  await bump({ shared: [`company:${company.slug}`, "companies"] });
}

export async function withdrawPledge(companyId: string, slug: string, by: "rep" | "moderator") {
  const { data, error } = await admin().from("company_pledges").update({ withdrawn_at: new Date().toISOString(), withdrawn_by: by, badge: "withdrawn" }).eq("company_id", companyId).is("withdrawn_at", null).select("id");
  if (error) dbFail("withdraw pledge", error);
  if (!data?.length) throw new ApiError(404, "no_pledge", "There's no live pledge to withdraw.");
  await bump({ shared: [`company:${slug}`, "companies"] });
}

// Nightly: every live pledge gets a fresh badge.
export async function recomputePledges() {
  const { data, error } = await admin().from("company_pledges").select("id, company_id, days, made_at, withdrawn_at").is("withdrawn_at", null).limit(2000);
  if (error) return { error: error.message };
  for (const p of (data ?? []) as PledgeRow[]) await recompute(p);
  return { recomputed: data?.length ?? 0 };
}
