// The bell. A notification stays unread (purple dot, counted on the bell) until you read it with its
// eye button or "read all": opening the list no longer clears anything. Read state lives on the
// server, so it survives refreshes and syncs to your other devices through the live layer.
// Without the API (mock mode) the sample notifications remember read state in this browser.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiEnabled } from "@/lib/api";
import { useLive } from "@/lib/live";
import { notifications as sample } from "@/mock/data";

// `storyPublicId` / `profilePublicId` / `companySlug`: where tapping the notification takes you.
export type Notification = { publicId: string; kind: string; body: string; storyPublicId: string | null; profilePublicId?: string | null; companySlug?: string | null; createdAt: string | null; time?: string; read: boolean };
type List = { unread: number; notifications: Notification[] };

const KEY = ["notifications"];
const DEMO_READ = "ghosted.readNotifications";

const readDemo = (): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(DEMO_READ) ?? "[]") as string[]); } catch { return new Set(); } };
const writeDemo = (ids: Set<string>) => { try { localStorage.setItem(DEMO_READ, JSON.stringify([...ids])); } catch { /* storage blocked */ } };

export const timeAgo = (n: Notification) => {
  if (!n.createdAt) return n.time ?? "";
  const s = Math.max(0, (Date.now() - new Date(n.createdAt).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return s < 172800 ? "Yesterday" : `${Math.floor(s / 86400)} days ago`;
};

export function useNotifications() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: KEY,
    queryFn: () => api<List>("/v1/me/notifications"),
    enabled: apiEnabled,
    staleTime: 60_000,
  });
  // New notification, or read on another device: refresh here.
  useLive("notifications", () => void qc.invalidateQueries({ queryKey: KEY }));

  // Demo mode: sample list with read state kept in this browser.
  const [demoRead, setDemoRead] = useState<Set<string>>(new Set());
  useEffect(() => { if (!apiEnabled) setDemoRead(readDemo()); }, []);
  const demo: List = (() => {
    const list = sample.map((n) => ({ publicId: n.id, kind: "system", body: n.text, storyPublicId: null, createdAt: null, time: n.time, read: !n.unread || demoRead.has(n.id) }));
    return { unread: list.filter((n) => !n.read).length, notifications: list };
  })();

  const data = apiEnabled ? q.data : demo;

  // Optimistic: the dot and the count change instantly; a failed save puts them back.
  const setRead = (ids: string[] | "all") => {
    const prev = qc.getQueryData<List>(KEY);
    if (prev) {
      const hit = (n: Notification) => ids === "all" || ids.includes(n.publicId);
      const newlyRead = prev.notifications.filter((n) => !n.read && hit(n)).length;
      qc.setQueryData<List>(KEY, {
        notifications: prev.notifications.map((n) => (hit(n) ? { ...n, read: true } : n)),
        unread: ids === "all" ? 0 : Math.max(0, prev.unread - newlyRead),
      });
    }
    return prev;
  };

  return {
    list: data?.notifications ?? [],
    unread: data?.unread ?? 0,
    loading: apiEnabled && q.isPending,
    markRead: async (id: string) => {
      if (!apiEnabled) { const next = new Set(demoRead).add(id); setDemoRead(next); writeDemo(next); return; }
      const prev = setRead([id]);
      try { await api(`/v1/me/notifications/${id}/read`, { method: "POST" }); }
      catch { if (prev) qc.setQueryData(KEY, prev); }
    },
    markAllRead: async () => {
      if (!apiEnabled) { const next = new Set(sample.map((n) => n.id)); setDemoRead(next); writeDemo(next); return; }
      const prev = setRead("all");
      try { await api("/v1/me/notifications/read-all", { method: "POST" }); }
      catch { if (prev) qc.setQueryData(KEY, prev); }
    },
  };
}
