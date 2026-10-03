// The top bar's search, answered by the API (GET /v1/search: concept matching, typo tolerance,
// ranking; see backend/src/algorithms/search.ts). Waits for a pause in typing. Without the API (the
// mock mode) callers keep filtering the sample stories locally.
import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiEnabled } from "@/lib/api";
import { companyFromApi, fromApi, useCompanyIndex, type CompanyDto, type Revealed, type StoryDto, type StoryModel } from "@/lib/stories";
import type { Company } from "@/mock/data";

export type PersonSearchResult = {
  publicId: string; name: string; handle: string; avatarSeed: string; pastel: string;
  revealed: Revealed | null; isMe: boolean; following: boolean;
};
export type SearchResult = { stories: StoryModel[]; companies: Company[]; people: PersonSearchResult[]; understood: { terms: string[]; company: string | null; outcome: string | null; stage: string | null; phrases: string[]; exclude: string[] } };
type SearchDto = { stories: StoryDto[]; companies: CompanyDto[]; people: PersonSearchResult[]; understood: SearchResult["understood"] };

export function useSearch(query: string) {
  const qc = useQueryClient();
  const trimmed = query.trim();
  const [q, setQ] = useState(trimmed);
  useEffect(() => { const t = setTimeout(() => setQ(trimmed), 300); return () => clearTimeout(t); }, [trimmed]);
  const { index } = useCompanyIndex();
  const r = useQuery({
    queryKey: ["search", q],
    queryFn: () => api<SearchDto>(`/v1/search?q=${encodeURIComponent(q)}`),
    enabled: apiEnabled && q.length >= 2, staleTime: 30_000, placeholderData: keepPreviousData,
  });
  const data = useMemo<SearchResult | null>(() => (r.data ? { stories: r.data.stories.map((s) => fromApi(s, index)), companies: r.data.companies.map(companyFromApi), people: r.data.people ?? [], understood: r.data.understood } : null), [r.data, index]);
  const setFollowing = async (person: PersonSearchResult, following: boolean) => {
    const key = ["search", q];
    qc.setQueryData<SearchDto>(key, (old) => old ? { ...old, people: old.people.map((p) => p.publicId === person.publicId ? { ...p, following } : p) } : old);
    try {
      await api(`/v1/profiles/${person.publicId}/follow`, { method: following ? "POST" : "DELETE", ...(following && { body: {} }) });
      void qc.invalidateQueries({ queryKey: ["person", person.publicId] });
    } catch (error) {
      qc.setQueryData<SearchDto>(key, (old) => old ? { ...old, people: old.people.map((p) => p.publicId === person.publicId ? { ...p, following: person.following } : p) } : old);
      throw error;
    }
  };
  const debouncing = trimmed !== q;
  return { active: apiEnabled && trimmed.length >= 2, data, debouncing, loading: debouncing || (r.isFetching && !r.data), refreshing: !debouncing && r.isFetching && !!r.data, setFollowing };
}
