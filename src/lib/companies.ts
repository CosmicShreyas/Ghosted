// Companies: the endless list on the Companies page, and one company's page (/c/<slug>).
// With the API everything is real and live; in mock mode it's built from the sample data
// in the same shapes, and follow/bell are remembered in this browser so they can be tried.
import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiEnabled } from "@/lib/api";
import { useLive } from "@/lib/live";
import { askForPush } from "@/lib/push";
import { companyFromApi, fromApi, sampleModels, useCompanyIndex, type CompanyDto, type StoryDto, type StoryModel } from "@/lib/stories";
import { companies as sampleCompanies, type Company } from "@/mock/data";

export type CompanySort = "best" | "worst" | "stories" | "az";
const API_SORT: Record<CompanySort, string> = { best: "score", worst: "worst", stories: "stories", az: "az" };
const PAGE = 12;

// ---------- the list ----------

export function useCompanyList(sort: CompanySort, query: string) {
  const qc = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: ["companies", "list", sort, query],
    queryFn: async ({ pageParam }): Promise<{ items: Company[]; next: number | null }> => {
      if (!apiEnabled) {
        await new Promise((r) => setTimeout(r, 500)); // let the loading wave show, like the feed
        const all = sampleCompanies
          .filter((c) => !query || `${c.name} ${c.summary}`.toLowerCase().includes(query.toLowerCase()))
          .sort((a, b) => (sort === "az" ? a.name.localeCompare(b.name) : sort === "worst" ? a.score - b.score : b.score - a.score));
        const items = all.slice(pageParam, pageParam + PAGE);
        return { items, next: pageParam + PAGE < all.length ? pageParam + PAGE : null };
      }
      const r = await api<{ companies: CompanyDto[]; nextOffset: number | null }>(`/v1/companies?all=1&limit=${PAGE}&offset=${pageParam}&sort=${API_SORT[sort]}${query ? `&q=${encodeURIComponent(query)}` : ""}`);
      return { items: r.companies.map(companyFromApi), next: r.nextOffset };
    },
    initialPageParam: 0,
    getNextPageParam: (last) => last.next,
    staleTime: 60_000,
  });
  // Someone lists a company: the list refreshes (keeping your place).
  useLive("companies", () => void qc.invalidateQueries({ queryKey: ["companies", "list"] }));
  return {
    items: q.data?.pages.flatMap((p) => p.items) ?? [],
    loadingFirst: q.isPending,
    loadingMore: q.isFetchingNextPage,
    hasMore: !!q.hasNextPage,
    loadMore: () => { if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage(); },
  };
}

// ---------- one company ----------

export type CompanyRelationship = { following: boolean; notify: boolean };
export type CompanyStats = {
  stories: number; relatableReceived: number; flagsReceived: number; chitchats: number; followers: number;
  sentiment: { positive: number; mixed: number; critical: number };
  outcomes: { outcome: string; count: number }[];
  weekly: { week: string; positive: number; mixed: number; critical: number }[];
  byStage: { stage: string; avgDays: number | null; stories: number }[];
  salaries: { role: string; range: [number, number]; median: number; reports: number }[];
  bestStory: StoryModel | null; worstStory: StoryModel | null;
  // "Typical process" (needs 5+ stories; each figure is null when there isn't enough behind it).
  process?: ProcessSummary;
};
export type ProcessSummary =
  | { ready: false; stories: number; needed: number }
  | { ready: true; stories: number; usualStage: string | null; stageCounts: { stage: string; count: number }[]; medianDays: number | null; waitReports: number; outcomes: { outcome: string; share: number }[]; offerPay: { median: number; reports: number } | null };
// interest: members waiting for this company's first story ("I want to know"), and whether you are.
export type CompanyInterest = { waiting: number; mine: boolean };
export type CompanyPage = { company: Company; stats: CompanyStats; relationship: CompanyRelationship | null; stories: StoryModel[]; nextCursor: string | null; interest?: CompanyInterest };
type PageDto = { interest?: CompanyInterest; company: CompanyDto; stats: Omit<CompanyStats, "bestStory" | "worstStory"> & { bestStory: StoryDto | null; worstStory: StoryDto | null }; relationship: CompanyRelationship | null; stories: StoryDto[]; nextCursor: string | null };

// Average stars behind a sample story, from its company's scores (samples have no ratings of their own).
const sampleAvg = (s: StoryModel) => (s.outcome === "offer" ? 4.4 : s.outcome === "rejected" ? 3 : 1.8);

function samplePage(slug: string, rel: CompanyRelationship | null): CompanyPage | null {
  const company = sampleCompanies.find((c) => c.id === slug);
  if (!company) return null;
  const stories = sampleModels().filter((s) => s.company.id === slug);
  const positive = stories.filter((s) => sampleAvg(s) >= 3.6), critical = stories.filter((s) => sampleAvg(s) <= 2.4);
  const n = slug.length;
  return {
    company,
    stats: {
      stories: stories.length, relatableReceived: stories.reduce((a, s) => a + s.relatable, 0), flagsReceived: stories.reduce((a, s) => a + s.flags, 0),
      chitchats: stories.reduce((a, s) => a + s.comments, 0), followers: 30 + n * 11 + (rel?.following ? 1 : 0),
      sentiment: { positive: positive.length, mixed: stories.length - positive.length - critical.length, critical: critical.length },
      outcomes: ["ghosted", "rejected", "offer", "offer_revoked", "ghost_job"].map((o) => ({ outcome: o, count: stories.filter((s) => s.outcome === o).length })),
      weekly: Array.from({ length: 8 }, (_, i) => ({ week: `W${i + 1}`, positive: (i + n) % 3, mixed: (i * 2 + n) % 2, critical: (i + n * 2) % 4 })),
      byStage: [["application", 6], ["screening", 4], ["technical", 8], ["final", 13], ["offer", 5]].map(([stage, d]) => ({ stage: stage as string, avgDays: d as number, stories: 3 })),
      salaries: [{ role: "Software Engineer", range: company.salary, median: Math.round((company.salary[0] + company.salary[1]) / 2), reports: 6 }],
      bestStory: positive[0] ?? null, worstStory: critical[0] ?? null,
      // Preview mode never invents a process summary: the sample shows the "needs more stories" state.
      process: { ready: false, stories: stories.length, needed: Math.max(1, 5 - stories.length) },
    },
    relationship: rel ?? { following: false, notify: false },
    stories, nextCursor: null,
  };
}

const DEMO = "ghosted.demoCompanyFollows";
const readDemo = (): Record<string, CompanyRelationship> => { try { return JSON.parse(localStorage.getItem(DEMO) ?? "{}") as Record<string, CompanyRelationship>; } catch { return {}; } };

export function useCompanyPage(slug: string) {
  const qc = useQueryClient();
  // The page loads alongside the company index (not after it): stories about other companies fill
  // in their details as soon as the index arrives.
  const { index } = useCompanyIndex();
  const key = ["company-page", slug];
  const q = useQuery({ queryKey: key, queryFn: () => api<PageDto>(`/v1/companies/${slug}`), enabled: apiEnabled, retry: (n, e) => !(e as { status?: number }).status && n < 2 });
  // New stories, follows and edits about this company refresh the page.
  useLive(apiEnabled ? `company:${slug}` : null, () => void qc.invalidateQueries({ queryKey: key }));

  const [demoRel, setDemoRel] = useState<CompanyRelationship | null>(null);
  useEffect(() => { if (!apiEnabled) setDemoRel(readDemo()[slug] ?? null); }, [slug]);

  const page: CompanyPage | null | undefined = apiEnabled
    ? q.data && {
        company: companyFromApi(q.data.company),
        stats: { ...q.data.stats, bestStory: q.data.stats.bestStory && fromApi(q.data.stats.bestStory, index), worstStory: q.data.stats.worstStory && fromApi(q.data.stats.worstStory, index) },
        relationship: q.data.relationship, stories: q.data.stories.map((s) => fromApi(s, index)), nextCursor: q.data.nextCursor,
        ...(q.data.interest && { interest: q.data.interest }),
      }
    : samplePage(slug, demoRel);

  const set = async (method: "POST" | "DELETE", body: unknown, demo: CompanyRelationship) => {
    if (!apiEnabled) { const all = readDemo(); all[slug] = demo; try { localStorage.setItem(DEMO, JSON.stringify(all)); } catch { /* storage blocked */ } setDemoRel(demo); return; }
    // Flips at once; the server's answer confirms it (or it flips back if the request fails).
    const before = qc.getQueryData<PageDto>(key)?.relationship;
    qc.setQueryData<PageDto>(key, (d) => (d ? { ...d, relationship: demo } : d));
    try {
      const r = await api<{ relationship: CompanyRelationship }>(`/v1/companies/${slug}/follow`, { method, ...(body !== undefined && { body }) });
      qc.setQueryData<PageDto>(key, (d) => (d ? { ...d, relationship: r.relationship } : d));
      if (method === "POST") askForPush("follow"); // the moment notifications make sense, never on first load
    } catch (err) {
      if (before) qc.setQueryData<PageDto>(key, (d) => (d ? { ...d, relationship: before } : d));
      throw err;
    }
  };
  const rel = page?.relationship ?? { following: false, notify: false };
  return {
    page,
    loading: apiEnabled && q.isPending,
    notFound: apiEnabled ? (q.error as { status?: number } | null)?.status === 404 : page === null,
    error: apiEnabled && q.isError && (q.error as { status?: number }).status !== 404,
    follow: () => set("POST", {}, { ...rel, following: true }),
    unfollow: () => set("DELETE", undefined, { following: false, notify: false }),
    setNotify: (notify: boolean) => set("POST", { notify }, { following: true, notify }),
    // "I want to know about this company": join (or leave) the list waiting for its first story.
    setInterest: async (on: boolean) => {
      if (!apiEnabled) return;
      const r = await api<{ interest: CompanyInterest }>(`/v1/companies/${slug}/interest`, { method: on ? "POST" : "DELETE" });
      qc.setQueryData<PageDto>(key, (d) => (d ? { ...d, interest: r.interest } : d));
    },
    report: async (reason: string, details: string) => {
      if (!apiEnabled) return "Thanks. In the live app, moderators check reported listings within 24 hours.";
      return (await api<{ message: string }>(`/v1/companies/${slug}/report`, { method: "POST", body: { reason, ...(details.trim() && { details: details.trim() }) } })).message;
    },
  };
}
