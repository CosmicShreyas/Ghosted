import { useEffect, useRef, useState, type ForwardRefExoticComponent, type ReactNode, type RefAttributes } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { samplePublicId } from "@/lib/stories";
import { AnimatePresence, motion } from "motion/react";
import { BadgeCheck, Building2, Eye, Hourglass, Loader2, UserCheck, UserPlus, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ghosted";
import {
  BellIcon, BookmarkIcon, HeartIcon, ChartLineIcon, HomeIcon, LogoutIcon, SearchIcon, SettingsIcon, ShieldCheckIcon, SparklesIcon,
  SquarePenIcon, UserIcon, XIcon, useIconAnimation, type IconHandle,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { useIsTouchLayout, useMediaQuery } from "@/hooks/use-media-query";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { displayName, isPublic, nameIsPublic, useTone, type Me } from "@/lib/session";
import { sidebarTaglines } from "@/mock/data";
import { timeAgo, useNotifications, type Notification } from "@/lib/notifications";
import { GOOFY_AVATAR, GOOFY_ID } from "@/lib/goofy";
import { YourTurn } from "./your-turn";
import { useSmoothScrollIn } from "@/components/smooth-scroll";
import { ApiRequestError } from "@/lib/api";
import { useSearch, type PersonSearchResult } from "@/lib/search";

export type View = "home" | "mine" | "waiting" | "companies" | "saved" | "insights" | "settings";
type AnimatedIcon = ForwardRefExoticComponent<{ size?: number; className?: string } & RefAttributes<IconHandle>>;

// `icon: null` = no animated version exists yet; `still` is the static icon shown instead.
export const NAV: { id: View; label: string; icon: AnimatedIcon | null; still?: LucideIcon }[] = [
  { id: "home", label: "Home feed", icon: HomeIcon },
  { id: "mine", label: "My Stories", icon: SquarePenIcon },
  { id: "waiting", label: "Waiting Room", icon: null, still: Hourglass },
  { id: "companies", label: "Companies", icon: null, still: Building2 },
  { id: "saved", label: "Saved", icon: BookmarkIcon },
  { id: "insights", label: "Insights", icon: ChartLineIcon },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

// A random tagline per page load. Picked after mount so server and client HTML match; the slot
// keeps its height so nothing shifts when it fades in.
function Tagline() {
  const tone = useTone();
  const [line, setLine] = useState<string | null>(null);
  // Calm tone: one plain description instead of a random joke.
  useEffect(() => setLine(tone === "calm" ? "Honest hiring reviews, from candidates." : sidebarTaglines[Math.floor(Math.random() * sidebarTaglines.length)]!), [tone]);
  return <p className="mt-1 min-h-8 px-2 text-xs leading-snug text-muted-foreground">
    <AnimatePresence>{line && <motion.span key={line} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="block">{line}</motion.span>}</AnimatePresence>
  </p>;
}

function Logo() {
  return <div>
    <Link to="/" className="flex items-center gap-1.5 px-2 font-display text-2xl font-bold tracking-tight" aria-label="Ghosted home"><img src="/ghosted-mark.png" alt="" className="size-10 object-contain" />Ghosted.</Link>
    <Tagline />
  </div>;
}

function NavItem({ id, label, icon: Icon, still: Still = Building2, active, onClick }: { id: View; label: string; icon: AnimatedIcon | null; still?: LucideIcon; active: boolean; onClick: () => void }) {
  const anim = useIconAnimation();
  return <button type="button" onClick={onClick} {...anim.trigger} aria-current={active ? "page" : undefined} data-nav={id} className={cn("flex w-full items-center gap-3 rounded-lg border-2 px-3 py-2 text-sm font-bold transition-colors", active ? "border-foreground bg-primary text-primary-foreground shadow-hard-sm" : "border-transparent hover:bg-muted")}>
    {Icon ? <Icon ref={anim.ref} size={16} className="grid place-items-center" /> : <Still className="size-4" />}
    {label}
  </button>;
}

function NavList({ view, onChange, savedCount }: { view: View | null; onChange: (v: View) => void; savedCount: number }) {
  void savedCount; // no counters on nav items: Saved is a place, not a to-do list
  return <nav className="space-y-1.5" aria-label="Dashboard">{NAV.map((n) => <NavItem key={n.id} {...n} active={view === n.id} onClick={() => onChange(n.id)} />)}</nav>;
}

type SidebarProps = { view: View | null; onChange: (v: View) => void; me: Me; savedCount: number };

// Shared by the desktop sidebar and the mobile slide-in drawer.
function SidebarContent({ view, onChange, me, savedCount }: SidebarProps) {
  const scrollRef = useSmoothScrollIn<HTMLDivElement>();
  return <>
    <div className="mb-6 mt-1"><Logo /></div>
    <NavList view={view} onChange={onChange} savedCount={savedCount} />
    {/* Scrolls on its own between the menu and Goofy's card, smoothly (its own Lenis), no scrollbar. */}
    <div ref={scrollRef} data-lenis-prevent className="no-scrollbar -mx-2 mb-3 min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3"><div><YourTurn onChange={onChange} /></div></div>
    <GoofyOnDuty />
  </>;
}

// Bottom of the sidebar: Goofy, on duty, one tap from his page.
function GoofyOnDuty() {
  return <Link to="/u/$id" params={{ id: GOOFY_ID }} className="group mt-auto flex items-center gap-3 rounded-xl border-2 border-foreground bg-[#6a2ee0] p-3 text-[#f6efe0] shadow-hard-sm transition-transform hover:-translate-y-0.5">
    {/* The "on duty" dot sits on his picture, like an online status. */}
    <span className="relative shrink-0">
      <img src={GOOFY_AVATAR} alt="" className="size-10 rounded-full border-2 border-[#f6efe0] object-cover" />
      <span className="absolute -bottom-0.5 -right-0.5 flex size-3.5" aria-label="On duty">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-flag-green opacity-75" />
        <span className="relative inline-flex size-3.5 rounded-full border-2 border-[#6a2ee0] bg-flag-green" />
      </span>
    </span>
    <span className="min-w-0">
      <span className="flex items-center gap-1.5 text-sm font-bold">Goofy <span className="rounded-full bg-[#f6efe0] px-1.5 text-[9px] font-bold uppercase text-[#6a2ee0]">AutoMod</span></span>
      <span className="block text-[11px] opacity-90">On duty, keeping it civil</span>
    </span>
  </Link>;
}

export function Sidebar(props: SidebarProps) {
  return <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r-2 border-foreground bg-card p-4 lg:flex"><SidebarContent {...props} /></aside>;
}

// Phones and tablets: an app-style dock fixed to the bottom of the screen, instead of the sidebar.
// Five tabs, like a native app. Insights and Settings live in the account sheet (your avatar).
const DOCK: View[] = ["home", "mine", "waiting", "companies", "saved"];
const SHORT: Record<View, string> = { home: "Home", mine: "Stories", waiting: "Waiting", companies: "Companies", saved: "Saved", insights: "Insights", settings: "Settings" };

function DockItem({ id, icon: Icon, still: Still = Building2, active, onClick }: { id: View; icon: AnimatedIcon | null; still?: LucideIcon | undefined; active: boolean; onClick: () => void }) {
  const anim = useIconAnimation();
  return <button type="button" onClick={() => { anim.start(); onClick(); }} aria-current={active ? "page" : undefined} aria-label={SHORT[id]} className={cn("relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-bold transition-colors", active ? "text-primary-foreground" : "text-foreground")}>
    {active && <motion.span layoutId="dock-pill" className="absolute inset-0 rounded-lg border-2 border-foreground bg-primary shadow-hard-sm" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
    <span className="relative">
      {Icon ? <Icon ref={anim.ref} size={20} className="grid place-items-center" /> : <Still className="size-5" />}
    </span>
    <span className="relative truncate">{SHORT[id]}</span>
  </button>;
}

// Like a native tab bar: slides away while you read down the page, comes back the moment you
// scroll up (or reach the top), so stories get the whole screen.
function useHideOnScroll() {
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
  return hidden;
}

export function BottomDock({ view, onChange, savedCount }: { view: View | null; onChange: (v: View) => void; savedCount: number }) {
  void savedCount;
  const hidden = useHideOnScroll();
  return <nav aria-label="Dashboard" style={{ transform: hidden ? "translateY(110%)" : undefined }} className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-foreground bg-card/95 px-[max(0.5rem,env(safe-area-inset-left))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur transition-transform duration-300 ease-out focus-within:!transform-none lg:hidden">
    <div className="mx-auto flex max-w-xl items-stretch gap-1">
      {NAV.filter((n) => DOCK.includes(n.id)).map((n) => <DockItem key={n.id} id={n.id} icon={n.icon} still={n.still} active={view === n.id} onClick={() => onChange(n.id)} />)}
    </div>
  </nav>;
}

// Phones/tablets: menus open as a bottom sheet with a drag handle, like a native app. Drag it down
// (or flick), tap outside, or press Esc to close. Desktop keeps the dropdowns.
const sheet = "max-h-[85vh] rounded-t-2xl border-2 border-b-0 border-foreground bg-card pb-[max(1rem,env(safe-area-inset-bottom))] shadow-hard [&>div:first-child]:mt-3 [&>div:first-child]:h-1.5 [&>div:first-child]:w-12 [&>div:first-child]:bg-foreground/25";

type Bell = ReturnType<typeof useNotifications>;

function NotificationTarget({ n, onOpen, children }: { n: Notification; onOpen: () => void; children: ReactNode }) {
  const cls = "block min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  if (n.storyPublicId) return <Link to="/s/$id" params={{ id: n.storyPublicId }} onClick={onOpen} className={cn(cls, "hover:underline")}>{children}</Link>;
  if (n.companySlug) return <Link to="/c/$slug" params={{ slug: n.companySlug }} onClick={onOpen} className={cn(cls, "hover:underline")}>{children}</Link>;
  if (n.profilePublicId) return <Link to="/u/$id" params={{ id: n.profilePublicId }} onClick={onOpen} className={cn(cls, "hover:underline")}>{children}</Link>;
  return <div className="min-w-0 flex-1">{children}</div>;
}

// Unread items keep their purple dot until their eye button (or "read all") is used.
function NotificationList({ bell }: { bell: Bell }) {
  if (bell.loading) return <div className="space-y-2 p-4" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-10 rounded-md" />)}</div>;
  if (!bell.list.length) return <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing yet. When your stories help people, you'll hear about it here.</p>;
  return <ul>
    <AnimatePresence initial={false}>{bell.list.map((n) => <motion.li key={n.publicId} layout className="group flex items-start gap-3 border-b border-foreground/15 px-4 py-3 last:border-0">
      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full transition-colors", n.read ? "bg-muted" : "bg-primary")} aria-label={n.read ? "Read" : "Unread"} />
      {/* Goofy, the AutoMod, speaks with his own face. */}
      {n.kind === "goofy" && <img src={GOOFY_AVATAR} alt="Goofy" title="Goofy, AutoMod" className="size-8 shrink-0 rounded-full border-2 border-foreground object-cover" />}
      {/* Tapping opens what it's about (a story, a company or a person) and marks it read. */}
      <NotificationTarget n={n} onOpen={() => { if (!n.read) void bell.markRead(n.publicId); }}><p className={cn("text-sm", !n.read && "font-semibold")}>{n.body}</p><p className="mt-0.5 text-xs text-muted-foreground">{timeAgo(n)}</p></NotificationTarget>
      {!n.read && <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); void bell.markRead(n.publicId); }} aria-label="Mark as read" title="Mark as read"
        className="-mr-1 grid size-8 shrink-0 place-items-center rounded-md border-2 border-transparent text-muted-foreground transition-colors hover:border-foreground hover:bg-muted hover:text-foreground focus-visible:border-foreground focus-visible:outline-none">
        <Eye className="size-4" />
      </button>}
    </motion.li>)}</AnimatePresence>
  </ul>;
}

function ReadAllButton({ bell }: { bell: Bell }) {
  // A clear, labelled button (same look as the site's small outline buttons); hidden when nothing's unread.
  if (!bell.unread) return null;
  return <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); void bell.markAllRead(); }} aria-label="Mark all as read"
    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border-2 border-foreground bg-card px-2.5 text-xs font-bold text-foreground shadow-hard-sm transition-all hover:-translate-y-px hover:bg-muted active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
    <Eye className="size-3.5" />Read all
  </button>;
}

function Notifications() {
  const touch = useIsTouchLayout();
  const bell = useNotifications();
  const anim = useIconAnimation();
  const unread = bell.unread;
  // Opening the list no longer marks anything read: only the eye buttons do.
  const onOpenChange = (open: boolean) => { if (open) anim.start(); };
  const trigger = <Button size="icon" variant="outline" {...anim.trigger} className="relative border-2 border-foreground" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}><BellIcon ref={anim.ref} size={16} />{unread > 0 && <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border-2 border-foreground bg-flag-red text-[10px] font-bold text-primary-foreground">{unread > 99 ? "99+" : unread}</span>}</Button>;

  if (touch) return <Drawer shouldScaleBackground={false} onOpenChange={onOpenChange}>
    <DrawerTrigger asChild>{trigger}</DrawerTrigger>
    <DrawerContent className={sheet}>
      <DrawerHeader className="flex items-center justify-between gap-3 border-b-2 border-foreground px-4 pb-3 pt-2 text-left">
        <div className="min-w-0"><DrawerTitle className="font-display text-xl">Notifications</DrawerTitle><DrawerDescription>{unread ? `${unread} unread` : "You're all caught up."}</DrawerDescription></div>
        <ReadAllButton bell={bell} />
      </DrawerHeader>
      {/* min-h-0 lets the list shrink inside the sheet, so long lists scroll instead of overflowing. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-lenis-prevent><NotificationList bell={bell} /></div>
    </DrawerContent>
  </Drawer>;

  return <DropdownMenu onOpenChange={onOpenChange}>
    <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-80 border-2 border-foreground p-0 shadow-hard">
      <DropdownMenuLabel className="flex items-center justify-between gap-3 border-b-2 border-foreground py-2 pl-4 pr-2.5">
        <span className="min-w-0"><span className="block font-display text-base">Notifications</span><span className="block text-xs font-normal text-muted-foreground">{unread ? `${unread} unread` : "You're all caught up."}</span></span>
        <ReadAllButton bell={bell} />
      </DropdownMenuLabel>
      {/* Header stays put; the list scrolls (slim violet scrollbar) once it's taller than ~6 items. */}
      <div className="max-h-[min(24rem,60vh)] overflow-y-auto overscroll-contain" data-lenis-prevent><NotificationList bell={bell} /></div>
    </DropdownMenuContent>
  </DropdownMenu>;
}

function MenuRow({ icon: Icon, label, onSelect, danger }: { icon: AnimatedIcon; label: string; onSelect: () => void; danger?: boolean }) {
  const anim = useIconAnimation();
  // Bold, full-contrast text; on hover/focus the row fills (violet, or red for Log out) with white text.
  return <DropdownMenuItem onSelect={onSelect} onMouseEnter={anim.start} onMouseLeave={anim.stop} onFocus={anim.start} onBlur={anim.stop} className={cn("gap-2.5 rounded-md py-2 text-sm font-bold", danger ? "text-flag-red focus:bg-flag-red focus:text-primary-foreground" : "text-foreground focus:bg-primary focus:text-primary-foreground")}><Icon ref={anim.ref} size={16} />{label}</DropdownMenuItem>;
}

// Bottom-sheet version of a menu row: bigger touch target, closes the sheet when tapped.
function SheetRow({ icon: Icon, label, onSelect, danger }: { icon: AnimatedIcon; label: string; onSelect: () => void; danger?: boolean }) {
  const anim = useIconAnimation();
  return <DrawerClose asChild><button type="button" onClick={() => { anim.start(); onSelect(); }} className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-3.5 text-left text-base font-bold transition-colors", danger ? "text-flag-red active:bg-flag-red active:text-primary-foreground" : "text-foreground active:bg-primary active:text-primary-foreground")}><Icon ref={anim.ref} size={20} />{label}</button></DrawerClose>;
}

function ProfileMenu({ me, onChange, onLogout }: { me: Me; onChange: (v: View) => void; onLogout: () => void }) {
  const touch = useIsTouchLayout();
  const navigate = useNavigate();
  // Your own page, exactly as other people see it (in the preview, the sample person standing in for you).
  const viewProfile = () => navigate({ to: "/u/$id", params: { id: me.publicId ?? samplePublicId("u1") } });
  const trigger = <button type="button" className="rounded-full outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-foreground" aria-label="Account menu"><Avatar seed={me.avatarSeed} pastel={me.pastel} size="sm" label={displayName(me)} /></button>;

  if (touch) return <Drawer shouldScaleBackground={false}>
    <DrawerTrigger asChild>{trigger}</DrawerTrigger>
    <DrawerContent className={sheet}>
      <DrawerHeader className="flex flex-row items-center gap-3 border-b-2 border-foreground px-4 pb-3 pt-2 text-left">
        <Avatar seed={me.avatarSeed} pastel={me.pastel} size="md" label={displayName(me)} />
        <div className="min-w-0"><DrawerTitle className="truncate font-display text-xl">{displayName(me)}</DrawerTitle><DrawerDescription className="truncate">{nameIsPublic(me) ? `aka ${me.handle} · ` : ""}{isPublic(me) ? "Public profile" : "Anonymous"}</DrawerDescription></div>
      </DrawerHeader>
      <div className="p-2">
        <SheetRow icon={UserIcon} label="View profile" onSelect={viewProfile} />
        {/* The dock keeps five tabs; the rest of the app lives here on phones and tablets. */}
        <SheetRow icon={ChartLineIcon} label="Insights" onSelect={() => onChange("insights")} />
        <SheetRow icon={SettingsIcon} label="Settings" onSelect={() => onChange("settings")} />
        <SheetRow icon={HeartIcon} label="Invite friends" onSelect={() => void navigate({ to: "/invite" })} />
        <SheetRow icon={SparklesIcon} label="Feedback and support" onSelect={() => void navigate({ to: "/feedback" })} />
        <div className="my-1 border-t border-foreground/15" />
        <SheetRow icon={LogoutIcon} label="Log out" onSelect={onLogout} danger />
      </div>
    </DrawerContent>
  </Drawer>;

  return <DropdownMenu>
    <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-56 border-2 border-foreground shadow-hard">
      <DropdownMenuLabel><p className="truncate font-bold">{displayName(me)}</p>{nameIsPublic(me) && <p className="truncate text-xs font-normal text-muted-foreground">aka {me.handle}</p>}<p className="text-xs font-normal text-muted-foreground">{isPublic(me) ? "Public profile" : "Anonymous"}</p></DropdownMenuLabel>
      <DropdownMenuSeparator />
      <MenuRow icon={UserIcon} label="View profile" onSelect={viewProfile} />
      <MenuRow icon={SquarePenIcon} label="My stories" onSelect={() => onChange("mine")} />
      <MenuRow icon={SettingsIcon} label="Settings" onSelect={() => onChange("settings")} />
      <MenuRow icon={HeartIcon} label="Invite friends" onSelect={() => void navigate({ to: "/invite" })} />
      <MenuRow icon={SparklesIcon} label="Feedback and support" onSelect={() => void navigate({ to: "/feedback" })} />
      <DropdownMenuSeparator />
      <MenuRow icon={LogoutIcon} label="Log out" onSelect={onLogout} danger />
    </DropdownMenuContent>
  </DropdownMenu>;
}

function SearchBox({ query, onQuery, view }: { query: string; onQuery: (q: string) => void; view: View | null }) {
  // The full hint doesn't fit a phone's search box (it showed as a lone "S"), so phones get a short one.
  const compact = useMediaQuery("(max-width: 639.98px)");
  const search = useIconAnimation();
  const clear = useIconAnimation();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const peopleSearch = useSearch(view === "insights" ? "" : query);
  const people = peopleSearch.debouncing ? [] : peopleSearch.data?.people ?? [];
  const showPeople = open && query.trim().length >= 2 && view !== "insights";
  const follow = async (person: PersonSearchResult) => {
    setBusy(person.publicId);
    try { await peopleSearch.setFollowing(person, !person.following); }
    catch (error) { toast.error(error instanceof ApiRequestError && error.status === 401 ? "Log in to follow people." : "Couldn't update that follow. Try again."); }
    finally { setBusy(null); }
  };
  // Press "/" anywhere (when not already typing) to jump to search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || t?.closest("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault(); input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return <div className="relative block" onMouseEnter={search.start} onMouseLeave={search.stop} onFocusCapture={() => setOpen(true)} onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) { setOpen(false); search.stop(); } }}>
    <label htmlFor="global-search" className="sr-only">Search people, companies, stories and warning signs</label>
    <SearchIcon ref={search.ref} size={16} className="pointer-events-none absolute left-3 top-5 -translate-y-1/2 text-muted-foreground" />
    {!query && !compact && <kbd className="pointer-events-none absolute right-2.5 top-5 hidden -translate-y-1/2 rounded border border-foreground/30 px-1.5 font-mono text-[10px] font-bold text-muted-foreground lg:block" aria-hidden="true">/</kbd>}
    {/* type="text" (not "search") so the browser doesn't add its own second clear button. */}
    <input id="global-search" ref={input} type="text" inputMode="search" enterKeyHint="search" role="searchbox" autoComplete="off" value={query} onChange={(e) => onQuery(e.target.value)} onFocus={search.start} onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); onQuery(""); } }} placeholder={view === "insights" ? (compact ? "Filter by role…" : "Filter insights by role, like Backend Engineer…") : compact ? "Search people…" : "Search people, companies, stories…"} aria-label="Search people, companies, stories and warning signs" aria-expanded={showPeople} aria-controls="people-search-results" className="h-10 w-full rounded-lg border-2 border-foreground bg-card pl-9 pr-9 text-sm outline-none transition-shadow focus:shadow-hard-sm" />
    {query && <button type="button" onClick={() => { onQuery(""); input.current?.focus(); }} {...clear.trigger} className="absolute right-2 top-5 grid size-6 -translate-y-1/2 place-items-center rounded hover:bg-muted" aria-label="Clear search"><XIcon ref={clear.ref} size={14} /></button>}
    {showPeople && <div id="people-search-results" role="region" aria-label="People search results" className="fixed left-3 right-3 top-[calc(4rem+env(safe-area-inset-top)+.5rem)] z-50 max-h-[min(24rem,60vh)] overflow-y-auto rounded-xl border-2 border-foreground bg-popover p-2 shadow-hard sm:absolute sm:left-0 sm:right-0 sm:top-[calc(100%+.5rem)]">
      <p className="px-2 pb-1 pt-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">People</p>
      {peopleSearch.loading ? <div className="flex items-center gap-2 px-2 py-4 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Finding people…</div>
        : people.length ? people.map((person) => <div key={person.publicId} className="flex items-center gap-2 rounded-lg p-1 hover:bg-muted focus-within:bg-muted">
          <Link to="/u/$id" params={{ id: person.publicId }} onClick={() => { setOpen(false); onQuery(""); }} className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {person.publicId === GOOFY_ID || person.bot
              ? <img src={GOOFY_AVATAR} alt="" className="size-8 shrink-0 rounded-full border-2 border-foreground object-cover" />
              : <Avatar seed={person.avatarSeed} pastel={person.pastel} size="sm" label={person.name} />}
            <span className="min-w-0"><span className="flex items-center gap-1"><strong className="truncate text-sm">{person.name}</strong>{person.bot && <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Verified official account" />}</span><span className="block truncate text-xs text-muted-foreground">{person.bot ? `Official ${person.bot.badge} account` : person.name !== person.handle ? `aka ${person.handle}` : [person.revealed?.role, person.revealed?.city].filter(Boolean).join(" · ") || "Anonymous member"}</span></span>
          </Link>
          {!person.isMe && <Button type="button" size="sm" variant={person.following ? "outline" : "default"} disabled={busy === person.publicId} onClick={() => void follow(person)} className="shrink-0 px-2.5 sm:px-3" aria-label={`${person.following ? "Unfollow" : "Follow"} ${person.name}`}>
            {busy === person.publicId ? <Loader2 className="animate-spin" /> : person.following ? <UserCheck /> : <UserPlus />}<span className="hidden sm:inline">{person.following ? "Following" : "Follow"}</span>
          </Button>}
        </div>) : <p className="px-2 py-4 text-sm text-muted-foreground">No people found. Stories and companies will still appear below.</p>}
    </div>}
  </div>;
}

// `view: null` = a page outside the dashboard views (e.g. someone's profile): nothing is highlighted.
export function Topbar({ query, onQuery, onShare, me, view, onChange, onLogout, savedCount }: { query: string; onQuery: (q: string) => void; onShare: () => void; me: Me; view: View | null; onChange: (v: View) => void; onLogout: () => void; savedCount: number }) {
  const share = useIconAnimation();
  return <>
    {/* Three columns: left logo (phones/tablets), centred search, actions. The search stays centred at any width. */}
    <header className="sticky top-0 z-30 grid h-[calc(4rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b-2 border-foreground bg-background/95 px-4 backdrop-blur sm:px-6 lg:grid-cols-[1fr_minmax(0,36rem)_1fr]">
      <div className="flex items-center">
        {/* Navigation lives in the bottom dock on small screens, so the corner just shows the brand. */}
        <button type="button" onClick={() => onChange("home")} className="shrink-0 transition-transform hover:-rotate-6 lg:hidden" aria-label="Ghosted home feed"><img src="/ghosted-mark.png" alt="" className="size-10 object-contain" /></button>
      </div>
      <SearchBox query={query} onQuery={onQuery} view={view} />
      <div className="flex items-center justify-end gap-2 sm:gap-3">
        <Button onClick={onShare} {...share.trigger} aria-label="Share a story"><SquarePenIcon ref={share.ref} size={16} /><span className="hidden sm:inline">Share a story</span></Button>
        <Notifications />
        <ProfileMenu me={me} onChange={onChange} onLogout={onLogout} />
      </div>
    </header>
    <BottomDock view={view} onChange={onChange} savedCount={savedCount} />
  </>;
}
