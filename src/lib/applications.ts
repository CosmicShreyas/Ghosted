// Waiting Room: your private list of applications you're waiting to hear back on. With the API it
// lives on your account (/v1/me/applications, live across your devices); in mock mode it's
// kept in this browser, with a few samples to start from.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiEnabled } from "@/lib/api";
import { useLive } from "@/lib/live";
import { companies as sampleCompanies } from "@/mock/data";

export type Stage = "application" | "screening" | "technical" | "final" | "offer";
export type Outcome = "ghosted" | "rejected" | "offer" | "offer_revoked" | "ghost_job" | "withdrew";
export type Usual = { days: number; basis: "company_stage" | "company" | "platform"; stories: number };
export type Application = {
  publicId: string;
  company: { slug: string | null; name: string; color: string | null; logoUrl: string | null };
  role: string | null; stage: Stage; status: "waiting" | "closed"; outcome: Outcome | null;
  appliedOn: string; waitingSince: string; followups: number; lastFollowup: string | null;
  note: string | null; storyPublicId: string | null; closedAt: string | null; createdAt: string;
  usual: Usual | null;
};
export type NewApplication = { companySlug?: string; companyName?: string; role?: string | null; stage: Stage; appliedOn?: string; waitingSince?: string; note?: string | null };
export type ApplicationPatch = { role?: string | null; stage?: Stage; appliedOn?: string; waitingSince?: string; note?: string | null; followedUp?: true; advance?: Stage; close?: Outcome; reopen?: true; storyPublicId?: string };

export const STAGE_LABEL: Record<Stage, string> = { application: "Applied", screening: "Screening", technical: "Technical", final: "Final round", offer: "Offer stage" };
export const NEXT_STAGE: Partial<Record<Stage, Stage>> = { application: "screening", screening: "technical", technical: "final", final: "offer" };
export const OUTCOME_WORD: Record<Outcome, string> = { ghosted: "Ghosted", rejected: "Rejected", offer: "Got the offer", offer_revoked: "Offer revoked", ghost_job: "Ghost job", withdrew: "I withdrew" };

const DAY = 86400_000;
export const isoDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// Whole days since a date, by the calendar (not 24-hour blocks), never negative.
export const daysSince = (iso: string, now = new Date()) => Math.max(0, Math.round((new Date(isoDay(now)).getTime() - new Date(iso).getTime()) / DAY));

// Where this wait stands against what people usually wait here.
export type Verdict = "fresh" | "on_track" | "late" | "ghosted";
export function verdict(a: Application, now = new Date()): Verdict {
  const d = daysSince(a.waitingSince, now);
  const usual = a.usual?.days ?? 14;
  if (d >= Math.max(30, usual * 2)) return "ghosted";
  if (d > usual) return "late";
  if (d <= 2) return "fresh";
  return "on_track";
}

// ---------- preview (no API) ----------

const KEY = "ghosted.waitingRoom";
const ago = (n: number) => isoDay(new Date(Date.now() - n * DAY));
const sampleUsual = (slug: string | null, stage: Stage): Usual => {
  const c = sampleCompanies.find((x) => x.id === slug);
  const base = c ? Math.round(4 + (100 - c.score) / 5) : 12;
  return { days: base + (stage === "final" ? 6 : stage === "technical" ? 2 : 0), basis: c ? "company_stage" : "platform", stories: c ? 14 : 120 };
};
function seed(): Application[] {
  const mk = (i: number, slug: string, role: string, stage: Stage, applied: number, since: number, extra: Partial<Application> = {}): Application => {
    const c = sampleCompanies.find((x) => x.id === slug)!;
    return { publicId: `demo-${i}`, company: { slug, name: c.name, color: c.color, logoUrl: null }, role, stage, status: "waiting", outcome: null,
      appliedOn: ago(applied), waitingSince: ago(since), followups: 0, lastFollowup: null, note: null, storyPublicId: null, closedAt: null, createdAt: new Date(Date.now() - applied * DAY).toISOString(), usual: null, ...extra };
  };
  const cos = sampleCompanies;
  return [
    mk(1, cos[cos.length - 1]!.id, "Backend Engineer", "final", 75, 61, { followups: 2, lastFollowup: ago(6), note: "Panel said \"you'll hear from us by Friday\"." }),
    mk(2, cos[2]!.id, "Product Designer", "technical", 30, 16),
    mk(3, cos[0]!.id, "Data Analyst", "application", 3, 3),
    mk(4, cos[4]!.id, "Frontend Engineer", "screening", 30, 18, { status: "closed", outcome: "rejected", closedAt: new Date(Date.now() - 2 * DAY).toISOString() }),
  ];
}
const withUsual = (list: Application[]) => list.map((a) => ({ ...a, usual: a.status === "waiting" ? sampleUsual(a.company.slug, a.stage) : null }));
function load(): Application[] {
  try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw) as Application[]; } catch { /* storage blocked */ }
  return seed();
}

// ---------- hook ----------

export function useApplications() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["applications"], queryFn: async () => (await api<{ applications: Application[] }>("/v1/me/applications")).applications, enabled: apiEnabled });
  useLive(apiEnabled ? "applications" : null, () => void qc.invalidateQueries({ queryKey: ["applications"] }));

  const [demo, setDemo] = useState<Application[] | null>(null);
  useEffect(() => { if (!apiEnabled) setDemo(load()); }, []);
  const saveDemo = (list: Application[]) => { setDemo(list); try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage blocked */ } };

  const list = apiEnabled ? q.data ?? [] : withUsual(demo ?? []);
  const put = (a: Application) => qc.setQueryData<Application[]>(["applications"], (d) => (d ? d.some((x) => x.publicId === a.publicId) ? d.map((x) => (x.publicId === a.publicId ? a : x)) : [...d, a] : [a]));

  return {
    list,
    loading: apiEnabled ? q.isPending : demo === null,
    error: apiEnabled && q.isError,
    add: async (n: NewApplication) => {
      if (!apiEnabled) {
        const c = sampleCompanies.find((x) => x.id === n.companySlug);
        const applied = n.appliedOn ?? isoDay();
        saveDemo([...(demo ?? []), { publicId: `demo-${Date.now()}`, company: c ? { slug: c.id, name: c.name, color: c.color, logoUrl: null } : { slug: null, name: n.companyName ?? "Company", color: null, logoUrl: null },
          role: n.role ?? null, stage: n.stage, status: "waiting", outcome: null, appliedOn: applied, waitingSince: n.waitingSince ?? applied, followups: 0, lastFollowup: null, note: n.note ?? null, storyPublicId: null, closedAt: null, createdAt: new Date().toISOString(), usual: null }]);
        return;
      }
      put((await api<{ application: Application }>("/v1/me/applications", { method: "POST", body: n })).application);
    },
    update: async (a: Application, p: ApplicationPatch) => {
      if (!apiEnabled) {
        const today = isoDay();
        const next: Application = { ...a,
          ...(p.role !== undefined && { role: p.role }), ...(p.stage && { stage: p.stage }), ...(p.appliedOn && { appliedOn: p.appliedOn }), ...(p.waitingSince && { waitingSince: p.waitingSince }), ...(p.note !== undefined && { note: p.note }),
          ...(p.followedUp && { followups: a.followups + 1, lastFollowup: today }),
          ...(p.advance && { stage: p.advance, waitingSince: today, status: "waiting" as const }),
          ...(p.close && { status: "closed" as const, outcome: p.close, closedAt: new Date().toISOString() }),
          ...(p.reopen && { status: "waiting" as const, outcome: null, closedAt: null }),
          ...(p.storyPublicId && { storyPublicId: p.storyPublicId }) };
        saveDemo((demo ?? []).map((x) => (x.publicId === a.publicId ? next : x)));
        return;
      }
      put((await api<{ application: Application }>(`/v1/me/applications/${a.publicId}`, { method: "PATCH", body: p })).application);
    },
    remove: async (a: Application) => {
      if (!apiEnabled) { saveDemo((demo ?? []).filter((x) => x.publicId !== a.publicId)); return; }
      await api(`/v1/me/applications/${a.publicId}`, { method: "DELETE" });
      qc.setQueryData<Application[]>(["applications"], (d) => d?.filter((x) => x.publicId !== a.publicId));
    },
  };
}
