// The top bar, built like the main app's: centred search, notifications and your profile menu on the
// right. On phones and tablets the menus open as bottom sheets and navigation moves to a bottom dock.
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Eye, Menu, type LucideIcon } from "lucide-react";
import { BellIcon, LogoutIcon, SearchIcon, SettingsIcon, UserIcon, XIcon, useIconAnimation } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-picker";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useIsTouchLayout, useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { adminApi, type AdminMe } from "./api";
import { can, ROLE_LABEL } from "./perms";
import { ago, Peep, useConfirm } from "./ui";
import type { Page } from "./app";

export type NavItem = { id: Page; label: string; icon: LucideIcon; group: string };
type Notes = { items: { kind: string; title: string; detail: string; at: string; go: Page; unread: boolean }[]; unread: number };
type Hit = { publicId: string; handle: string; avatarSeed: string; pastel: string; status: string };

const sheet = "max-h-[85vh] rounded-t-2xl border-2 border-b-0 border-foreground bg-card pb-[max(1rem,env(safe-area-inset-bottom))] shadow-hard [&>div:first-child]:mt-3 [&>div:first-child]:h-1.5 [&>div:first-child]:w-12 [&>div:first-child]:bg-foreground/25";

// ---------- search: jump to a section, or find a member ----------
function Search({ nav, me, page, go, openMember, auditSearch, onAuditSearch }: { nav: NavItem[]; me: AdminMe; page: Page; go: (p: Page) => void; openMember: (id: string) => void; auditSearch: string; onAuditSearch: (q: string) => void }) {
  const compact = useMediaQuery("(max-width: 639.98px)");
  const icon = useIconAnimation();
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState("");
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 220); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || t?.closest("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault(); input.current?.focus();
    };
    addEventListener("keydown", onKey); return () => removeEventListener("keydown", onKey);
  }, []);
  const members = useQuery({ queryKey: ["admin", "search", debounced], queryFn: () => adminApi<{ items: Hit[] }>(`/members?q=${encodeURIComponent(debounced)}`), enabled: can(me, "members") && debounced.length >= 2 });
  const pages = q.trim() ? nav.filter((n) => n.label.toLowerCase().includes(q.trim().toLowerCase())) : [];
  const hits = (members.data?.items ?? []).slice(0, 6);
  const contextual = page === "audit";
  const value = contextual ? auditSearch : q;
  const done = () => { if (contextual) onAuditSearch(""); else setQ(""); setOpen(false); input.current?.blur(); };
  const show = open && q.trim().length > 0;

  return <div className="relative" onMouseEnter={icon.start} onMouseLeave={icon.stop}>
    <label className="relative block">
      <span className="sr-only">Search</span>
      <SearchIcon ref={icon.ref} size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      {!value && !compact && <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-foreground/30 px-1.5 font-mono text-[10px] font-bold text-muted-foreground lg:block" aria-hidden="true">/</kbd>}
      <input ref={input} type="text" inputMode="search" role="searchbox" value={value} onChange={(e) => { if (contextual) onAuditSearch(e.target.value); else { setQ(e.target.value); setOpen(true); } }} onFocus={() => !contextual && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => { if (e.key === "Escape") done(); if (e.key === "Enter") { if (hits[0]) { openMember(hits[0].publicId); done(); } else if (pages[0]) { go(pages[0].id); done(); } } }}
        placeholder={contextual ? "Search audit actions, public ids or names…" : compact ? "Search…" : can(me, "members") ? "Search members by handle or id, or jump to a section…" : "Jump to a section…"}
        aria-label={contextual ? "Search audit log" : "Search"} className="h-10 w-full rounded-lg border-2 border-foreground bg-card pl-9 pr-9 text-sm outline-none transition-shadow focus:shadow-hard-sm" />
      {value && <button type="button" onClick={done} className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded hover:bg-muted" aria-label="Clear search"><XIcon size={14} /></button>}
    </label>
    <AnimatePresence>{show && <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}
      className="absolute inset-x-0 top-12 z-50 overflow-hidden rounded-xl border-2 border-foreground bg-card shadow-hard">
      {pages.length > 0 && <div className="border-b-2 border-foreground/10 p-1.5">{pages.map((p) => <button key={p.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { go(p.id); done(); }} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-bold hover:bg-primary hover:text-primary-foreground">
        <p.icon className="size-4" />{p.label}<span className="ml-auto text-xs font-normal opacity-70">{p.group || "Section"}</span>
      </button>)}</div>}
      {can(me, "members") && <div className="p-1.5">
        {debounced.length < 2 ? <p className="px-2.5 py-2 text-xs text-muted-foreground">Type two letters to search members.</p>
          : members.isPending ? <div className="space-y-1.5 p-1">{[0, 1].map((i) => <div key={i} className="flex h-11 items-center gap-2.5 px-1.5"><div className="skeleton size-8 rounded-full" /><div className="min-w-0 flex-1 space-y-1.5"><div className="skeleton h-3 w-2/3 rounded" /><div className="skeleton h-2.5 w-24 rounded" /></div></div>)}</div>
          : !hits.length ? <p className="px-2.5 py-2 text-xs text-muted-foreground">No member matches “{debounced}”.</p>
          : hits.map((m) => <button key={m.publicId} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { openMember(m.publicId); done(); }} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left hover:bg-muted">
            <Peep seed={m.avatarSeed} pastel={m.pastel} className="size-8" />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{m.handle}</span><span className="block text-[11px] text-muted-foreground">{m.publicId}</span></span>
            {m.status !== "active" && <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", m.status === "banned" ? "bg-flag-red text-primary-foreground" : "bg-accent")}>{m.status}</span>}
          </button>)}
      </div>}
    </motion.div>}</AnimatePresence>
  </div>;
}

// ---------- notifications ----------
function NoteList({ notes, go, close }: { notes: Notes | undefined; go: (p: Page) => void; close?: () => void }) {
  if (!notes) return <div className="p-4" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="flex items-start gap-3 border-b border-foreground/15 py-3 last:border-0"><div className="skeleton mt-1.5 size-2 rounded-full" /><div className="min-w-0 flex-1 space-y-2"><div className="skeleton h-3 w-full rounded" /><div className="skeleton h-2.5 w-24 rounded" /></div></div>)}</div>;
  if (!notes.items.length) return <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing in the last week. Choose what shows up here in Settings.</p>;
  return <ul>{notes.items.map((n, i) => <li key={i} className="border-b border-foreground/15 last:border-0">
    <button type="button" onClick={() => { go(n.go); close?.(); }} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/60">
      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.unread ? "bg-primary" : "bg-muted")} aria-label={n.unread ? "Unread" : "Read"} />
      <span className="min-w-0 flex-1"><span className={cn("block text-sm", n.unread && "font-semibold")}>{n.title}</span>{n.detail && <span className="block truncate text-xs text-muted-foreground">{n.detail}</span>}<span className="mt-0.5 block text-xs text-muted-foreground">{ago(n.at)}</span></span>
    </button>
  </li>)}</ul>;
}

function Notifications({ go }: { go: (p: Page) => void }) {
  const qc = useQueryClient();
  const touch = useIsTouchLayout();
  const anim = useIconAnimation();
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ["admin", "notifications"], queryFn: () => adminApi<Notes>("/notifications"), refetchInterval: 60_000 });
  const unread = q.data?.unread ?? 0;
  const readAll = async () => { await adminApi("/notifications/seen", { method: "POST" }).catch(() => undefined); void qc.invalidateQueries({ queryKey: ["admin", "notifications"] }); };
  const onOpenChange = (o: boolean) => { setOpen(o); if (o) anim.start(); };
  const head = <span className="min-w-0"><span className="block font-display text-base">Notifications</span><span className="block text-xs font-normal text-muted-foreground">{unread ? `${unread} new` : "You're all caught up."}</span></span>;
  const readBtn = unread > 0 && <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); void readAll(); }} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border-2 border-foreground bg-card px-2.5 text-xs font-bold shadow-hard-sm hover:bg-muted"><Eye className="size-3.5" />Read all</button>;
  const trigger = <Button size="icon" variant="outline" {...anim.trigger} className="relative border-2 border-foreground" aria-label={`Notifications${unread ? `, ${unread} new` : ""}`}><BellIcon ref={anim.ref} size={16} />{unread > 0 && <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border-2 border-foreground bg-flag-red text-[10px] font-bold text-primary-foreground">{unread > 9 ? "9+" : unread}</span>}</Button>;

  if (touch) return <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
    <DrawerTrigger asChild>{trigger}</DrawerTrigger>
    <DrawerContent className={sheet}>
      <DrawerHeader className="flex items-center justify-between gap-3 border-b-2 border-foreground px-4 pb-3 pt-2 text-left"><div><DrawerTitle className="font-display text-xl">Notifications</DrawerTitle><DrawerDescription>{unread ? `${unread} new` : "You're all caught up."}</DrawerDescription></div>{readBtn}</DrawerHeader>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain"><NoteList notes={q.data} go={go} close={() => setOpen(false)} /></div>
    </DrawerContent>
  </Drawer>;
  return <DropdownMenu open={open} onOpenChange={onOpenChange}>
    <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-80 border-2 border-foreground p-0 shadow-hard">
      <DropdownMenuLabel className="flex items-center justify-between gap-3 border-b-2 border-foreground py-2 pl-4 pr-2.5">{head}{readBtn}</DropdownMenuLabel>
      <div className="max-h-[min(24rem,60vh)] overflow-y-auto overscroll-contain"><NoteList notes={q.data} go={go} close={() => setOpen(false)} /></div>
    </DropdownMenuContent>
  </DropdownMenu>;
}

// ---------- profile menu ----------
function Row({ icon: Icon, label, onSelect, danger }: { icon: typeof UserIcon; label: string; onSelect: () => void; danger?: boolean }) {
  const anim = useIconAnimation();
  return <DropdownMenuItem onSelect={onSelect} onMouseEnter={anim.start} onMouseLeave={anim.stop} className={cn("gap-2.5 rounded-md py-2 text-sm font-bold", danger ? "text-flag-red focus:bg-flag-red focus:text-primary-foreground" : "text-foreground focus:bg-primary focus:text-primary-foreground")}><Icon ref={anim.ref} size={16} />{label}</DropdownMenuItem>;
}
function SheetRow({ icon: Icon, label, onSelect, danger, active }: { icon: typeof UserIcon | LucideIcon; label: string; onSelect: () => void; danger?: boolean; active?: boolean }) {
  return <DrawerClose asChild><button type="button" onClick={onSelect} className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-base font-bold", active ? "bg-primary text-primary-foreground" : danger ? "text-flag-red active:bg-flag-red active:text-primary-foreground" : "active:bg-primary active:text-primary-foreground")}><Icon size={20} className="size-5" />{label}</button></DrawerClose>;
}

function ProfileMenu({ me, go, onSignOut }: { me: AdminMe; go: (p: Page) => void; onSignOut: () => void }) {
  const touch = useIsTouchLayout();
  const trigger = <button type="button" className="rounded-full outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-foreground" aria-label="Account menu"><Peep seed={me.avatarSeed} className="size-9" /></button>;
  const who = <><p className="truncate font-bold">{me.name}</p><p className="truncate text-xs font-normal text-muted-foreground">{me.email}</p><p className="text-xs font-normal text-muted-foreground">{ROLE_LABEL[me.role]}{me.mfaMethod !== "none" ? ", two-step on" : ""}</p></>;
  if (touch) return <Drawer shouldScaleBackground={false}>
    <DrawerTrigger asChild>{trigger}</DrawerTrigger>
    <DrawerContent className={sheet}>
      <DrawerHeader className="flex flex-row items-center gap-3 border-b-2 border-foreground px-4 pb-3 pt-2 text-left"><Peep seed={me.avatarSeed} className="size-12" /><div className="min-w-0"><DrawerTitle className="truncate font-display text-xl">{me.name}</DrawerTitle><DrawerDescription className="truncate">{ROLE_LABEL[me.role]}, {me.email}</DrawerDescription></div></DrawerHeader>
      <div className="p-2">
        <SheetRow icon={SettingsIcon} label="Settings" onSelect={() => go("settings")} />
        <SheetRow icon={UserIcon} label="Team" onSelect={() => go("team")} />
        <div className="flex items-center justify-between px-3 py-2"><span className="text-base font-bold">Theme</span><ThemeToggle className="size-10" /></div>
        <div className="my-1 border-t border-foreground/15" />
        <SheetRow icon={LogoutIcon} label="Sign out" onSelect={onSignOut} danger />
      </div>
    </DrawerContent>
  </Drawer>;
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-60 border-2 border-foreground shadow-hard">
      <DropdownMenuLabel>{who}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <Row icon={SettingsIcon} label="Settings" onSelect={() => go("settings")} />
      <Row icon={UserIcon} label="Team" onSelect={() => go("team")} />
      <DropdownMenuSeparator />
      <Row icon={LogoutIcon} label="Sign out" onSelect={onSignOut} danger />
    </DropdownMenuContent>
  </DropdownMenu>;
}

export function Topbar({ nav, me, page, go, onSignOut, openMember, auditSearch, onAuditSearch }: { nav: NavItem[]; me: AdminMe; page: Page; go: (p: Page) => void; onSignOut: () => void; openMember: (id: string) => void; auditSearch: string; onAuditSearch: (q: string) => void }) {
  const { ask, confirmation } = useConfirm();
  const signOut = async () => { if (await ask({ title: "Sign out of the admin panel?", copy: "This admin session will end on this tab. Any unsaved form changes will be lost.", confirm: "Sign out", danger: true })) onSignOut(); };
  return <><header className="sticky top-0 z-30 grid h-[calc(4rem+env(safe-area-inset-top))] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b-2 border-foreground bg-background/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur sm:px-6 lg:grid-cols-[1fr_minmax(0,40rem)_1fr]">
    <div className="flex items-center"><button type="button" onClick={() => go("overview")} className="shrink-0 transition-transform hover:-rotate-6 lg:hidden" aria-label="Overview"><img src="/ghosted-mark.png" alt="" className="size-10 object-contain" /></button></div>
    <Search nav={nav} me={me} page={page} go={go} openMember={openMember} auditSearch={auditSearch} onAuditSearch={onAuditSearch} />
    <div className="flex items-center justify-end gap-2 sm:gap-3">
      <span className="hidden sm:block"><ThemeToggle className="size-10" /></span>
      <Notifications go={go} />
      <ProfileMenu me={me} go={go} onSignOut={() => void signOut()} />
    </div>
  </header>{confirmation}</>;
}

// Phones and tablets: four main sections in a bottom dock, everything else under "More".
export function Dock({ nav, page, go, badge }: { nav: NavItem[]; page: Page; go: (p: Page) => void; badge: Partial<Record<Page, number>> }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y < 80) setHidden(false);
      else if (y - last > 8) setHidden(true);
      else if (last - y > 8) setHidden(false);
      if (Math.abs(y - last) > 8) last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const main = (["overview", "queue", "reports", "members"] as Page[]).map((id) => nav.find((n) => n.id === id)).filter(Boolean).slice(0, 4) as NavItem[];
  const rest = nav.filter((n) => !main.includes(n));
  const tab = (active: boolean): string => cn("relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-bold transition-colors", active ? "text-primary-foreground" : "text-foreground");
  return <nav aria-label="Admin" style={{ transform: hidden ? "translateY(110%)" : undefined }} className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-foreground bg-card/95 px-[max(0.5rem,env(safe-area-inset-left))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur transition-transform duration-300 ease-out focus-within:!transform-none lg:hidden">
    <div className="mx-auto flex max-w-xl items-stretch gap-1">
      {main.map((n) => <button key={n.id} type="button" onClick={() => go(n.id)} aria-current={page === n.id ? "page" : undefined} className={tab(page === n.id)}>
        {page === n.id && <motion.span layoutId="admin-dock-pill" className="absolute inset-0 rounded-lg border-2 border-foreground bg-primary shadow-hard-sm" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
        <span className="relative"><n.icon className="size-5" />{!!badge[n.id] && <span className="absolute -right-2.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full border border-foreground bg-flag-red px-1 text-[9px] text-primary-foreground">{badge[n.id]}</span>}</span>
        <span className="relative max-w-full truncate">{n.label === "Held for review" ? "Held" : n.label}</span>
      </button>)}
      <Drawer shouldScaleBackground={false}>
        <DrawerTrigger asChild><button type="button" className={tab(rest.some((n) => n.id === page))}>{rest.some((n) => n.id === page) && <motion.span layoutId="admin-dock-pill" className="absolute inset-0 rounded-lg border-2 border-foreground bg-primary shadow-hard-sm" />}<Menu className="relative size-5" /><span className="relative">More</span></button></DrawerTrigger>
        <DrawerContent className={sheet}>
          <DrawerHeader className="border-b-2 border-foreground px-4 pb-3 pt-2 text-left"><DrawerTitle className="font-display text-xl">Everything else</DrawerTitle><DrawerDescription>All the sections you have access to.</DrawerDescription></DrawerHeader>
          <div className="grid grid-cols-2 gap-1 overflow-y-auto p-2">{rest.map((n) => <SheetRow key={n.id} icon={n.icon} label={n.label} onSelect={() => go(n.id)} active={page === n.id} />)}</div>
        </DrawerContent>
      </Drawer>
    </div>
  </nav>;
}
