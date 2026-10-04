import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiEnabled } from "@/lib/api";
import { useLive } from "@/lib/live";
import { fromApi, isRated, OUTCOME_LABEL, sampleModels, samplePublicId, useCompanyIndex, type StoryDto, type StoryModel } from "@/lib/stories";
import { change, useInsights } from "@/lib/insights";
import { useCompanyList } from "@/lib/companies";
import { ListCompanyDialog } from "./list-company";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUpDown, Bookmark, ChevronRight, Flame, PenLine, Plus, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { Avatar, CompanyMark, FlagScore, ScoreMeters } from "@/components/ghosted";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { displayName, firstName, isPublic, useTone, type Me } from "@/lib/session";
import { cn, formatCount } from "@/lib/utils";
import { dashboardPrompts, type Company } from "@/mock/data";
import { card, FeedStory } from "./widgets";
import { RightRail } from "./global-widgets";
import { activeDot, axis, ChartTooltip, grid, lineCursor } from "./chart-kit";
import { useReachEnd, useStoryFeed } from "@/lib/feed";
import { useSearch } from "@/lib/search";
import { compact, useMyStats } from "@/lib/my-stats";
import { useDailyPrompt } from "@/lib/prompts";
import { SlidingPill, usePill } from "@/components/sliding-pill";
import { FoundingProgress } from "@/lib/founding";
import { BlockerCard, InviteCard, MissionsCard, Spotlight } from "./momentum";

// Two-series chart colours, validated for colour-blind separation and contrast (dataviz validator).
const SERIES = { ghosted: "var(--chart-violet)", offers: "var(--chart-cyan)" };

type Common = { query: string; saved: Set<string>; toggleSave: (id: string) => void; openCompany: (c: Company) => void; onShare: () => void };

const matches = (s: StoryModel, q: string) => {
  if (!q) return true;
  const hay = `${s.outcomeLabel} ${s.role ?? ""} ${s.title ?? ""} ${s.body} ${s.company.name} ${s.author.name}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
};

function SectionHead({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: React.ReactNode }) {
  // Wraps on small phones so an action (sort menu, button) drops below the title instead of overflowing.
  return <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div className="min-w-0">{eyebrow && <p className="text-xs font-bold uppercase text-primary">{eyebrow}</p>}<h2 className="text-2xl font-bold">{title}</h2></div>{action}</div>;
}

function Empty({ title, copy, action }: { title: string; copy: string; action?: React.ReactNode }) {
  return <div className="rounded-xl border-2 border-dashed border-foreground/40 p-10 text-center"><p className="font-display text-xl font-bold">{title}</p><p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{copy}</p>{action && <div className="mt-5">{action}</div>}</div>;
}

export function StoryList({ list, ...c }: Pick<Common, "saved" | "toggleSave" | "openCompany"> & { list: StoryModel[] }) {
  return <div className="space-y-4">{list.map((s) => <FeedStory key={s.id} story={s} saved={c.saved.has(s.id)} onSave={() => c.toggleSave(s.id)} onOpenCompany={c.openCompany} />)}</div>;
}

// ---------- home ----------

// Today's prompt lives in lib/prompts.ts (shared with the sidebar).

// Placeholder cards shaped like real stories, with a light wave sweeping across (see .skeleton).
function StorySkeletons({ count }: { count: number }) {
  return <div className="space-y-4" role="status" aria-label="Loading more stories">
    {Array.from({ length: count }, (_, i) => <div key={i} className={cn(card, "p-5")}>
      <div className="flex items-center gap-3"><div className="skeleton size-9 rounded-full" /><div className="flex-1 space-y-2"><div className="skeleton h-3 w-32" /><div className="skeleton h-2.5 w-48" /></div><div className="skeleton h-7 w-10 rounded-lg" /></div>
      <div className="skeleton mt-4 h-5 w-28 rounded-full" />
      <div className="mt-4 space-y-2"><div className="skeleton h-3 w-full" /><div className="skeleton h-3 w-[92%]" /><div className="skeleton h-3 w-[70%]" /></div>
      <div className="mt-5 flex gap-2"><div className="skeleton h-7 w-28 rounded-full" /><div className="skeleton h-7 w-28 rounded-full" /><div className="skeleton h-7 w-24 rounded-full" /></div>
    </div>)}
  </div>;
}

function EndOfFeed({ onShare }: { onShare: () => void }) {
  const tone = useTone();
  return <div className="rounded-xl border-2 border-dashed border-foreground/40 p-6 text-center">
    <img src="/ghosted-mark.png" alt="" className="mx-auto size-12 object-contain" />
    <p className="mt-2 font-display text-lg font-bold">{tone === "calm" ? "You're all caught up." : "You've read every receipt. For now."}</p>
    <p className="mt-1 text-sm text-muted-foreground">{tone === "calm" ? "Check back later for new stories." : "Got one of your own? The next candidate is waiting."}</p>
    <Button className="mt-4" onClick={onShare}><PenLine />Share a story</Button>
  </div>;
}

// Greetings by the viewer's local hour. `{name}` is replaced with their first name (or handle).
const GREETINGS: { from: number; to: number; lines: [string, string][] }[] = [
  { from: 0, to: 5, lines: [["Up late, {name}?", "The recruiters are asleep. Perfect time to spill."], ["Still awake, {name}?", "Refreshing your inbox won't make them reply faster."], ["Night owl mode, {name}.", "3 am thoughts make the best receipts."]] },
  { from: 5, to: 12, lines: [["Good morning, {name}.", "Fresh coffee, fresh receipts."], ["Morning, {name}.", "Somewhere, a recruiter is typing “quick sync?”. Not here."], ["Rise and shine, {name}.", "Today's a great day to get a reply. Probably."]] },
  { from: 12, to: 17, lines: [["Good afternoon, {name}.", "Post-lunch slump? Here's some tea."], ["Afternoon, {name}.", "Peak “let's circle back” hours. Stay strong."], ["Hey {name}, good afternoon.", "Halfway through the day, fully through the red flags."]] },
  { from: 17, to: 21, lines: [["Good evening, {name}.", "Logged off work, logged on to the truth."], ["Evening, {name}.", "HR's gone home. The receipts stayed."], ["Hey {name}, good evening.", "Perfect time to catch up on the latest receipts."]] },
  { from: 21, to: 24, lines: [["Burning the midnight oil, {name}?", "Just one more story. We know."], ["Late one tonight, {name}?", "The best stories get written after 9 pm."], ["Winding down, {name}?", "Read one story, then sleep. Deal?"]] },
];

// Picked after mount from the viewer's own clock, so it's their timezone (not the server's)
// and server and client HTML match. It refreshes on the hour if the tab stays open.
// Calm tone: plain greetings, one neutral subtitle per slot.
const CALM_GREETINGS: { from: number; to: number; line: [string, string] }[] = [
  { from: 0, to: 5, line: ["Hello, {name}.", "Here's what's new on Ghosted."] },
  { from: 5, to: 12, line: ["Good morning, {name}.", "Here's what's new on Ghosted."] },
  { from: 12, to: 17, line: ["Good afternoon, {name}.", "Here's what's new on Ghosted."] },
  { from: 17, to: 21, line: ["Good evening, {name}.", "Here's what's new on Ghosted."] },
  { from: 21, to: 24, line: ["Good evening, {name}.", "Here's what's new on Ghosted."] },
];

function Greeting({ me }: { me: Me }) {
  const tone = useTone();
  // Real first name only if you've gone public AND chosen to show your name; otherwise your handle.
  const first = firstName(me);
  const [pick, setPick] = useState<[string, string] | null>(null);
  useEffect(() => {
    const choose = () => {
      const h = new Date().getHours();
      if (tone === "calm") { setPick((CALM_GREETINGS.find((g) => h >= g.from && h < g.to) ?? CALM_GREETINGS[1]!).line); return; }
      const slot = GREETINGS.find((g) => h >= g.from && h < g.to) ?? GREETINGS[1]!;
      setPick(slot.lines[Math.floor(Math.random() * slot.lines.length)]!);
    };
    choose();
    const now = new Date();
    const toNextHour = (60 - now.getMinutes()) * 60_000 - now.getSeconds() * 1000;
    let hourly: number | undefined;
    const onTheHour = window.setTimeout(() => { choose(); hourly = window.setInterval(choose, 3_600_000); }, toNextHour);
    return () => { window.clearTimeout(onTheHour); if (hourly) window.clearInterval(hourly); };
  }, [tone]);
  // Until the clock is read, show a neutral line of the same size so nothing jumps.
  const [title, sub] = pick ?? ["Hello, {name}.", "Here's what's new on Ghosted."];
  return <>
    <motion.h1 key={title} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-1 text-3xl font-bold">{title.replace("{name}", first)}</motion.h1>
    <p className="mt-1 text-sm font-semibold">{sub}</p>
  </>;
}

const FILTERS = [
  { id: "all", label: "All", test: () => true },
  { id: "ghosted", label: "Ghosted", test: (s: StoryModel) => s.outcome === "ghosted" || s.outcome === "ghost_job" },
  { id: "offers", label: "Offer drama", test: (s: StoryModel) => s.outcome === "offer" || s.outcome === "offer_revoked" || /lowball/i.test(s.outcomeLabel) },
  { id: "green", label: "Green flags", test: (s: StoryModel) => s.company.score >= 70 },
  { id: "red", label: "Red flags", test: (s: StoryModel) => s.company.score < 40 },
] as const;

export function HomeView({ me, ...c }: Common & { me: Me }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const prompt = useDailyPrompt();
  const test = FILTERS.find((f) => f.id === filter)!.test;
  const keep = useCallback((s: StoryModel) => test(s) && matches(s, c.query), [test, c.query]);
  const source = useMemo(() => sampleModels().filter(keep), [keep]);
  // For you: ranked by the recommendation algorithm (follows, followed companies, new voices,
  // freshness, variety). Latest: plain newest first. Remembered on this device.
  const [mode, setMode] = useState<"for_you" | "latest">(() => { try { return localStorage.getItem("ghosted.feedMode") === "latest" ? "latest" : "for_you"; } catch { return "for_you"; } });
  const pickMode = (m: typeof mode) => { setMode(m); try { localStorage.setItem("ghosted.feedMode", m); } catch { /* storage blocked */ } };
  const search = useSearch(c.query);
  // With the API, a search is answered by the server's search algorithm; the feed stays unfiltered.
  const feedFilter = useCallback((s: StoryModel) => test(s) && (search.active || matches(s, c.query)), [test, c.query, search.active]);
  const feed = useStoryFeed({ sample: source, signature: `${filter}|${mode}|${search.active ? "" : c.query}`, filter: feedFilter, params: `&sort=${mode}` });
  const empty = apiEnabled ? !feed.loadingFirst && !feed.items.length && !feed.hasMore : !source.length;
  const sentinel = useReachEnd(feed.loadMore, feed.hasMore);
  const { list: companyList } = useCompanyIndex();
  const trending = companyList.filter(isRated).sort((a, b) => b.score - a.score).slice(0, 3);
  const mine = useMyStats();
  const filterPill = usePill(filter);

  return <div className="space-y-8">
    <section className="grid gap-4 rounded-xl border-2 border-foreground bg-accent p-4 shadow-hard-sm sm:p-6 md:grid-cols-[1fr_auto] md:items-center">
      <div>
        <p className="text-sm font-bold uppercase text-primary">{isPublic(me) ? "Your public corner" : "Your private corner"}</p>
        <Greeting me={me} />
        <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">{isPublic(me) ? <><UserRound className="size-4 text-flag-amber" />Your profile is public. Only the details you chose are shown.</> : <><ShieldCheck className="size-4 text-flag-green" />Your identity is hidden. Your impact isn't.</>}</p>
      </div>
      <div className="grid grid-cols-3 gap-3 rounded-lg border-2 border-foreground bg-card p-4 text-center">
        {mine.loading || !mine.stats
          ? [0, 1, 2].map((i) => <div key={i} className="flex flex-col items-center gap-1.5"><div className="skeleton h-7 w-10 rounded" /><div className="skeleton h-3 w-16 rounded" /></div>)
          : ([[compact(mine.stats.stories), mine.stats.stories === 1 ? "Story" : "Stories", null], [compact(mine.stats.peopleHelped), mine.stats.peopleHelped === 1 ? "Person helped" : "People helped", null],
            [String(mine.stats.streak), "Day streak", mine.stats.streak > 0 && !mine.stats.activeToday ? "Do something today to keep it" : null]] as const).map(([n, l, hint]) =>
            <div key={l} title={hint ?? undefined}><strong className="font-display text-2xl tabular-nums">{n}</strong><p className="text-xs text-muted-foreground">{l}</p>{hint && <p className="mt-0.5 text-[10px] font-semibold text-flag-amber">keep it going today</p>}</div>)}
      </div>
    </section>

    <FoundingProgress />
    <BlockerCard />
    <MissionsCard onShare={c.onShare} />
    <InviteCard />
    <Spotlight />

    {/* Desktop only: on phones/tablets the prompt gets cut off, and the top bar's Share button does the same job. */}
    <button type="button" onClick={c.onShare} className={cn(card, "hidden w-full items-center gap-4 p-4 text-left transition-transform hover:-translate-y-0.5 lg:flex")}>
      <Avatar seed={me.avatarSeed} pastel={me.pastel} size="sm" label={displayName(me)} />
      <div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase text-primary"><Sparkles className="mr-1 inline size-3.5" />Today's prompt</p><p className="truncate font-semibold">{prompt}</p></div>
      <span className="hidden items-center gap-1 rounded-lg border-2 border-foreground bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground sm:inline-flex"><PenLine className="size-4" />Write</span>
    </button>

    {!c.query && trending.length > 0 && <section>
      <SectionHead eyebrow="Moving up and down" title="Trending companies" />
      <div className="grid gap-4 md:grid-cols-3">{trending.map((co) => <button key={co.id} type="button" onClick={() => c.openCompany(co)} className="card-lift rounded-xl border-2 border-foreground bg-card p-4 text-left shadow-hard-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <div className="flex items-center justify-between"><CompanyMark company={co} size="sm" /><FlagScore score={co.score} compact /></div>
        <h3 className="mt-3 font-bold">{co.name}</h3><p className="mb-4 truncate text-xs text-muted-foreground">{co.summary}</p><ScoreMeters company={co} />
      </button>)}</div>
    </section>}

    {/* Phones/tablets: the right-hand widgets as a swipeable strip here, not after every story. */}
    {!c.query && <section className="xl:hidden">
      <SectionHead eyebrow="Swipe for more" title="At a glance" />
      <RightRail onOpenCompany={c.openCompany} layout="strip" />
    </section>}

    {search.active ? <SearchResults {...c} search={search} /> : <section>
      <SectionHead title={c.query ? `Results for “${c.query}”` : !apiEnabled ? "Fresh stories" : mode === "for_you" ? "For you" : "Latest stories"} action={apiEnabled && !c.query ? <div className="relative grid grid-cols-2 rounded-full border-2 border-foreground bg-card p-0.5 text-xs font-bold" role="tablist" aria-label="Feed order">
        {/* One pill that slides between the halves (no shared-layout jump). */}
        <motion.span aria-hidden="true" className="absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-full bg-primary" initial={false} animate={{ x: mode === "for_you" ? "0%" : "100%" }} transition={{ type: "spring", stiffness: 420, damping: 34 }} />
        {(["for_you", "latest"] as const).map((m) => <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => pickMode(m)} className={cn("relative rounded-full px-3 py-1 transition-colors", mode === m ? "text-primary-foreground" : "")}>
          <span className="relative">{m === "for_you" ? "For you" : "Latest"}</span>
        </button>)}
      </div> : !apiEnabled && <span className="text-xs font-semibold text-muted-foreground">{source.length} {source.length === 1 ? "story" : "stories"}</span>} />
      <div ref={filterPill.ref} className="relative mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Filter stories">
        <SlidingPill pill={filterPill} className="rounded-full bg-primary" />
        {FILTERS.map((f) => <button key={f.id} data-pill={f.id} type="button" role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)} className={cn("relative rounded-full border-2 border-foreground px-3 py-1 text-xs font-bold transition-colors", filter === f.id ? "text-primary-foreground" : "bg-card hover:bg-muted")}>
          <span className="relative">{f.label}</span>
        </button>)}
      </div>
      {empty ? <Empty title="Nothing matches. Yet." copy="Try another filter or search term, or be the first to tell this story." action={<Button onClick={c.onShare}><PenLine />Share a story</Button>} />
        : <div className="space-y-4">
          {feed.items.map(({ key, story }) => <FeedStory key={key} story={story} saved={c.saved.has(story.id)} onSave={() => c.toggleSave(story.id)} onOpenCompany={c.openCompany} />)}
          {(feed.loadingFirst || feed.loadingMore) && <StorySkeletons count={feed.loadingFirst ? 3 : 2} />}
          {/* Reaching this marker (600 px early) loads the next page, so scrolling never stalls. */}
          <div ref={sentinel} aria-hidden="true" />
          {!feed.hasMore && !feed.loadingFirst && <EndOfFeed onShare={c.onShare} />}
        </div>}
    </section>}
  </div>;
}

// Server search results: matching companies first, then stories ranked by relevance.
function SearchResults({ search, query, ...c }: Common & { search: ReturnType<typeof useSearch> }) {
  const d = search.data;
  const u = d?.understood;
  const understood = u ? [u.company && `company: ${u.company}`, u.outcome && `outcome: ${OUTCOME_LABEL[u.outcome] ?? u.outcome}`, u.stage && `round: ${u.stage}`, ...u.phrases.map((p) => `“${p}”`), ...u.exclude.map((x) => `without “${x}”`)].filter(Boolean) : [];
  return <section className={cn("space-y-4 transition-opacity", search.refreshing && "opacity-60")}>
    <SectionHead title={`Results for “${query.trim()}”`} />
    {understood.length > 0 && <p className="-mt-2 text-xs text-muted-foreground">Searching {understood.join(" · ")}</p>}
    {search.loading || !d ? <StorySkeletons count={3} /> : <>
      {d.companies.length > 0 && <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">{d.companies.map((co) => <button key={co.id} type="button" onClick={() => c.openCompany(co)} className={cn(card, "flex shrink-0 items-center gap-3 p-3 pr-4 text-left transition-transform hover:-translate-y-0.5")}>
        <CompanyMark company={co} size="sm" /><span><span className="block font-bold">{co.name}</span><span className="text-xs text-muted-foreground">{co.storyCount ? `${formatCount(co.storyCount)} ${co.storyCount === 1 ? "story" : "stories"}` : "No stories yet"}</span></span>{isRated(co) && <FlagScore score={co.score} compact />}
      </button>)}</div>}
      {d.stories.length ? <div className="space-y-4">{d.stories.map((s) => <FeedStory key={s.id} story={s} saved={c.saved.has(s.id)} onSave={() => c.toggleSave(s.id)} onOpenCompany={c.openCompany} />)}</div>
        : <Empty title="No stories match" copy="Try fewer words, or search a company name. Tips: “exact phrase”, company:acme, outcome:ghosted, -word to exclude." action={<Button onClick={c.onShare}><PenLine />Share a story</Button>} />}
    </>}
  </section>;
}

// ---------- my stories ----------

export function MineView(c: Common) {
  const qc = useQueryClient();
  const { index } = useCompanyIndex();
  // Your stories from the API (refreshed live when you post from another device); in the preview,
  // the first sample person stands in for you.
  const q = useQuery({
    queryKey: ["my-stories"],
    queryFn: async () => (await api<{ stories: StoryDto[] }>("/v1/me/stories")).stories,
    enabled: apiEnabled,
  });
  useLive("stories", () => void qc.invalidateQueries({ queryKey: ["my-stories"] }));
  const all = apiEnabled ? (q.data ?? []).map((s) => fromApi(s, index)) : sampleModels().filter((s) => s.author.publicId === samplePublicId("u1"));
  const mine = all.filter((s) => matches(s, c.query));
  const helped = mine.reduce((n, s) => n + s.relatable, 0);
  if (apiEnabled && q.isPending) return <div className="space-y-6"><SectionHead eyebrow="Your receipts" title="My stories" /><StorySkeletons count={2} /></div>;
  return <div className="space-y-6">
    <SectionHead eyebrow="Your receipts" title="My stories" action={<Button onClick={c.onShare}><PenLine />New story</Button>} />
    <div className="grid gap-4 sm:grid-cols-3">{[["Stories shared", formatCount(mine.length)], ["People who related", formatCount(helped)], ["Red flags raised", formatCount(mine.reduce((n, s) => n + s.flags, 0))]].map(([l, n]) => <div key={l} className={cn(card, "p-4")}><p className="text-xs font-bold uppercase text-muted-foreground">{l}</p><p className="mt-1 font-display text-3xl font-bold">{n}</p></div>)}</div>
    {mine.length ? <StoryList list={mine} {...c} /> : <Empty title="No stories yet" copy="Your first story could save someone six rounds and a surprise take-home." action={<Button onClick={c.onShare}><PenLine />Share your first story</Button>} />}
  </div>;
}

// ---------- companies ----------

const SORTS = { best: "Best rated", worst: "Most warned about", stories: "Most stories", az: "A to Z" } as const;

// Placeholder company cards with the same loading wave as the feed.
function CompanySkeletons({ count }: { count: number }) {
  return <>{Array.from({ length: count }, (_, i) => <div key={i} className="rounded-xl border-2 border-foreground/15 bg-card p-5" aria-hidden="true">
    <div className="flex items-center gap-3"><div className="skeleton size-12 rounded-lg" /><div className="flex-1 space-y-2"><div className="skeleton h-4 w-2/3 rounded" /><div className="skeleton h-3 w-1/3 rounded" /></div><div className="skeleton size-14 rounded-full" /></div>
    <div className="mt-4 space-y-2"><div className="skeleton h-3 w-full rounded" /><div className="skeleton h-3 w-4/5 rounded" /></div>
    <div className="mt-4 grid grid-cols-5 gap-2">{[0, 1, 2, 3, 4].map((j) => <div key={j} className="skeleton h-1.5 rounded-full" />)}</div>
  </div>)}</>;
}

export function CompaniesView(c: Common) {
  const [sort, setSort] = useState<keyof typeof SORTS>("best");
  const [listing, setListing] = useState(false);
  // Endless list, paged from the server (sorted and searched there), refreshed live.
  const companies = useCompanyList(sort, c.query.trim());
  const sentinel = useReachEnd(companies.loadMore, companies.hasMore);
  // Companies with stories come first; within each group the server's order is kept.
  const list = [...companies.items].sort((a, b) => Number((b.storyCount ?? 1) > 0) - Number((a.storyCount ?? 1) > 0));
  const sampleCount = (id: string) => sampleModels().filter((s) => s.company.id === id).length;

  return <div className="space-y-6">
    <SectionHead eyebrow="The Hall of Flags" title="Companies" action={<div className="flex flex-wrap items-center gap-2">
      <Select value={sort} onValueChange={(v) => setSort(v as keyof typeof SORTS)}>
        <SelectTrigger aria-label="Sort companies" className="h-10 w-auto min-w-48 bg-card [&>span]:!flex [&>span]:items-center [&>span]:gap-2"><span><ArrowUpDown className="size-4 shrink-0" /><SelectValue /></span></SelectTrigger>
        <SelectContent align="end">{Object.entries(SORTS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
      </Select>
      <Button onClick={() => setListing(true)}><Plus />List a company</Button>
    </div>} />
    <Spotlight />
    {companies.loadingFirst ? <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3"><CompanySkeletons count={6} /></div> : list.length ? <><div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{list.map((co) => {
      const count = co.storyCount ?? sampleCount(co.id);
      const rated = isRated(co);
      return <button key={co.id} type="button" onClick={() => c.openCompany(co)} className="card-lift flex flex-col rounded-xl border-2 border-foreground bg-card p-5 text-left shadow-hard-sm">
        <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><CompanyMark company={co} /><div className="min-w-0"><h3 className="truncate font-bold">{co.name}</h3><p className="truncate text-xs text-muted-foreground">{formatCount(count)} {count === 1 ? "story" : "stories"}{co.salary[1] > 0 ? ` · ₹${co.salary[0]}–${co.salary[1]} LPA` : co.domain ? ` · ${co.domain}` : ""}</p></div></div>
          {rated ? <FlagScore score={co.score} compact /> : <span className="shrink-0 rounded-full border-2 border-foreground bg-accent px-2.5 py-0.5 text-[11px] font-bold uppercase">New</span>}</div>
        <p className="mt-3 line-clamp-3 text-sm">{co.summary || co.about}</p>
        {rated && <div className="mt-4"><ScoreMeters company={co} /></div>}
        {co.badges.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{co.badges.map((b) => <span key={b} className="rounded-full border border-foreground px-2 py-0.5 text-[11px] font-bold">{b}</span>)}</div>}
        <span className="mt-auto inline-flex items-center gap-1 pt-4 text-xs font-bold text-primary">{rated ? "See company page" : "Be the first to share"} <ChevronRight className="size-3.5" /></span>
      </button>;
    })}{companies.loadingMore && <CompanySkeletons count={3} />}</div>
      {/* Reaching this marker (600 px early) loads the next page. */}
      <div ref={sentinel} aria-hidden="true" />
      {!companies.hasMore && list.length > 6 && <p className="text-center text-sm text-muted-foreground">That's every company so far. Missing one? <button type="button" onClick={() => setListing(true)} className="font-bold text-primary hover:underline">List it</button></p>}
    </> : <Empty title={c.query ? "Not listed yet? Request it" : "No companies yet"} copy={c.query ? `No company called “${c.query}” yet. Add its website and we'll fill in the rest.` : "Be the first to list one. It takes a minute."} action={<Button onClick={() => setListing(true)}><Plus />{c.query ? `Request “${c.query}”` : "List a company"}</Button>} />}
    <ListCompanyDialog open={listing} onOpenChange={setListing} onListed={(co) => c.openCompany(co)} {...(c.query && list.length === 0 && { requestName: c.query })} />
  </div>;
}

// ---------- saved ----------

export function SavedView(c: Common & { goHome: () => void }) {
  const { index } = useCompanyIndex();
  // Saved ids live in this browser; with the API each one is fetched (removed stories drop out).
  const ids = [...c.saved];
  const results = useQueries({ queries: ids.map((id) => ({
    queryKey: ["story", id],
    queryFn: async () => (await api<{ story: StoryDto }>(`/v1/stories/${id}`)).story,
    enabled: apiEnabled && /^\d{15}$/.test(id),
    retry: false,
    staleTime: 60_000,
  })) });
  const fetched = results.map((r) => r.data).filter((s): s is StoryDto => !!s).map((s) => fromApi(s, index));
  const list = (apiEnabled ? fetched : sampleModels().filter((s) => c.saved.has(s.id))).filter((s) => matches(s, c.query));
  return <div className="space-y-6">
    <SectionHead eyebrow="Receipts for later" title="Saved" />
    {list.length ? <StoryList list={list} {...c} /> : <Empty title="Nothing saved yet" copy="Tap the bookmark on any story to keep it for your next interview prep." action={<Button variant="outline" onClick={c.goHome}><Bookmark />Browse the feed</Button>} />}
  </div>;
}

