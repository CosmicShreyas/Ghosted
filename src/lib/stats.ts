import { useQuery } from "@tanstack/react-query";
import { api, apiEnabled } from "@/lib/api";
import { prelaunchStats, type Stat } from "@/mock/data";

export type LiveStats = {
  stories: number; companies: number; ghosted: number; silenceDays: number;
  companiesListed?: number; replyRate?: number | null; replyRateN?: number; medianWait?: number | null; medianWaitN?: number;
};

// Returns null (pre-launch copy) when the API isn't configured or can't be reached.
async function fetchLiveStats(): Promise<LiveStats | null> {
  if (!apiEnabled) return null;
  return api<LiveStats>("/v1/stats").catch(() => null);
}

// A rate or a median from a handful of stories says nothing, so each live number needs enough data;
// until then its tile shows something that's true from day one instead.
const MIN_FOR_RATE = 20;
const MIN_FOR_WAIT = 10;

function toStats(live: LiveStats): Stat[] {
  const [anonymous, , free] = prelaunchStats as [Stat, Stat, Stat, Stat];
  return [
    { value: live.stories, label: live.stories === 1 ? "hiring story shared" : "hiring stories shared" },
    { value: live.companiesListed ?? live.companies, label: (live.companiesListed ?? live.companies) === 1 ? "company on Ghosted" : "companies on Ghosted" },
    live.replyRate != null && (live.replyRateN ?? 0) >= MIN_FOR_RATE
      ? { value: live.replyRate, suffix: "%", label: "of candidates got any reply" }
      : anonymous,
    live.medianWait != null && (live.medianWaitN ?? 0) >= MIN_FOR_WAIT
      ? { value: live.medianWait, suffix: live.medianWait === 1 ? " day" : " days", label: "median wait for a reply" }
      : { ...free, label: "companies can pay to change a score" },
  ];
}

// Live numbers once the API has real data; honest pre-launch numbers until then or on failure.
export function useLandingStats(): { stats: Stat[]; live: boolean } {
  const { data } = useQuery({ queryKey: ["landing-stats"], queryFn: fetchLiveStats, retry: false, staleTime: 60_000 });
  return data && data.stories > 0 ? { stats: toStats(data), live: true } : { stats: prelaunchStats, live: false };
}
