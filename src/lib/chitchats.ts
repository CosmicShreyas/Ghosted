// Chitchats: the comments under a story. Top-level chitchats with one level of replies, a
// "relatable" reaction (no red flags on chitchats) and reports. Live: new chitchats and reactions
// from anyone appear within seconds (the story's live topic). Without the API (mock mode) a
// few sample chitchats are shown and yours are kept in this browser.
import { useEffect, useState } from "react";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { api, apiEnabled } from "@/lib/api";
import { useLive } from "@/lib/live";
import type { Author } from "@/lib/stories";
import { users } from "@/mock/data";
import { samplePublicId } from "@/lib/stories";

export type Chitchat = {
  publicId: string; parentPublicId: string | null; deleted: boolean; body: string | null; author: Author | null;
  createdAt: string; editedAt: string | null; relatable: number; myRelatable: boolean; mine: boolean;
  replies: Chitchat[];
};
type Thread = { total: number; chitchats: Chitchat[] };

// ---------- sample thread (preview) ----------

const SAMPLE_LINES = [
  "Same thing happened to me with them in March. Three rounds, then nothing.",
  "Thanks for writing this down. I had my final round there next week, asking for the timeline in writing now.",
  "Did they ever reply to your follow-ups?",
  "Nope. The recruiter's LinkedIn now says “open to work”, which is almost poetic.",
];
const author = (i: number): Author => { const u = users[i % users.length]!; return { publicId: samplePublicId(u.id), name: u.handle, avatarSeed: u.seed, pastel: u.pastel, revealed: null }; };
const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
function sampleThread(storyId: string, added: Chitchat[], related: Set<string>): Thread {
  const t = sampleBase(storyId, added);
  // Relatable taps in the preview (on any chitchat, sample or yours).
  const apply = (c: Chitchat): Chitchat => ({ ...c, myRelatable: related.has(c.publicId), relatable: c.relatable + (related.has(c.publicId) ? 1 : 0), replies: c.replies.map(apply) });
  return { ...t, chitchats: t.chitchats.map(apply) };
}
function sampleBase(storyId: string, added: Chitchat[]): Thread {
  const n = storyId.length % 3;
  const base: Chitchat[] = [
    { publicId: `${storyId}-1`, parentPublicId: null, deleted: false, body: SAMPLE_LINES[0]!, author: author(2 + n), createdAt: ago(95), editedAt: null, relatable: 14, myRelatable: false, mine: false,
      replies: [{ publicId: `${storyId}-1a`, parentPublicId: `${storyId}-1`, deleted: false, body: SAMPLE_LINES[2]!, author: author(4 + n), createdAt: ago(60), editedAt: null, relatable: 3, myRelatable: false, mine: false, replies: [] },
        { publicId: `${storyId}-1b`, parentPublicId: `${storyId}-1`, deleted: false, body: SAMPLE_LINES[3]!, author: author(2 + n), createdAt: ago(42), editedAt: null, relatable: 9, myRelatable: false, mine: false, replies: [] }] },
    { publicId: `${storyId}-2`, parentPublicId: null, deleted: false, body: SAMPLE_LINES[1]!, author: author(6 + n), createdAt: ago(30), editedAt: null, relatable: 6, myRelatable: false, mine: false, replies: [] },
  ];
  const tops = [...base, ...added.filter((c) => !c.parentPublicId)].map((t) => ({ ...t, replies: [...t.replies, ...added.filter((r) => r.parentPublicId === t.publicId)] }));
  return { total: tops.reduce((n, t) => n + 1 + t.replies.length, 0), chitchats: tops };
}
const DEMO_KEY = (id: string) => `ghosted.demoChitchats.${id}`;

// ---------- hook ----------

export type ChitchatSort = "top" | "new";
const PAGE = 10;
type Page = Thread & { nextOffset: number | null };

// Paged like the feed: 10 top-level chitchats (with all their replies) per page, loaded as you
// scroll. Sorting happens on the server, so "Top" and "Newest" stay right across pages.
export function useChitchats(storyId: string, me: Author, sort: ChitchatSort = "top") {
  const qc = useQueryClient();
  const base = ["chitchats", storyId];
  const key = [...base, sort];
  const q = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => api<Page>(`/v1/stories/${storyId}/comments?sort=${sort}&limit=${PAGE}&offset=${pageParam}`),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset,
    enabled: apiEnabled,
  });
  useLive(apiEnabled ? `story:${storyId}` : null, () => void qc.invalidateQueries({ queryKey: base }));

  const [demo, setDemo] = useState<Chitchat[]>([]);
  const [related, setRelated] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (apiEnabled) return;
    try { setDemo(JSON.parse(localStorage.getItem(DEMO_KEY(storyId)) ?? "[]") as Chitchat[]); } catch { setDemo([]); }
    try { setRelated(new Set(JSON.parse(localStorage.getItem(`${DEMO_KEY(storyId)}.related`) ?? "[]") as string[])); } catch { setRelated(new Set()); }
  }, [storyId]);
  const saveDemo = (list: Chitchat[]) => { setDemo(list); try { localStorage.setItem(DEMO_KEY(storyId), JSON.stringify(list)); } catch { /* storage blocked */ } };
  const saveRelated = (s: Set<string>) => { setRelated(s); try { localStorage.setItem(`${DEMO_KEY(storyId)}.related`, JSON.stringify([...s])); } catch { /* storage blocked */ } };

  // The preview sorts the sample thread itself (the API sorts on the server).
  const sampleSorted = (): Thread => {
    const t = sampleThread(storyId, demo, related);
    const chitchats = [...t.chitchats].sort((a, b) => sort === "new" ? b.createdAt.localeCompare(a.createdAt) : (b.relatable + b.replies.length * 2) - (a.relatable + a.replies.length * 2));
    return { ...t, chitchats };
  };
  const thread: Thread | undefined = apiEnabled
    ? q.data && { total: q.data.pages[0]?.total ?? 0, chitchats: q.data.pages.flatMap((p) => p.chitchats) }
    : sampleSorted();

  // Optimistic update of one chitchat anywhere in the loaded pages.
  const patch = (id: string, fn: (c: Chitchat) => Chitchat) => {
    const map = (list: Chitchat[]): Chitchat[] => list.map((c) => (c.publicId === id ? fn(c) : { ...c, replies: map(c.replies) }));
    if (apiEnabled) qc.setQueryData<InfiniteData<Page>>(key, (d) => (d ? { ...d, pages: d.pages.map((p) => ({ ...p, chitchats: map(p.chitchats) })) } : d));
  };

  return {
    thread,
    loading: apiEnabled && q.isPending,
    error: apiEnabled && q.isError,
    hasMore: apiEnabled && !!q.hasNextPage,
    loadingMore: apiEnabled && q.isFetchingNextPage,
    loadMore: () => { if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage(); },
    post: async (body: string, parentId?: string) => {
      if (!apiEnabled) {
        const c: Chitchat = { publicId: `demo-${Date.now()}`, parentPublicId: parentId ?? null, deleted: false, body, author: me, createdAt: new Date().toISOString(), editedAt: null, relatable: 0, myRelatable: false, mine: true, replies: [] };
        saveDemo([...demo, c]); return null;
      }
      const r = await api<{ pending?: boolean; removed?: boolean; message?: string | null }>(`/v1/stories/${storyId}/comments`, { method: "POST", body: { body, ...(parentId && { parentId }) } });
      // Held for a check, or removed by Goofy on the spot: nothing new to show, just tell the author.
      if (r.removed) return r.message ?? "Goofy: that chitchat was removed for its language.";
      if (r.pending) return r.message ?? "Saved. Your chitchat appears after a quick check.";
      await qc.invalidateQueries({ queryKey: base });
      void qc.invalidateQueries({ queryKey: ["story", storyId] }); // the story's chitchat count
      return null;
    },
    relate: async (c: Chitchat) => {
      const on = !c.myRelatable;
      if (!apiEnabled) { const s = new Set(related); if (on) s.add(c.publicId); else s.delete(c.publicId); saveRelated(s); return on; }
      patch(c.publicId, (x) => ({ ...x, myRelatable: on, relatable: x.relatable + (on ? 1 : -1) }));
      try {
        const r = await api<{ relatable: number; myRelatable: boolean }>(`/v1/stories/${storyId}/comments/${c.publicId}/relatable`, { method: "POST" });
        patch(c.publicId, (x) => ({ ...x, relatable: r.relatable, myRelatable: r.myRelatable }));
        return r.myRelatable;
      } catch (err) { patch(c.publicId, (x) => ({ ...x, myRelatable: c.myRelatable, relatable: c.relatable })); throw err; }
    },
    remove: async (c: Chitchat) => {
      if (!apiEnabled) { saveDemo(demo.filter((d) => d.publicId !== c.publicId)); return; }
      await api(`/v1/stories/${storyId}/comments/${c.publicId}`, { method: "DELETE" });
      await qc.invalidateQueries({ queryKey: base });
    },
    report: async (c: Chitchat, reason: string, details: string) => {
      if (!apiEnabled) return "Thanks. In the live app, moderators review reports within 24 hours.";
      return (await api<{ message: string }>(`/v1/stories/${storyId}/comments/${c.publicId}/report`, { method: "POST", body: { reason, ...(details.trim() && { details: details.trim() }) } })).message;
    },
  };
}
