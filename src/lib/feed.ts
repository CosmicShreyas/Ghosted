import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api, apiEnabled } from "@/lib/api";
import { useLive } from "@/lib/live";
import { fromApi, useCompanyIndex, type StoryDto, type StoryModel } from "@/lib/stories";

export const PAGE_SIZE = 5;
// The sample feed has 15 stories; it cycles through them this many times so endless scrolling can
// be tried properly in the preview, then ends.
const MOCK_CYCLES = 4;

export type FeedItem = { key: string; story: StoryModel };
type Page = { items: FeedItem[]; next: string | number | null };

// Sample data: one page of the already filtered and searched list.
async function samplePage(source: StoryModel[], offset: number): Promise<Page> {
  await new Promise((r) => setTimeout(r, 650)); // a realistic network pause, so the placeholders show
  const total = source.length * MOCK_CYCLES;
  const items = Array.from({ length: Math.min(PAGE_SIZE, total - offset) }, (_, i) => {
    const n = offset + i;
    return { key: `${source[n % source.length]!.id}-${Math.floor(n / source.length)}`, story: source[n % source.length]! };
  });
  return { items, next: offset + items.length < total ? offset + items.length : null };
}

// Paginated feed. With the API it pages through GET /v1/stories (or a person's stories) by cursor;
// without it, through `sample`. `signature` changes when a filter or search changes, restarting it.
// `filter` narrows API pages on the page side (search, flag filters) since the API filters by
// company/outcome only.
export function useStoryFeed({ sample, signature, filter, path = "/v1/stories", params = "", topic = "feed", pageSize = 10, enabled = true }: {
  sample: StoryModel[]; signature: string; filter?: (s: StoryModel) => boolean; path?: string; params?: string; topic?: string | null; pageSize?: number; enabled?: boolean;
}) {
  const qc = useQueryClient();
  const { index, ready } = useCompanyIndex();
  const key = ["feed", path, signature];
  const q = useInfiniteQuery({
    queryKey: key,
    queryFn: async ({ pageParam }): Promise<Page> => {
      if (!apiEnabled) return samplePage(sample, Number(pageParam ?? 0));
      const cursor = pageParam ? `&before=${encodeURIComponent(String(pageParam))}` : "";
      const r = await api<{ stories: StoryDto[]; nextCursor: string | null }>(`${path}?limit=${pageSize}${cursor}${params}`);
      const items = r.stories.map((s) => ({ key: s.publicId, story: fromApi(s, index) })).filter((i) => !filter || filter(i.story));
      return { items, next: r.nextCursor };
    },
    initialPageParam: null as string | number | null,
    getNextPageParam: (last) => last.next,
    enabled: enabled && (apiEnabled ? ready : sample.length > 0),
    staleTime: apiEnabled ? 30_000 : Infinity,
  });
  // A new story anywhere (or on this person's page): refresh, keeping your scroll position.
  useLive(apiEnabled ? topic : null, () => void qc.invalidateQueries({ queryKey: ["feed", path] }));
  return {
    items: q.data?.pages.flatMap((p) => p.items) ?? [],
    loadingFirst: q.isPending && (apiEnabled || sample.length > 0),
    loadingMore: q.isFetchingNextPage,
    hasMore: !!q.hasNextPage,
    loadMore: () => { if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage(); },
  };
}

// Calls `onReach` when the returned element scrolls within 600 px of the viewport.
export function useReachEnd(onReach: () => void, active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onReach);
  cb.current = onReach;
  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) cb.current(); }, { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [active]);
  return ref;
}
