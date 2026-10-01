// Goofy, Ghosted's AutoMod (backend/src/goofy). His fixed details, his activity feed, sample data
// for mock mode, and a toast that speaks in his voice.
import { toast } from "sonner";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api, apiEnabled } from "@/lib/api";

export const GOOFY_ID = "600710000000001";
// Bundled (not served from public/), so every build and dev server has it, with a cache-busting hash.
// 256×256 JPEG (about 16 KB), shown at up to 96 px, so it's crisp on high-density screens.
import goofyAvatar from "@/assets/goofy-automod.jpg";
export const GOOFY_AVATAR: string = goofyAvatar;
export const GOOFY_BIO = "Hi, I'm Goofy, Ghosted's AutoMod. I read every story and chitchat the moment it's posted, eat the vulgar ones, hide people's names, check that accusations are told as experiences, and file reports so the humans only see what truly needs them. I'm strict about words and soft on people. Follow me for a weekly report of what I've been up to.";

export type GoofyStats = {
  actions: number; removed: number; held: number; released: number; reportsFiled: number; welcomed: number; followers: number;
  weekly: { week: string; removed: number; held: number; reported: number }[];
  reasons: { reason: string; count: number }[];
  accuracy: number | null; reportsDecided: number; wordsWatched: number;
};
export type GoofyActivity = { publicId: string; action: string; label: string; kind: string | null; reason: string | null; storyPublicId: string | null; companySlug: string | null; createdAt: string };

export const isGoofy = (publicId: string | null | undefined) => publicId === GOOFY_ID;

// ---------- preview ----------

const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
export const SAMPLE_GOOFY_STATS: GoofyStats = {
  actions: 1284, removed: 212, held: 341, released: 298, reportsFiled: 87, welcomed: 402, followers: 1930,
  weekly: Array.from({ length: 8 }, (_, i) => ({ week: new Date(Date.now() - (7 - i) * 7 * 86400_000).toISOString().slice(0, 10), removed: 18 + ((i * 7) % 13), held: 30 + ((i * 11) % 17), reported: 6 + ((i * 5) % 7) })),
  reasons: [{ reason: "vulgar language", count: 96 }, { reason: "a person's name", count: 71 }, { reason: "a serious accusation stated as fact", count: 44 }, { reason: "promotional or off-platform lure", count: 31 }, { reason: "a phone number", count: 18 }, { reason: "identity-based slur", count: 9 }],
  accuracy: 91, reportsDecided: 64, wordsWatched: 1173,
};
export const SAMPLE_GOOFY_ACTIVITY: GoofyActivity[] = [
  ["removed_chitchat", "Removed a vulgar chitchat", "vulgar language", 0.2], ["redacted", "Hid a person's name and published", "hid a person's name", 0.9],
  ["held", "Held a post for a quick check", "a serious accusation stated as fact", 1.5], ["welcomed", "Welcomed a new member", "new member", 2.2],
  ["reported_company", "Reported a company listing", "promotional or off-platform lure", 3.4], ["released", "Released a post after its check", "passed the check", 4.1],
  ["ghost_job_alert", "Warned followers about ghost jobs", "4 ghost-job stories in 30 days", 6], ["lists_updated", "Refreshed the word lists", "dsojevic: 665, ldnoobw_en: 387, ldnoobw_hi: 119", 11],
  ["learned", "Learned new words from the community", "3 new watch words, 2 new spellings, 6 synonyms", 11.2], ["removed_story", "Removed a vulgar story", "identity-based slur", 14],
  ["dismissed_reports", "Closed stale reports", "5 stale reports closed", 20], ["restored", "Restored a post after reports didn't hold", "reports didn't hold up", 26],
].map(([action, label, reason, h], i) => ({ publicId: `demo-${i}`, action: action as string, label: label as string, kind: null, reason: reason as string, storyPublicId: null, companySlug: null, createdAt: ago(h as number) }));

// ---------- activity feed ----------

export function useGoofyActivity(first: GoofyActivity[] | undefined, firstCursor: string | null | undefined) {
  const q = useInfiniteQuery({
    queryKey: ["goofy-activity", GOOFY_ID],
    queryFn: ({ pageParam }) => (pageParam
      ? api<{ activity: GoofyActivity[]; nextCursor: string | null }>(`/v1/profiles/${GOOFY_ID}/activity?before=${encodeURIComponent(pageParam)}`)
      : Promise.resolve({ activity: first ?? [], nextCursor: firstCursor ?? null })),
    initialPageParam: "" as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: apiEnabled && !!first,
  });
  const items = apiEnabled ? q.data?.pages.flatMap((p) => p.activity) ?? first ?? [] : SAMPLE_GOOFY_ACTIVITY;
  return { items, hasMore: apiEnabled && !!q.hasNextPage, loadingMore: q.isFetchingNextPage, loadMore: () => { if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage(); } };
}

// ---------- his voice in toasts ----------

// Messages from the API that start with "Goofy:" are shown as Goofy speaking (his face, no prefix).
const face = <img src={GOOFY_AVATAR} alt="" className="size-7 rounded-full border-2 border-foreground object-cover" />;
export function speak(message: string, kind: "info" | "error" = "info") {
  const goofy = message.startsWith("Goofy: ");
  const text = goofy ? message.slice(7) : message;
  const opts = { duration: goofy ? 10000 : 6000, ...(goofy && { icon: face, description: "Goofy, AutoMod" }) };
  return kind === "error" ? toast.error(text, opts) : toast.info(text, opts);
}
