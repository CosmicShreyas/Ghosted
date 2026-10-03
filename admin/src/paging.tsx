// Lists that load more as you scroll. Each admin list endpoint takes ?offset=N and returns
// { items, nextOffset } (backend/src/admin-paging.ts); this hook pages through it and <LoadMore />
// fetches the next page when its marker scrolls into view.
import { useEffect, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { adminApi } from "./api";

type Page<T> = { items: T[]; nextOffset: number | null };

// `path` may already have a query string; the offset is added to it.
export function useAdminList<T>(key: unknown[], path: string, options: { enabled?: boolean; refetchInterval?: number } = {}) {
  const q = useInfiniteQuery({
    queryKey: key,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => adminApi<Page<T>>(`${path}${path.includes("?") ? "&" : "?"}offset=${pageParam}`),
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    ...(options.enabled !== undefined && { enabled: options.enabled }),
    ...(options.refetchInterval && { refetchInterval: options.refetchInterval }),
  });
  return {
    items: q.data?.pages.flatMap((p) => p.items) ?? [],
    loading: q.isPending,
    hasMore: !!q.hasNextPage,
    loadingMore: q.isFetchingNextPage,
    loadMore: () => { if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage(); },
    refetch: q.refetch,
  };
}

// The marker at the end of a list: loads the next page as it comes into view (400px early).
export function LoadMore({ list, noun = "items" }: { list: Pick<ReturnType<typeof useAdminList>, "hasMore" | "loadingMore" | "loadMore" | "items">; noun?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { hasMore, loadMore } = list;
  useEffect(() => {
    const el = ref.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) loadMore(); }, { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore]);
  return <div ref={ref} className="py-4 text-center text-xs text-muted-foreground" aria-live="polite">
    {list.loadingMore ? <span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" />Loading more {noun}…</span>
      : hasMore ? <button type="button" onClick={loadMore} className="font-semibold hover:text-foreground">Load more</button>
      : list.items.length > 0 && <span>That's all {list.items.length.toLocaleString("en-IN")} {noun}.</span>}
  </div>;
}
