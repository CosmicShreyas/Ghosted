// Your numbers on the home card (GET /v1/me/stats): stories shared, people your stories helped, and
// your day streak. Live: your own posts ("stories") and reactions to them ("notifications") refresh
// it. Without the API (mock mode) it shows sample numbers.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiEnabled } from "@/lib/api";
import { useLive } from "@/lib/live";

export type MyStats = { stories: number; peopleHelped: number; streak: number; activeToday: boolean };
const SAMPLE: MyStats = { stories: 3, peopleHelped: 1840, streak: 12, activeToday: true };

export function useMyStats() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["my-stats"], queryFn: () => api<MyStats>("/v1/me/stats"), enabled: apiEnabled, staleTime: 60_000 });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["my-stats"] });
  useLive(apiEnabled ? "stories" : null, refresh);
  useLive(apiEnabled ? "notifications" : null, refresh);
  return { stats: apiEnabled ? q.data ?? null : SAMPLE, loading: apiEnabled && q.isPending };
}

// 1840 → "1.8k", 12500 → "12.5k", 950 → "950".
export { formatCount as compact } from "@/lib/utils";
