// Settings → Security: every device signed in to this account, live. A sign-in on your phone shows
// up on your laptop within seconds (and the reverse), and signing a device out here logs it out there.
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Laptop, Loader2, LogOut, MapPin, MonitorSmartphone, Network, Search, Smartphone, Tablet, X, type LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { popup, popupBody } from "./ui-kit";
import { toast } from "sonner";
import { api, ApiRequestError, apiEnabled } from "@/lib/api";
import { useLive } from "@/lib/live";
import { Button } from "@/components/ui/button";

type Kind = "mobile" | "tablet" | "desktop";
export type DeviceSession = { publicId: string; kind: Kind; browser: string; os: string; place: string | null; ip?: string | null; signedInAt: string; lastSeenAt: string; current: boolean };

const ICON: Record<Kind, LucideIcon> = { mobile: Smartphone, tablet: Tablet, desktop: Laptop };

// Without the API (mock mode) there's only this browser to show, described locally.
function localDevice(): DeviceSession {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /SamsungBrowser\//.test(ua) ? "Samsung Internet" : /Firefox\/|FxiOS\//.test(ua) ? "Firefox" : /Chrome\/|CriOS\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPad/.test(ua) ? "iPadOS" : /iPhone/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Unknown OS";
  const kind: Kind = /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? "tablet" : /Mobile|iPhone|Android/.test(ua) ? "mobile" : "desktop";
  const now = new Date().toISOString();
  return { publicId: "local", kind, browser, os, place: null, signedInAt: now, lastSeenAt: now, current: true };
}

const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? "yesterday" : `${d} days ago`;
};
const when = (iso: string) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

export function DevicesList() {
  const qc = useQueryClient();
  const [local, setLocal] = useState<DeviceSession | null>(null);
  useEffect(() => setLocal(localDevice()), []);
  const q = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => (await api<{ sessions: DeviceSession[] }>("/v1/me/sessions")).sessions,
    enabled: apiEnabled,
    staleTime: 30_000,
  });
  // A sign-in or sign-out anywhere on this account refreshes the list here.
  useLive("sessions", () => void qc.invalidateQueries({ queryKey: ["sessions"] }));
  const [pending, setPending] = useState<string | null>(null);

  const signOut = async (s: DeviceSession) => {
    setPending(s.publicId);
    try {
      await api(`/v1/me/sessions/${s.publicId}`, { method: "DELETE" });
      qc.setQueryData<DeviceSession[]>(["sessions"], (list) => list?.filter((x) => x.publicId !== s.publicId));
      toast.success(`Signed out ${s.browser} on ${s.os}.`);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Couldn't sign that device out. Try again.");
      void qc.invalidateQueries({ queryKey: ["sessions"] });
    } finally { setPending(null); }
  };

  // Older sign-ins from before device tracking existed have no row yet: show this browser anyway.
  // This device first, then the most recently active.
  const all = useMemo(() => {
    const list = apiEnabled ? q.data : local ? [local] : undefined;
    const l = list && list.length === 0 && local ? [local] : list;
    return l && [...l].sort((a, b) => Number(b.current) - Number(a.current) || b.lastSeenAt.localeCompare(a.lastSeenAt));
  }, [q.data, local]);
  const [open, setOpen] = useState(false);

  if (!all) return <div className="space-y-2" aria-busy="true">{[0, 1].map((i) => <div key={i} className="skeleton h-[62px] rounded-lg border-2 border-foreground/20" />)}</div>;

  const rest = all.length - PREVIEW;
  return <div className="space-y-2">
    <ul className="space-y-2"><AnimatePresence initial={false}>{all.slice(0, PREVIEW).map((s) => <DeviceRow key={s.publicId} s={s} pending={pending} onSignOut={signOut} />)}</AnimatePresence></ul>
    {rest > 0 && <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center justify-between gap-3 rounded-lg border-2 border-dashed border-foreground/40 px-3 py-2.5 text-sm font-bold transition-colors hover:border-foreground hover:bg-muted">
      <span className="flex items-center gap-2"><MonitorSmartphone className="size-4" />View all {all.length} devices</span>
      <span className="text-xs font-semibold text-muted-foreground">{rest} more <ChevronRight className="inline size-3.5" /></span>
    </button>}
    <AllDevicesDialog open={open} onOpenChange={setOpen} all={all} pending={pending} onSignOut={signOut} />
  </div>;
}

const PREVIEW = 3;
type KindFilter = "all" | Kind;
const KIND_LABEL: Record<KindFilter, string> = { all: "All", desktop: "Computers", mobile: "Phones", tablet: "Tablets" };

// Every signed-in device, scrollable, with a search (browser, system, place or IP) and a type filter.
function AllDevicesDialog({ open, onOpenChange, all, pending, onSignOut }: { open: boolean; onOpenChange: (v: boolean) => void; all: DeviceSession[]; pending: string | null; onSignOut: (s: DeviceSession) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  useEffect(() => { if (open) { setQuery(""); setKind("all"); } }, [open]);
  const counts = useMemo(() => ({ all: all.length, desktop: all.filter((s) => s.kind === "desktop").length, mobile: all.filter((s) => s.kind === "mobile").length, tablet: all.filter((s) => s.kind === "tablet").length }), [all]);
  const shown = all.filter((s) => (kind === "all" || s.kind === kind) && (!query.trim() || query.toLowerCase().split(/\s+/).every((w) => `${s.browser} ${s.os} ${s.place ?? ""} ${s.ip ?? ""} ${s.current ? "this device current" : ""}`.toLowerCase().includes(w))));
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className={popup}>
      <div className="border-b-2 border-foreground p-5 pb-4 sm:px-7">
        <DialogHeader className="text-left">
          <DialogTitle className="font-display text-2xl">Your devices</DialogTitle>
          <DialogDescription>{all.length} signed in. Sign out anything you don't recognise.</DialogDescription>
        </DialogHeader>
        <label className="mt-4 flex h-10 items-center gap-2 rounded-lg border-2 border-foreground bg-background px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search browser, system, city or IP" aria-label="Search devices" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X className="size-4" /></button>}
        </label>
        <div className="no-scrollbar -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1" role="group" aria-label="Device type">
          {(Object.keys(KIND_LABEL) as KindFilter[]).filter((k) => k === "all" || counts[k] > 0).map((k) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
            className={cn("shrink-0 rounded-full border-2 px-3 py-1 text-xs font-bold transition-colors", kind === k ? "border-foreground bg-primary text-primary-foreground" : "border-foreground/20 hover:border-foreground")}>{KIND_LABEL[k]} <span className="opacity-70">{counts[k]}</span></button>)}
        </div>
      </div>
      <div className={popupBody} data-lenis-prevent>
        {shown.length ? <ul className="space-y-2"><AnimatePresence initial={false}>{shown.map((s) => <DeviceRow key={s.publicId} s={s} pending={pending} onSignOut={onSignOut} />)}</AnimatePresence></ul>
          : <p className="py-8 text-center text-sm text-muted-foreground">No devices match. Try another search.</p>}
      </div>
    </DialogContent>
  </Dialog>;
}

function DeviceRow({ s, pending, onSignOut: signOut }: { s: DeviceSession; pending: string | null; onSignOut: (s: DeviceSession) => Promise<void> }) {
  const Icon = ICON[s.kind];
  return <motion.li layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, marginTop: 0 }} transition={{ duration: 0.2 }}
          className="flex items-center gap-3 overflow-hidden rounded-lg border-2 border-foreground bg-background p-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border-2 border-foreground bg-card"><Icon className="size-[18px]" aria-label={s.kind === "desktop" ? "Computer" : s.kind === "mobile" ? "Phone" : "Tablet"} /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{s.browser} on {s.os}</p>
            <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
              {s.place && <span className="inline-flex items-center gap-0.5"><MapPin className="size-3" />{s.place} ·</span>}
              {s.ip && <span className="inline-flex items-center gap-0.5 font-mono tabular-nums" title="Public IP, last half hidden"><Network className="size-3" />{s.ip} ·</span>}
              <span>{s.current ? "This device · active now" : `Active ${ago(s.lastSeenAt)}`}</span>
              {!s.current && <span className="hidden sm:inline">· signed in {when(s.signedInAt)}</span>}
            </p>
          </div>
          {s.current
            ? <span className="shrink-0 rounded-full border-2 border-foreground bg-flag-green px-2 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">Current</span>
            : <Button size="sm" variant="outline" className="shrink-0" disabled={pending === s.publicId} onClick={() => void signOut(s)} aria-label={`Sign out ${s.browser} on ${s.os}`}>
                {pending === s.publicId ? <Loader2 className="animate-spin" /> : <LogOut />}<span className="hidden sm:inline">Sign out</span>
              </Button>}
        </motion.li>;
}
