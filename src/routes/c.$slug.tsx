import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, BadgeCheck, BellOff, BellRing, FileWarning, Loader2, PenLine, Users } from "lucide-react";
import { toast } from "sonner";
import { Sidebar, Topbar, type View } from "@/components/dashboard/shell";
import { FeedStory } from "@/components/dashboard/widgets";
import { ShareModal } from "@/components/dashboard/share-story";
import { CompanyActions, CompanyHeader, CompanyRail, ReportCompanyDialog, WhatPeopleSay } from "@/components/dashboard/company-page";
import { LogoutDialog } from "@/components/dashboard/confirm-dialogs";
import { Preloader } from "@/components/preloader";
import { PublicShell } from "@/components/public-shell";
import { breadcrumbLd, ogImage, pageHead, SITE_URL } from "@/lib/meta";
import { api, apiEnabled, askToJoin } from "@/lib/api";
import { CompanyMark } from "@/components/ghosted";
import { BackButton } from "@/components/back-button";
import { SlidingPill, usePill } from "@/components/sliding-pill";
import { Button } from "@/components/ui/button";
import { useCompanyPage, type CompanyInterest } from "@/lib/companies";
import { useReachEnd, useStoryFeed } from "@/lib/feed";
import { useSaved } from "@/lib/saved";
import { useAccountActions, useAuthGuard, useMe, useTone, voice } from "@/lib/session";
import { cn } from "@/lib/utils";
import type { Company } from "@/mock/data";
import { GameBreak } from "@/components/game-break";
import { PillSelect } from "@/components/pill-select";
import { AskCandidates, ContentRequestDialog, RepReplySlot, RepVerifyDialog } from "@/components/company-voice";

// A company's page, addressed by its slug. Same layout as people pages: header, what people say,
// stories (filterable), and the stats rail.
export const Route = createFileRoute("/c/$slug")({
  // The company's name and story count, so search results and link previews name the company.
  // Best effort: if the API is slow or down, the page falls back to a generic title.
  loader: async ({ params }) => {
    if (!apiEnabled) return null;
    try { const r = await api<{ company: { name: string; storyCount: number; flagScore: number | null; about?: string | null; hqCity?: string | null } }>(`/v1/companies/${params.slug}`, { timeoutMs: 3000 }); return r.company; }
    catch { return null; }
  },
  head: ({ params, loaderData }) => {
    const c = loaderData;
    const path = `/c/${params.slug}`;
    const image = ogImage.company(params.slug);
    if (!c) return pageHead({ title: "Company hiring experiences | Ghosted", description: "Interview rounds, waiting time, communication and outcomes from candidates who applied here, shared anonymously on Ghosted.", path, image });
    const n = c.storyCount;
    const title = `${c.name} hiring experiences, interview process and Flag Score | Ghosted`;
    const description = n
      ? `${n} anonymous ${n === 1 ? "candidate experience" : "candidate experiences"} of ${c.name}'s hiring: interview rounds, how long replies took, communication, rejections, offers and ghosting.${c.flagScore != null ? ` Flag Score ${c.flagScore}/100.` : ""}`
      : `Interviewed at ${c.name}? Be the first to share how their hiring went, anonymously, and help the next candidate know what to expect.`;
    return pageHead({
      title, description, path, image,
      // Empty company pages are thin content: kept out of the index until someone shares a story.
      noindex: n === 0,
      jsonLd: [
        breadcrumbLd([{ name: "Ghosted", path: "/" }, { name: c.name, path }]),
        { "@context": "https://schema.org", "@type": "WebPage", name: title, description, url: `${SITE_URL}${path}`, isPartOf: { "@id": `${SITE_URL}/#website` }, about: { "@type": "Organization", name: c.name, ...(c.hqCity && { address: { "@type": "PostalAddress", addressLocality: c.hqCity, addressCountry: "IN" } }) } },
      ],
    });
  },
  component: CompanyPageRoute,
});

const FILTERS = [{ id: "all", label: "All stories" }, { id: "positive", label: "Positive" }, { id: "critical", label: "Critical" }] as const;
type Filter = (typeof FILTERS)[number]["id"];
const STAGE_FILTERS = [["application", "Application"], ["screening", "Recruiter call"], ["technical", "Technical"], ["final", "Final round"], ["offer", "Offer"]] as const;
// Sample stories have no ratings; approximate sentiment from how they ended.
const sampleSentiment = (outcome: string) => (outcome === "offer" ? "positive" : outcome === "rejected" ? "mixed" : "critical");

// "I want to know about this company": for pages with no stories. The count is social proof for
// whoever's thinking of sharing; everyone who taps gets one email when the first story lands.
function AskCommunity({ name, interest, onToggle }: { name: string; interest: CompanyInterest | undefined; onToggle: (on: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const waiting = interest?.waiting ?? 0;
  const mine = !!interest?.mine;
  const others = waiting - (mine ? 1 : 0);
  const run = async () => { setBusy(true); try { await onToggle(!mine); } finally { setBusy(false); } };
  return <div className="mx-auto mt-6 max-w-md border-t-2 border-dashed border-foreground/25 pt-5">
    <p className="flex items-center justify-center gap-2 text-sm font-bold"><Users className="size-4" />
      {waiting === 0 ? `Nobody has asked about ${name} yet.` : mine ? (others > 0 ? `You and ${others} ${others === 1 ? "other person are" : "others are"} waiting for a ${name} story.` : `You're waiting for the first ${name} story.`) : `${waiting} ${waiting === 1 ? "person is" : "people are"} waiting for a ${name} story.`}
    </p>
    <Button variant={mine ? "outline" : "default"} className="mt-3 min-h-11" disabled={busy} onClick={() => void run()}>
      {busy ? <Loader2 className="animate-spin" /> : mine ? <BellOff /> : <BellRing />}{mine ? "Stop waiting" : `I want to know about ${name}`}
    </Button>
    <p className="mt-2 text-xs text-muted-foreground">{mine ? "We'll email you once, when the first story is published." : "Tap it and we'll email you once, when someone shares their experience."}</p>
  </div>;
}

function CompanyPageRoute() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const tone = useTone();
  const { me } = useMe();
  const { waiting, signedOut } = useAuthGuard("optional");
  const { logout } = useAccountActions();
  const hook = useCompanyPage(slug);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const filterPill = usePill(filter);
  const [stage, setStage] = useState<"" | (typeof STAGE_FILTERS)[number][0]>("");
  const [since, setSince] = useState<"" | "90d" | "1y">("");
  const [share, setShare] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [saved, toggleSave] = useSaved();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const page = hook.page;

  const matches = (text: string) => !query || text.toLowerCase().includes(query.toLowerCase());
  const feed = useStoryFeed({
    sample: (page?.stories ?? []).filter((s) => filter === "all" || sampleSentiment(s.outcome) === filter),
    signature: `${slug}|${filter}|${query}|${stage}|${since}`,
    filter: (s) => matches(`${s.title ?? ""} ${s.body} ${s.role ?? ""}`),
    path: `/v1/companies/${slug}/stories`, params: `&sentiment=${filter}${stage ? `&stage=${stage}` : ""}${since ? `&since=${since}` : ""}`, topic: `company:${slug}`,
  });
  const sentinel = useReachEnd(feed.loadMore, feed.hasMore);
  const goView = (v: View) => navigate({ to: "/dashboard", search: { view: v } });
  const openCompany = (c: Company) => navigate({ to: "/c/$slug", params: { slug: c.id } });

  if (waiting || hook.loading) return <Preloader />;
  // Signed out: sharing needs an account, so it opens the join prompt instead.
  const startShare = () => (signedOut ? askToJoin() : setShare(true));

  const shell = (body: React.ReactNode) => signedOut ? <PublicShell>{body}</PublicShell> : <div className="min-h-screen bg-background lg:pl-60">
    <Sidebar view={null} onChange={goView} me={me} savedCount={saved.size} />
    <Topbar query={query} onQuery={setQuery} onShare={() => setShare(true)} me={me} view={null} onChange={goView} onLogout={() => setConfirmLogout(true)} savedCount={saved.size} />
    <main className="mx-auto max-w-[1500px] p-4 pb-28 sm:p-6 sm:pb-28 lg:pb-6">{body}</main>
    {/* "Share a story" from a company page starts with the company already picked. */}
    <ShareModal open={share} onOpenChange={setShare} presetCompany={page?.company.id ?? null} />
    <LogoutDialog open={confirmLogout} onOpenChange={setConfirmLogout} onConfirm={async () => { await logout(); setConfirmLogout(false); navigate({ to: "/auth" }); }} />
  </div>;

  if (hook.notFound || hook.error || !page) return shell(<div className="mx-auto max-w-lg rounded-xl border-2 border-dashed border-foreground/40 p-10 text-center">
    <p className="font-display text-xl font-bold">{hook.error ? "Couldn't load this company" : "No company here"}</p>
    <p className="mt-2 text-sm text-muted-foreground">{hook.error ? "Check your connection and try again." : voice(tone, "Either it was never listed, or it ghosted us too.", "This company isn't listed.")}</p>
    <Button className="mt-5" variant="outline" asChild><Link to="/dashboard" search={{ view: "companies" }}><ArrowLeft />All companies</Link></Button>
  </div>);

  const list = feed.items.map((i) => i.story);
  const name = page.company.name;

  return shell(<div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
    <div className="min-w-0 space-y-6">
      <BackButton fallback={{ to: "/dashboard", search: { view: "companies" } }} />
      <CompanyHeader page={page} actions={<CompanyActions page={page} hook={hook} onShare={startShare} onReport={() => (signedOut ? askToJoin() : setReporting(true))} />} />
      <WhatPeopleSay stats={page.stats} />

      {/* Right of Reply: the company's one official page reply (or, for a verified rep, the box to
          write it), and the two fair routes: get verified, or ask for a correction. */}
      <RepReplySlot slug={slug} companyName={name} />
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <button type="button" onClick={() => (signedOut ? askToJoin() : setVerifying(true))} className="inline-flex items-center gap-1 font-bold hover:text-foreground hover:underline"><BadgeCheck className="size-3.5" />Work at {name}? Reply as the company, free</button>
        <button type="button" onClick={() => setRequesting(true)} className="inline-flex items-center gap-1 font-bold hover:text-foreground hover:underline"><FileWarning className="size-3.5" />Something wrong? Request a correction</button>
      </p>

      <AskCandidates slug={slug} name={name} />

      {/* Phones/tablets: the stats as a swipeable strip (desktop shows them on the right). */}
      <section className="xl:hidden"><p className="mb-3 text-xs font-bold uppercase text-primary">Swipe for the numbers</p><CompanyRail page={page} layout="strip" /></section>

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs font-bold uppercase text-primary">The receipts</p><h2 className="text-2xl font-bold">{query ? `Results for “${query}”` : `Stories about ${name}`}</h2></div>
          <div ref={filterPill.ref} className="relative flex flex-wrap gap-2" role="tablist" aria-label="Filter stories">
            <SlidingPill pill={filterPill} className="rounded-full bg-primary" />
            {FILTERS.map((f) => <button key={f.id} data-pill={f.id} type="button" role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)} className={cn("relative rounded-full border-2 border-foreground px-3 py-1 text-xs font-bold transition-colors", filter === f.id ? "text-primary-foreground" : "bg-card hover:bg-muted")}>
              <span className="relative">{f.label}</span>
            </button>)}
          </div>
        </div>
        <div className="-mt-1 mb-4 flex flex-wrap gap-2">
          <PillSelect label="Round" value={stage} onChange={setStage} options={[{ id: "", label: "Every round" }, ...STAGE_FILTERS.map(([id, label]) => ({ id, label }))]} />
          <PillSelect label="When" value={since} onChange={setSince} options={[{ id: "", label: "Any time" }, { id: "90d", label: "Last 3 months" }, { id: "1y", label: "Last year" }]} />
          {(stage || since) && <button type="button" onClick={() => { setStage(""); setSince(""); }} className="h-9 rounded-full px-3 text-xs font-bold text-primary hover:underline">Clear</button>}
        </div>
        {list.length === 0 && !feed.loadingFirst
          ? <div className={cn("rounded-xl border-2 p-8 text-center", filter === "all" ? "border-foreground bg-accent shadow-hard-sm" : "border-dashed border-foreground/40")}>
              {filter === "all" && <div className="mb-3 flex justify-center"><CompanyMark company={page.company} /></div>}
              <p className="font-display text-xl font-bold">{filter === "all" ? voice(tone, `Be the first voice on ${name}.`, `No stories about ${name} yet.`) : `No ${filter} stories yet.`}</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{voice(tone, `Interviewed at ${name}? Your story could save someone six rounds.`, `Interviewed at ${name}? Share how it went.`)}</p>
              <Button className="mt-5" onClick={startShare}><PenLine />Share a story about {name}</Button>
              {filter === "all" && page.stats.stories === 0 && <AskCommunity name={name} interest={page.interest} onToggle={async (on) => { if (signedOut) return askToJoin(); try { await hook.setInterest(on); toast.success(on ? `We'll email you when the first ${name} story lands.` : "Okay, we won't email you."); } catch { toast.error("Couldn't save that. Try again."); } }} />}
              {filter === "all" && page.stats.stories === 0 && <GameBreak className="mx-auto mt-6 max-w-xl" line={voice(tone, `Waiting on the first ${name} story? Blast some ghosts.`, "Waiting for the first story? Play a quick game.")} />}
            </div>
          : <div className="space-y-4">
              {list.map((s) => <FeedStory key={s.id} story={s} saved={saved.has(s.id)} onSave={() => toggleSave(s.id)} onOpenCompany={openCompany} />)}
              {(feed.loadingFirst || feed.loadingMore) && <div className="space-y-4" aria-busy="true">{[0, 1].map((i) => <div key={i} className="skeleton h-40 rounded-xl border-2 border-foreground/20" />)}</div>}
              <div ref={sentinel} aria-hidden="true" />
            </div>}
      </section>
    </div>
    <div data-lenis-prevent className="hidden xl:sticky xl:top-[5.5rem] xl:block xl:max-h-[calc(100vh-6.5rem)] xl:self-start xl:overflow-y-auto xl:overflow-x-hidden xl:overscroll-contain xl:pb-2 xl:pr-2 no-scrollbar"><CompanyRail page={page} /></div>
    <ReportCompanyDialog open={reporting} onOpenChange={setReporting} name={name} onSubmit={hook.report} />
    <RepVerifyDialog open={verifying} onOpenChange={setVerifying} slug={slug} name={name} />
    <ContentRequestDialog open={requesting} onOpenChange={setRequesting} targetUrl={typeof window === "undefined" ? "" : window.location.href} />
  </div>);
}
