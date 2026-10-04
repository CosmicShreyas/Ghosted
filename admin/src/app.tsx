// The admin panel shell: sign-in gate, navigation (sidebar on desktop, a bottom dock on phones and
// tablets), the top bar (search, notifications, profile menu) and the pages. Navigation lives in
// the URL hash (#queue…), so a refresh keeps your place. Sections you don't have permission for
// aren't shown (and the server refuses them anyway).
import { useEffect, useState, type ForwardRefExoticComponent, type ReactNode, type RefAttributes } from "react";
import { ChartLineIcon, HomeIcon, MessageCircleIcon, SettingsIcon, ShieldCheckIcon, SparklesIcon, UserIcon, WalletIcon, useIconAnimation, type IconHandle } from "@/components/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Bot, BookText, Building2, Flag, Hourglass, IndianRupee, LayoutDashboard, MessageSquareHeart, ScrollText, Settings, SlidersHorizontal, UserCog, Users, type LucideIcon } from "lucide-react";
import { Preloader } from "@/components/preloader";
import { useApplyTheme, useResolvedTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { adminApi, refresh, session, type AdminMe } from "./api";
import { can, ROLE_LABEL, type Permission } from "./perms";
import { Dock, Topbar } from "./topbar";
import { Login } from "./login";
import { OverviewPage } from "./pages/overview";
import { QueuePage } from "./pages/queue";
import { ReportsPage } from "./pages/reports";
import { FeedbackPage } from "./pages/feedback";
import { AuditPage, CompaniesPage, DonationsPage, TermsPage } from "./pages/more";
import { MembersPage } from "./pages/members";
import { TeamPage } from "./pages/team";
import { PlatformPage } from "./pages/platform";
import { GoofyControlsPage, GoofyOverviewPage } from "./pages/goofy";
import { SettingsPage } from "./pages/settings";
import { GrowthPage } from "./pages/growth";
import { VoicePage } from "./pages/voice";
import { StoragePage } from "./pages/storage";
import { FileWarning, HardDrive, Megaphone } from "lucide-react";

export type Page = "overview" | "queue" | "reports" | "voice" | "goofy" | "goofy-controls" | "terms" | "members" | "feedback" | "companies" | "donations" | "team" | "audit" | "platform" | "growth" | "storage" | "settings";
// Animated icons (same set as the main app) play on hover; the rest are plain Lucide icons.
type Animated = ForwardRefExoticComponent<{ size?: number; className?: string } & RefAttributes<IconHandle>>;
const ANIM: Partial<Record<Page, Animated>> = { overview: HomeIcon, members: UserIcon, team: ShieldCheckIcon, feedback: MessageCircleIcon, donations: WalletIcon, settings: SettingsIcon, audit: ChartLineIcon, platform: SparklesIcon };

function NavButton({ n, on, badge, hot, onClick }: { n: { id: Page; label: string; icon: LucideIcon }; on: boolean; badge?: number | undefined; hot: boolean; onClick: () => void }) {
  const anim = useIconAnimation();
  const A = ANIM[n.id];
  return <button type="button" onClick={onClick} {...anim.trigger} aria-current={on ? "page" : undefined} className={cn("relative flex w-full items-center gap-3 rounded-lg border-2 px-3 py-2 text-sm font-bold transition-colors", on ? "border-foreground bg-primary text-primary-foreground shadow-hard-sm" : "border-transparent hover:bg-muted")}>
    {A ? <A ref={anim.ref} size={16} /> : <n.icon className="size-4" />}{n.label}
    {!!badge && <span className={cn("ml-auto rounded-full px-2 text-[11px] tabular-nums", on ? "bg-primary-foreground text-primary" : hot ? "bg-flag-red text-primary-foreground" : "bg-foreground text-background")}>{badge}</span>}
  </button>;
}

const NAV: { id: Page; label: string; icon: LucideIcon; group: string; need?: Permission }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, group: "" },
  { id: "queue", label: "Held for review", icon: Hourglass, group: "Moderation", need: "queue" },
  { id: "reports", label: "Reports", icon: Flag, group: "Moderation", need: "reports" },
  { id: "voice", label: "Requests & replies", icon: FileWarning, group: "Moderation", need: "reports" },
  { id: "goofy", label: "Overview", icon: Bot, group: "Goofy" },
  { id: "goofy-controls", label: "Controls", icon: SlidersHorizontal, group: "Goofy" },
  { id: "terms", label: "Word lists", icon: BookText, group: "Goofy", need: "terms" },
  { id: "members", label: "Members", icon: Users, group: "People", need: "members" },
  { id: "team", label: "Team", icon: UserCog, group: "People" },
  { id: "feedback", label: "Feedback", icon: MessageSquareHeart, group: "Community", need: "feedback" },
  { id: "companies", label: "Companies", icon: Building2, group: "Community", need: "companies" },
  { id: "donations", label: "Donations", icon: IndianRupee, group: "Community", need: "donations" },
  { id: "platform", label: "Platform", icon: SlidersHorizontal, group: "Control" },
  { id: "growth", label: "Growth", icon: Megaphone, group: "Control" },
  { id: "storage", label: "Storage", icon: HardDrive, group: "Control" },
  { id: "audit", label: "Audit log", icon: ScrollText, group: "Control", need: "audit" },
  { id: "settings", label: "Settings", icon: Settings, group: "Control" },
];

type Counts = { queue: { stories: number; chitchats: number }; reports: { open: number; urgent: number }; feedback: { new: number } };

function Shell({ me, onSignOut, onMe }: { me: AdminMe; onSignOut: () => void; onMe: (m: AdminMe) => void }) {
  const nav = NAV.filter((n) => !n.need || can(me, n.need));
  const fromHash = (): Page => { const h = location.hash.slice(1) as Page; return nav.some((n) => n.id === h) ? h : "overview"; };
  const [page, setPage] = useState<Page>(fromHash);
  useEffect(() => { const f = () => setPage(fromHash()); addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); });
  const go = (p: Page) => { location.hash = p; setPage(p); scrollTo({ top: 0 }); };
  const counts = useQuery({ queryKey: ["admin", "overview"], queryFn: () => adminApi<Counts>("/overview"), refetchInterval: 30_000 }).data;
  const badge: Partial<Record<Page, number>> = counts ? { queue: counts.queue.stories + counts.queue.chitchats, reports: counts.reports.open, feedback: counts.feedback.new } : {};
  let lastGroup = "";

  // Emails follow the panel's theme, like the main site: switch to dark here, get dark emails.
  const theme = useResolvedTheme();
  useEffect(() => {
    if (theme === me.emailTheme) return;
    void adminApi<{ me: AdminMe }>("/me", { method: "PATCH", body: { emailTheme: theme } }).then((r) => onMe(r.me)).catch(() => undefined);
  }, [theme, me.emailTheme, onMe]);

  // A member picked from the top bar's search opens straight in the Members page.
  const [focusMember, setFocusMember] = useState<string | null>(null);
  const [auditSearch, setAuditSearch] = useState("");
  const openMember = (id: string) => { setFocusMember(id); go("members"); };

  const body: Record<Page, ReactNode> = {
    overview: <OverviewPage go={go} me={me} />, queue: <QueuePage />, reports: <ReportsPage />, feedback: <FeedbackPage />, members: <MembersPage me={me} focus={focusMember} onFocused={() => setFocusMember(null)} />,
    companies: <CompaniesPage />, donations: <DonationsPage />, goofy: <GoofyOverviewPage me={me} />, "goofy-controls": <GoofyControlsPage me={me} />, terms: <TermsPage />, audit: <AuditPage search={auditSearch} />, team: <TeamPage me={me} />,
    platform: <PlatformPage me={me} />, growth: <GrowthPage />, voice: <VoicePage />, storage: <StoragePage me={me} />, settings: <SettingsPage me={me} onMe={onMe} onSignOut={onSignOut} />,
  };

  return <div className="min-h-screen bg-background lg:pl-64">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r-2 border-foreground bg-card p-4 lg:flex">
      <div className="mb-5 flex items-center gap-2 px-2 font-display text-xl font-bold"><img src="/ghosted-mark.png" alt="" className="size-9 object-contain" />Ghosted.<span className="rounded-full bg-foreground px-1.5 py-0.5 text-[10px] uppercase text-background">Admin</span></div>
      <nav className="no-scrollbar flex-1 space-y-0.5 overflow-y-auto" aria-label="Admin">{nav.map((n) => {
        const head = n.group && n.group !== lastGroup ? n.group : null; lastGroup = n.group;
        const on = page === n.id;
        return <div key={n.id}>
          {head && <p className="mb-1 mt-4 px-3 text-xs font-semibold text-muted-foreground">{head}</p>}
          <NavButton n={n} on={on} badge={badge[n.id]} hot={n.id === "reports" && !!counts?.reports.urgent} onClick={() => go(n.id)} />
        </div>;
      })}</nav>
      <p className="mt-4 border-t-2 border-foreground/10 px-2 pt-3 text-xs text-muted-foreground">Signed in as {ROLE_LABEL[me.role].toLowerCase()}. Every action is logged.</p>
    </aside>

    <Topbar nav={nav} me={me} page={page} go={go} onSignOut={onSignOut} openMember={openMember} auditSearch={auditSearch} onAuditSearch={setAuditSearch} />
    <Dock nav={nav} page={page} go={go} badge={badge} />

    <main className="mx-auto w-full max-w-[1600px] px-3 pb-28 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pb-12 lg:pt-8 2xl:px-12">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={page} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>{body[page]}</motion.div>
      </AnimatePresence>
    </main>
  </div>;
}

export function App() {
  useApplyTheme();
  const qc = useQueryClient();
  // A stored refresh token is swapped for a fresh access token before anything is shown; with no
  // valid session there's only the sign-in screen. Nothing inside renders without the server's yes.
  const [me, setMe] = useState<AdminMe | null | undefined>(() => (session.get() ? undefined : null));
  useEffect(() => {
    if (me !== undefined) return;
    (async () => { if (!(await refresh())) throw new Error("no session"); return adminApi<{ admin: AdminMe }>("/me"); })()
      .then((r) => setMe(r.admin)).catch(() => { session.clear(); setMe(null); });
  }, [me]);
  useEffect(() => { const f = () => { qc.clear(); setMe(null); }; addEventListener("ghosted:admin-signed-out", f); return () => removeEventListener("ghosted:admin-signed-out", f); }, [qc]);
  const signOut = async () => { try { await adminApi("/logout", { method: "POST" }); } catch { /* already gone */ } session.clear(); };

  if (me === undefined) return <Preloader />;
  if (!me) return <Login onSignedIn={setMe} />;
  return <Shell me={me} onMe={setMe} onSignOut={() => void signOut()} />;
}
