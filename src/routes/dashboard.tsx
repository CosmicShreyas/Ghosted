import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Sidebar, Topbar, type View } from "@/components/dashboard/shell";
import { CompaniesView, HomeView, MineView, SavedView } from "@/components/dashboard/views";
import { InsightsView } from "@/components/dashboard/insights-view";
import { WaitingRoomView } from "@/components/dashboard/waiting-room";
import { FeedbackPulse } from "@/components/feedback-pulse";
import { SettingsView } from "@/components/dashboard/settings";
import { ShareModal, type StoryPreset } from "@/components/dashboard/share-story";
import { RightRail } from "@/components/dashboard/global-widgets";
import { Preloader } from "@/components/preloader";
import { LogoutDialog } from "@/components/dashboard/confirm-dialogs";
import { useAccountActions, useAuthGuard, useMe } from "@/lib/session";
import type { Company } from "@/mock/data";
import { useSaved } from "@/lib/saved";
import { filtersFromSearch, insightSearch, searchFromFilters, type InsightSearch } from "@/lib/insights";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Your feed | Ghosted" },
      { name: "description", content: "Your anonymous hiring story feed and company Flag Scores." },
      { property: "og:title", content: "Your feed | Ghosted" },
      { property: "og:description", content: "Your anonymous hiring story feed and company Flag Scores." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  // ?view= opens a view; Insights also keeps its period and filters here, so a view can be shared.
  // ?share=1&company=<slug>&outcome=<id> opens "Share a story" prefilled (Spotlight, share links).
  validateSearch: (search: Record<string, unknown>): { view?: View; share?: 1; company?: string; outcome?: string } & InsightSearch => ({
    ...(VIEWS.includes(search["view"] as View) && { view: search["view"] as View }),
    ...((search["share"] === 1 || search["share"] === "1") && { share: 1 as const }),
    ...(typeof search["company"] === "string" && /^[a-z0-9-]{2,60}$/.test(search["company"]) && { company: search["company"] }),
    ...(typeof search["outcome"] === "string" && ["ghosted", "rejected", "offer", "offer_revoked", "ghost_job"].includes(search["outcome"]) && { outcome: search["outcome"] }),
    ...insightSearch(search),
  }),
  component: DashboardPage,
});

const VIEWS: View[] = ["home", "mine", "waiting", "companies", "saved", "insights", "settings"];

function DashboardPage() {
  const navigate = useNavigate();
  const { me } = useMe();
  // Signed out (or both tokens expired)? Straight to /auth. Until we know, show the preloader.
  const { waiting } = useAuthGuard("private");
  const { logout } = useAccountActions();
  // `?view=settings` etc. opens a view directly (used by links from people pages).
  const search = Route.useSearch();
  const [view, setView] = useState<View>(search.view ?? "home");
  useEffect(() => { if (search.view) setView(search.view); }, [search.view]);
  const [query, setQuery] = useState("");
  const [share, setShare] = useState(false);
  // A share deep link opens the popup with what it names filled in, then tidies the URL.
  const [linkPreset, setLinkPreset] = useState<StoryPreset | null>(null);
  useEffect(() => {
    if (!search.share) return;
    setLinkPreset({ ...(search.company && { company: search.company }), ...(search.outcome && { outcome: search.outcome }) });
    void navigate({ to: "/dashboard", search: { ...(search.view && { view: search.view }) }, replace: true });
  }, [search.share, search.company, search.outcome, search.view, navigate]);
  // Companies open their own page (/c/<slug>) instead of a popup.
  const setCompany = (c: Company) => navigate({ to: "/c/$slug", params: { slug: c.id } });
  const [saved, toggleSave] = useSaved();
  const [confirmLogout, setConfirmLogout] = useState(false);


  const changeView = (v: View) => { setView(v); window.scrollTo({ top: 0 }); };
  const leave = () => navigate({ to: "/auth" });
  const common = { query, saved, toggleSave, openCompany: setCompany, onShare: () => setShare(true) };
  const showRail = view === "home" || view === "mine" || view === "saved";

  // While the session is being checked (and silently refreshed if needed), show a calm splash
  // instead of the demo profile or a flash of the login page.
  if (waiting) return <Preloader />;

  return <div className="min-h-screen bg-background lg:pl-60">
    <Sidebar view={view} onChange={changeView} me={me} savedCount={saved.size} />
    <Topbar query={query} onQuery={setQuery} onShare={() => setShare(true)} me={me} view={view} onChange={changeView} onLogout={() => setConfirmLogout(true)} savedCount={saved.size} />
    {/* Extra bottom space on phones/tablets so the bottom dock never covers the last item. */}
    <main className="mx-auto max-w-[1500px] p-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:p-6 sm:pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-6">
      <div className={showRail ? "grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]" : ""}>
        {/* Switching tabs fades the new screen in with a small rise, like a native tab change. */}
        <motion.div key={view} className="min-w-0" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: "easeOut" }}>
          {view === "home" && <HomeView me={me} {...common} />}
          {view === "mine" && <MineView {...common} />}
          {view === "waiting" && <WaitingRoomView />}
          {view === "companies" && <CompaniesView {...common} />}
          {view === "saved" && <SavedView {...common} goHome={() => changeView("home")} />}
          {view === "insights" && <InsightsView openCompany={setCompany} query={query} filters={filtersFromSearch(search)} onFilters={(f) => void navigate({ to: "/dashboard", search: { view: "insights", ...searchFromFilters(f) }, replace: true, resetScroll: false })} />}
          {view === "settings" && <SettingsView me={me} onLoggedOut={leave} onRequestLogout={() => setConfirmLogout(true)} />}
        </motion.div>
        {/* Wide screens only; on smaller ones Home shows the same cards as a swipeable strip. */}
        {/* Pinned below the top bar while the feed scrolls. If it's taller than the screen, it
            scrolls on its own (data-lenis-prevent lets the wheel reach it). */}
        {showRail && <div data-lenis-prevent className="hidden xl:sticky xl:top-[5.5rem] xl:block xl:max-h-[calc(100vh-6.5rem)] xl:self-start xl:overflow-x-hidden xl:overflow-y-auto xl:overscroll-contain xl:pb-2 xl:pr-2 no-scrollbar"><RightRail onOpenCompany={setCompany} /></div>}
      </div>
    </main>
    <ShareModal open={share} onOpenChange={setShare} />
    <ShareModal open={!!linkPreset} onOpenChange={(v) => { if (!v) setLinkPreset(null); }} preset={linkPreset} />
    <LogoutDialog open={confirmLogout} onOpenChange={setConfirmLogout} onConfirm={async () => { await logout(); setConfirmLogout(false); leave(); }} />
    {/* Every so often (never in your first days, backing off when dismissed), a one-tap check-in. */}
    <FeedbackPulse />
  </div>;
}
