// A person's page: who they are (as they currently appear), their stats, and your relationship with
// them. Live: follows, new stories and reactions refresh it through the "person:<id>" topic.
// Without the API (mock mode) the page is built from the sample data, and follow/bell/mute
// are remembered in this browser so the buttons can be tried.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiEnabled } from "@/lib/api";
import { useLive } from "@/lib/live";
import { fromApi, sampleModels, sampleUserIdFor, useCompanyIndex, type Author, type StoryDto, type StoryModel } from "@/lib/stories";
import { getUser, users } from "@/mock/data";
import { GOOFY_AVATAR, GOOFY_BIO, isGoofy, SAMPLE_GOOFY_ACTIVITY, SAMPLE_GOOFY_STATS, type GoofyActivity, type GoofyStats } from "@/lib/goofy";

export type Relationship = { following: boolean; notify: boolean; muted: boolean };
export type PersonStats = {
  stories: number; relatableReceived: number; flagsReceived: number; chitchatsReceived: number;
  followers: number; following: number; companies: number; avgDaysWaited: number | null;
  outcomes: { outcome: string; count: number }[];
  weekly: { week: string; relatable: number; flags: number }[];
  topCompanies: { slug: string; name: string; color: string; stories: number }[];
  ratings: { hiring: number | null; communication: number | null; culture: number | null; pay: number | null; growth: number | null } | null;
};
// level/title: public (the LV badge). progress: only on your own page.
export type Person = Author & {
  handle?: string; joinedAt: string | null; isMe: boolean; title?: string;
  progress?: { xp: number; into: number; need: number; streak: number; activeToday: boolean };
  bot?: { badge: string; avatarUrl: string; bio: string };
};
export type PersonPage = {
  profile: Person; stats: PersonStats; relationship: Relationship | null; stories: StoryModel[]; nextCursor: string | null;
  // Goofy's page only: his numbers and the first page of his activity.
  goofy?: GoofyStats; activity?: GoofyActivity[]; activityCursor?: string | null;
};

type PageDto = Omit<PersonPage, "stories" | "profile"> & { profile: Person; stories: StoryDto[] };

const OUTCOMES = ["ghosted", "rejected", "offer", "offer_revoked", "ghost_job"];

// ---------- sample data ----------

const DEMO_REL = "ghosted.demoRelationships";
const readRel = (): Record<string, Relationship> => { try { return JSON.parse(localStorage.getItem(DEMO_REL) ?? "{}") as Record<string, Relationship>; } catch { return {}; } };
const writeRel = (all: Record<string, Relationship>) => { try { localStorage.setItem(DEMO_REL, JSON.stringify(all)); } catch { /* storage blocked */ } };

function samplePage(publicId: string, rel: Relationship | null): PersonPage | null {
  if (isGoofy(publicId)) return {
    profile: { publicId, name: "Goofy", avatarSeed: "goofy-automod", pastel: "bg-avatar-lilac", revealed: null, joinedAt: "2026-01-01T00:00:00.000Z", isMe: false, bot: { badge: "AutoMod", avatarUrl: GOOFY_AVATAR, bio: GOOFY_BIO } },
    stats: { stories: 0, relatableReceived: 0, flagsReceived: 0, chitchatsReceived: 0, followers: SAMPLE_GOOFY_STATS.followers + (rel?.following ? 1 : 0), following: 0, companies: 0, avgDaysWaited: null, outcomes: [], weekly: [], topCompanies: [], ratings: null },
    goofy: { ...SAMPLE_GOOFY_STATS, followers: SAMPLE_GOOFY_STATS.followers + (rel?.following ? 1 : 0) }, activity: SAMPLE_GOOFY_ACTIVITY, activityCursor: null,
    relationship: { following: rel?.following ?? false, notify: false, muted: false }, stories: [], nextCursor: null,
  };
  const userId = sampleUserIdFor(publicId);
  if (!users.some((u) => u.id === userId)) return null;
  const user = getUser(userId);
  const mine = sampleModels().filter((s) => s.author.publicId === publicId);
  const byCompany = new Map<string, { slug: string; name: string; color: string; stories: number }>();
  for (const s of mine) { const e = byCompany.get(s.company.id) ?? { slug: s.company.id, name: s.company.name, color: s.company.color, stories: 0 }; e.stories++; byCompany.set(s.company.id, e); }
  const n = Number(publicId.slice(-2));
  const avg = (k: keyof StoryModel["company"]["scores"]) => { const v = mine.map((s) => s.company.scores[k]).filter((x): x is number => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
  return {
    profile: { publicId, name: user.handle, avatarSeed: user.seed, pastel: user.pastel, revealed: null, joinedAt: null, isMe: userId === "u1" },
    stats: {
      stories: mine.length,
      relatableReceived: mine.reduce((a, s) => a + s.relatable, 0),
      flagsReceived: mine.reduce((a, s) => a + s.reactions.insightful + s.reactions.creative + s.reactions.support + s.reactions.love, 0),
      chitchatsReceived: mine.reduce((a, s) => a + s.comments, 0),
      followers: 40 + n * 17 + (rel?.following ? 1 : 0), following: 12 + n * 3, companies: byCompany.size, avgDaysWaited: 10 + n * 2,
      outcomes: OUTCOMES.map((o) => ({ outcome: o, count: mine.filter((s) => s.outcome === o).length })),
      // A plausible 8-week shape for the preview (the API returns the real numbers).
      weekly: Array.from({ length: 8 }, (_, i) => ({ week: `W${i + 1}`, relatable: Math.round(20 + 30 * Math.abs(Math.sin((i + n) * 0.9))), flags: Math.round(4 + 12 * Math.abs(Math.cos((i + n) * 0.7))) })),
      topCompanies: [...byCompany.values()].sort((a, b) => b.stories - a.stories),
      ratings: mine.length ? { hiring: avg("hiring"), communication: avg("communication"), culture: avg("culture"), pay: avg("pay"), growth: avg("growth") } : null,
    },
    relationship: userId === "u1" ? null : rel ?? { following: false, notify: false, muted: false },
    stories: mine, nextCursor: null,
  };
}

// ---------- hook ----------

export function usePerson(publicId: string) {
  const qc = useQueryClient();
  const { index } = useCompanyIndex(); // loads alongside, not before
  const key = ["person", publicId];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => api<PageDto>(`/v1/profiles/${publicId}`),
    enabled: apiEnabled,
    retry: (n, err) => !(err as { status?: number }).status && n < 2,
  });
  useLive(apiEnabled ? `person:${publicId}` : null, () => void qc.invalidateQueries({ queryKey: key }));

  const [demoRel, setDemoRel] = useState<Relationship | null>(null);
  useEffect(() => { if (!apiEnabled) setDemoRel(readRel()[publicId] ?? null); }, [publicId]);

  const page: PersonPage | null | undefined = apiEnabled
    ? q.data && { ...q.data, stories: q.data.stories.map((s) => fromApi(s, index)) }
    : samplePage(publicId, demoRel);

  // Server answers with the new relationship; the page refetches its counts in the background.
  const apply = (rel: Relationship) => {
    if (!apiEnabled) { const all = readRel(); all[publicId] = rel; writeRel(all); setDemoRel(rel); return; }
    qc.setQueryData<PageDto>(key, (d) => (d ? { ...d, relationship: rel } : d));
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ["feed"] }); // muting changes the feed
  };
  const call = async (method: "POST" | "DELETE", path: string, body?: unknown, demo?: Relationship) => {
    if (!apiEnabled) return apply(demo!);
    // Flips at once; the server's answer confirms it (or it flips back if the request fails).
    const before = qc.getQueryData<PageDto>(key)?.relationship;
    if (demo) qc.setQueryData<PageDto>(key, (d) => (d ? { ...d, relationship: demo } : d));
    try {
      const r = await api<{ relationship: Relationship }>(`/v1/profiles/${publicId}${path}`, { method, ...(body !== undefined && { body }) });
      apply(r.relationship);
    } catch (err) {
      if (before) qc.setQueryData<PageDto>(key, (d) => (d ? { ...d, relationship: before } : d));
      throw err;
    }
  };
  const rel = page?.relationship ?? { following: false, notify: false, muted: false };

  return {
    page,
    loading: apiEnabled && q.isPending,
    notFound: apiEnabled ? (q.error as { status?: number } | null)?.status === 404 : page === null,
    error: apiEnabled && q.isError && (q.error as { status?: number }).status !== 404,
    follow: () => call("POST", "/follow", {}, { ...rel, following: true }),
    unfollow: () => call("DELETE", "/follow", undefined, { ...rel, following: false, notify: false }),
    // The bell: following is implied, so ringing it for someone you don't follow follows them too.
    setNotify: (notify: boolean) => call("POST", "/follow", { notify }, { ...rel, following: true, notify }),
    mute: () => call("POST", "/mute", undefined, { ...rel, muted: true, notify: false }),
    unmute: () => call("DELETE", "/mute", undefined, { ...rel, muted: false }),
    report: async (reason: string, details: string) => {
      if (!apiEnabled) return "Thanks. In the live app, moderators review reports within 24 hours.";
      return (await api<{ message: string }>(`/v1/profiles/${publicId}/report`, { method: "POST", body: { reason, ...(details.trim() && { details: details.trim() }) } })).message;
    },
  };
}
