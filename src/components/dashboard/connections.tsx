// Followers and Following, from a person page: tap the counts and a popup lists them, with a
// search box. "Everyone" searches all members instead. Follow or unfollow straight from the list.
// Company reps never see people who wrote about their company here (backend rep-guard.ts).
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, UserCheck, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ghosted";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, ApiRequestError, apiEnabled } from "@/lib/api";
import { LevelBadge } from "@/lib/levels";
import type { Revealed } from "@/lib/stories";
import { cn, formatCount } from "@/lib/utils";
import { popup, popupBody } from "./ui-kit";

export type Which = "followers" | "following" | "everyone";
type Member = { publicId: string; name: string; handle: string; avatarSeed: string; pastel: string; revealed: Revealed | null; level?: number | null; isMe: boolean; following: boolean; bot?: { badge: string } };
type Page = { people: Member[]; total: number; nextOffset: number | null };

function useDebounced(v: string, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = window.setTimeout(() => setD(v), ms); return () => window.clearTimeout(t); }, [v, ms]);
  return d;
}

function Row({ m, onToggle }: { m: Member; onToggle: (m: Member) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const toggle = async () => { setBusy(true); try { await onToggle(m); } finally { setBusy(false); } };
  return <li className="flex items-center gap-3 py-2.5">
    <Link to="/u/$id" params={{ id: m.publicId }} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <Avatar seed={m.avatarSeed} pastel={m.pastel} size="sm" label={m.name} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5"><span className="truncate text-sm font-bold">{m.name}</span><LevelBadge level={m.level} size="xs" />{m.bot && <span className="rounded-full border border-foreground px-1.5 text-[10px] font-bold">{m.bot.badge}</span>}</span>
        {m.name !== m.handle && <span className="block truncate text-xs text-muted-foreground">{m.handle}</span>}
      </span>
    </Link>
    {!m.isMe && <Button size="sm" variant={m.following ? "outline" : "default"} disabled={busy} onClick={() => void toggle()} aria-label={m.following ? `Unfollow ${m.name}` : `Follow ${m.name}`}>
      {busy ? <Loader2 className="animate-spin" /> : m.following ? <UserCheck /> : <UserPlus />}{m.following ? "Following" : "Follow"}
    </Button>}
  </li>;
}

export function ConnectionsDialog({ open, onOpenChange, personId, name, start, counts }: { open: boolean; onOpenChange: (v: boolean) => void; personId: string; name: string; start: Which; counts: { followers: number; following: number } }) {
  const qc = useQueryClient();
  const [which, setWhich] = useState<Which>(start);
  const [q, setQ] = useState("");
  const query = useDebounced(q);
  useEffect(() => { if (open) { setWhich(start); setQ(""); } }, [open, start]);

  const list = useInfiniteQuery({
    queryKey: ["connections", personId, which, query],
    queryFn: ({ pageParam }) => api<Page>(`/v1/profiles/${personId}/connections?which=${which}&q=${encodeURIComponent(query)}&offset=${pageParam}`),
    initialPageParam: 0,
    getNextPageParam: (p) => p.nextOffset,
    enabled: open && apiEnabled && which !== "everyone",
  });
  // "Everyone": the site-wide member search (at least 2 characters).
  const everyone = useQuery({
    queryKey: ["member-search", query],
    queryFn: async () => (await api<{ people: Member[] }>(`/v1/search?q=${encodeURIComponent(query)}&limit=20`)).people,
    enabled: open && apiEnabled && which === "everyone" && query.trim().length >= 2,
  });

  const toggle = async (m: Member) => {
    try {
      await api(`/v1/profiles/${m.publicId}/follow`, { method: m.following ? "DELETE" : "POST", ...(!m.following && { body: {} }) });
      const flip = (p: Member) => (p.publicId === m.publicId ? { ...p, following: !m.following } : p);
      qc.setQueriesData<{ pages: Page[]; pageParams: unknown[] }>({ queryKey: ["connections"] }, (d) => (d ? { ...d, pages: d.pages.map((pg) => ({ ...pg, people: pg.people.map(flip) })) } : d));
      qc.setQueriesData<Member[]>({ queryKey: ["member-search"] }, (d) => d?.map(flip));
      void qc.invalidateQueries({ queryKey: ["person"] });
      toast.success(m.following ? `Unfollowed ${m.name}.` : `Following ${m.name}.`);
    } catch (e) { toast.error(e instanceof ApiRequestError ? e.message : "Couldn't save that. Try again."); }
  };

  const people = which === "everyone" ? everyone.data ?? [] : (list.data?.pages ?? []).flatMap((p) => p.people);
  const total = which === "everyone" ? null : list.data?.pages[0]?.total ?? null;
  const loading = which === "everyone" ? everyone.isFetching : list.isPending;
  const tabs: { id: Which; label: string }[] = [
    { id: "followers", label: `Followers · ${formatCount(counts.followers)}` },
    { id: "following", label: `Following · ${formatCount(counts.following)}` },
    { id: "everyone", label: "Everyone" },
  ];

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className={cn(popup, "max-w-md")}>
      <div className={cn(popupBody, "no-scrollbar-touch")} data-lenis-prevent>
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="flex items-center gap-2 font-display text-xl"><Users className="size-5" />{which === "everyone" ? "Find members" : name}</DialogTitle>
          <DialogDescription>{which === "everyone" ? "Search everyone on Ghosted by handle or shown name." : which === "followers" ? `People who follow ${name}.` : `People ${name} follows.`}</DialogDescription>
        </DialogHeader>
        <div className="mt-4 grid grid-cols-3 rounded-lg border-2 border-foreground bg-muted p-1 text-xs font-bold" role="tablist">
          {tabs.map((t) => <button key={t.id} type="button" role="tab" aria-selected={which === t.id} onClick={() => setWhich(t.id)} className={cn("truncate rounded-md px-2 py-1.5 transition-colors", which === t.id ? "bg-primary text-primary-foreground" : "hover:bg-background")}>{t.label}</button>)}
        </div>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={which === "everyone" ? "Search all members" : "Search this list"} aria-label="Search members" className="h-11 border-2 border-foreground pl-9" />
        </div>
        <div className="mt-2 min-h-40">
          {which === "everyone" && query.trim().length < 2 ? <p className="py-8 text-center text-sm text-muted-foreground">Type at least 2 letters to search everyone.</p>
            : loading && !people.length ? <div className="space-y-2 py-2" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="flex items-center gap-3"><div className="skeleton size-9 rounded-full" /><div className="skeleton h-3 w-40" /></div>)}</div>
            : people.length ? <>
                {total != null && query && <p className="pt-1 text-xs text-muted-foreground">{formatCount(total)} {total === 1 ? "match" : "matches"}</p>}
                <ul className="divide-y-2 divide-foreground/10">{people.map((m) => <Row key={m.publicId} m={m} onToggle={toggle} />)}</ul>
                {which !== "everyone" && list.hasNextPage && <Button variant="outline" size="sm" className="mt-2 w-full" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>{list.isFetchingNextPage && <Loader2 className="animate-spin" />}Show more</Button>}
              </>
            : <p className="py-8 text-center text-sm text-muted-foreground">{query ? <>No one matches “{query}”.{which !== "everyone" && <> <button type="button" className="font-bold text-primary hover:underline" onClick={() => setWhich("everyone")}>Search everyone</button></>}</> : which === "followers" ? "No followers yet." : "Not following anyone yet."}</p>}
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}
