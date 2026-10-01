// The top bar's search, answered by the API (GET /v1/search: concept matching, typo tolerance,
// ranking; see backend/src/algorithms/search.ts). Waits for a pause in typing. Without the API (the
// mock mode) callers keep filtering the sample stories locally.
import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, apiEnabled } from "@/lib/api";
import { companyFromApi, fromApi, useCompanyIndex, type CompanyDto, type StoryDto, type StoryModel } from "@/lib/stories";
import type { Company } from "@/mock/data";

export type SearchResult = { stories: StoryModel[]; companies: Company[]; understood: { terms: string[]; company: string | null; outcome: string | null; stage: string | null; phrases: string[]; exclude: string[] } };

export function useSearch(query: string) {
  const [q, setQ] = useState(query.trim());
  useEffect(() => { const t = setTimeout(() => setQ(query.trim()), 300); return () => clearTimeout(t); }, [query]);
  const { index } = useCompanyIndex();
  const r = useQuery({
    queryKey: ["search", q],
    queryFn: () => api<{ stories: StoryDto[]; companies: CompanyDto[]; understood: SearchResult["understood"] }>(`/v1/search?q=${encodeURIComponent(q)}`),
    enabled: apiEnabled && q.length >= 2, staleTime: 30_000, placeholderData: keepPreviousData,
  });
  const data = useMemo<SearchResult | null>(() => (r.data ? { stories: r.data.stories.map((s) => fromApi(s, index)), companies: r.data.companies.map(companyFromApi), understood: r.data.understood } : null), [r.data, index]);
  return { active: apiEnabled && query.trim().length >= 2, data, loading: r.isFetching && !r.data, refreshing: r.isFetching && !!r.data };
}
