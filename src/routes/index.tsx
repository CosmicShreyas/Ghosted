import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, EyeOff, Feather, PenLine, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { useLandingStats } from "@/lib/stats";
import { useAuthGuard } from "@/lib/session";
import { FoundingProgress } from "@/lib/founding";
import { organizationLd, pageHead, websiteLd } from "@/lib/meta";
import { api, apiEnabled } from "@/lib/api";
import { fromApi, isRated, useCompanyIndex, type StoryDto } from "@/lib/stories";
import { Preloader } from "@/components/preloader";
import { GhostOMeter } from "@/components/landing-games";
import { CompanySearch, LandingHero } from "@/components/landing-hero";
import { PrivacyDemo } from "@/components/privacy-demo";
import { WhyGhosted } from "@/components/why-ghosted";
import { LandingObjection } from "@/components/landing-objection";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { CompanyMark, StoryCard, StoryModelCard } from "@/components/ghosted";
import { companies, stories, type Stat } from "@/mock/data";

// The landing page, in the order a stranger needs it:
//   1. something useful right away: look a company up (no account), or add your own experience
//   2. the Ghost-o-meter, for people waiting on a reply right now, ending in a company search
//   3. real stories from real people (nothing seeded or made up), so there's proof before the ask
//   4. how it works, then the bigger picture for those who want it
export const Route = createFileRoute("/")({
  head: () => pageHead({
    title: "Ghosted | Interview experiences and company hiring reviews in India",
    description: "Know what happened before you apply. Real, anonymous candidate experiences searchable by company: interview rounds, waiting time, communication, rejections, offers and ghosting.",
    path: "/", jsonLd: [organizationLd, websiteLd],
  }),
  component: LandingPage,
});

const STEPS = [
  ["Search the company", "See how its hiring went for real candidates: the rounds, how long replies took, and how it ended."],
  ["Add your experience", "Tap a few answers about what happened. About 30 seconds, anonymous, no company email needed."],
  ["Help the next candidate", "Your experience feeds the company's Flag Score, so the next person knows what to expect."],
] as const;

function CountUp({ value, prefix = "", suffix = "" }: Stat) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (reduce) return setShown(value);
    const controls = animate(0, value, { duration: 1.8, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setShown(Math.round(v)) });
    return () => controls.stop();
  }, [inView, reduce, value]);
  return <span ref={ref} className="tabular-nums">{prefix}{shown.toLocaleString("en-IN")}{suffix}</span>;
}

// Only real numbers. Until there are stories, the strip isn't shown at all (no "fresh launch" note).
function StatsStrip() {
  const { stats, live } = useLandingStats();
  if (!live) return null;
  return <section className="border-b-2 border-foreground bg-primary text-primary-foreground"><div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-primary-foreground/30 md:grid-cols-4">{stats.map((stat) => <div key={stat.label} className="px-5 py-6 text-center"><p className="font-display text-3xl font-bold"><CountUp {...stat} /></p><p className="text-xs uppercase opacity-80">{stat.label}</p></div>)}</div></section>;
}

function LandingPage() {
  // Logged-in visitors go straight to their dashboard.
  const { waiting } = useAuthGuard("public-only");
  const { list, ready } = useCompanyIndex();
  const rated = list.filter(isRated).sort((a, b) => (b.storyCount ?? 0) - (a.storyCount ?? 0)).slice(0, 6);
  const shownCompanies = apiEnabled ? rated : companies.slice(0, 6);
  const wall = useQuery({ queryKey: ["landing-stories"], queryFn: async () => (await api<{ stories: StoryDto[] }>("/v1/stories?limit=6")).stories, enabled: apiEnabled && ready, staleTime: 60_000 });
  const wallStories = (wall.data ?? []).map((s) => fromApi(s, new Map(list.map((c) => [c.id, c]))));
  if (waiting) return <Preloader />;

  return <div className="min-h-screen overflow-hidden"><SiteHeader /><main>
    <LandingHero />
    <StatsStrip />

    <div id="ghost-o-meter" className="scroll-mt-20">
      <GhostOMeter />
      {/* After the tool: the natural next step is the company itself. */}
      <div className="mx-auto -mt-12 max-w-7xl px-4 pb-20 sm:px-6">
        <div className="rounded-xl border-2 border-foreground bg-accent p-5 shadow-hard-sm sm:p-6">
          <p className="flex items-center gap-2 font-display text-xl font-bold"><Search className="size-5" />See what other candidates experienced there</p>
          <p className="mt-1 text-sm text-muted-foreground">Look the company up. No account needed.</p>
          <CompanySearch size="md" className="mt-4 max-w-xl" />
        </div>
      </div>
    </div>

    <section id="stories" className="border-y-2 border-foreground bg-secondary py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="mb-2 text-sm font-bold text-primary">From candidates</p><h2 className="text-4xl font-bold sm:text-5xl">What candidates are saying</h2></div>
          <Button variant="outline" asChild><Link to="/auth" search={{ intent: "share" }}><PenLine />Add yours</Link></Button>
        </div>
        {apiEnabled
          ? wallStories.length ? <div className="mt-10 columns-1 gap-5 space-y-5 md:columns-2 lg:columns-3">{wallStories.map((story) => <StoryModelCard key={story.id} story={story} />)}</div>
            : <div className="mt-10 grid gap-5 rounded-xl border-2 border-foreground bg-card p-6 shadow-hard-sm sm:p-8 md:grid-cols-[1fr_auto] md:items-center">
                <div><p className="font-display text-2xl font-bold">{wall.isPending ? "Loading the latest experiences…" : "Be one of the first 50 voices."}</p>{!wall.isPending && <p className="mt-2 max-w-lg text-muted-foreground">The first 50 people to share an experience get a founding contributor badge, for good. It takes about 30 seconds.</p>}</div>
                {!wall.isPending && <div className="grid gap-3"><FoundingProgress compact /><Button asChild><Link to="/auth" search={{ intent: "share" }}><PenLine />Share my experience</Link></Button></div>}
              </div>
          : <div className="mt-10 columns-1 gap-5 space-y-5 md:columns-2 lg:columns-3">{stories.slice(0, 6).map((story) => <StoryCard key={story.id} story={story} />)}</div>}
      </div>
    </section>

    <section id="how" className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
      <p className="mb-2 text-sm font-bold text-primary">How it works</p>
      <h2 className="max-w-2xl text-4xl font-bold sm:text-5xl">Real information before you apply.</h2>
      <ol className="mt-10 grid gap-5 md:grid-cols-3">{STEPS.map(([title, copy], i) => <li key={title} className="rounded-xl border-2 border-foreground bg-card p-6 shadow-hard-sm">
        <span className="grid size-10 place-items-center rounded-full border-2 border-foreground bg-accent font-display text-lg font-bold">{i + 1}</span>
        <h3 className="mt-5 text-xl font-bold">{title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy}</p>
      </li>)}</ol>
    </section>

    {shownCompanies.length > 0 && <section id="companies" className="border-y-2 border-foreground bg-accent py-20"><div className="mx-auto max-w-7xl px-4 sm:px-6">
      <p className="mb-2 text-sm font-bold text-primary">Companies with experiences</p>
      <h2 className="text-4xl font-bold sm:text-5xl">Start with these.</h2>
      <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{shownCompanies.map((company) => <Link key={company.id} to="/c/$slug" params={{ slug: company.id }} className="card-lift flex items-center gap-3 rounded-xl border-2 border-foreground bg-card p-4 shadow-hard-sm">
        <CompanyMark company={company} />
        <div className="min-w-0 flex-1"><h3 className="truncate font-bold">{company.name}</h3><p className="text-sm text-muted-foreground">{company.storyCount ?? 0} {(company.storyCount ?? 0) === 1 ? "experience" : "experiences"}</p></div>
        <span className={`shrink-0 font-display text-2xl font-bold ${company.score >= 70 ? "text-flag-green" : company.score >= 40 ? "text-flag-amber" : "text-flag-red"}`}>{company.score}</span>
      </Link>)}</div>
    </div></section>}

    <section className="border-b-2 border-foreground bg-foreground text-background"><div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 md:grid-cols-2">
      <div><div className="mb-4 grid size-12 place-items-center rounded-xl border-2 border-background/50 bg-primary text-primary-foreground shadow-hard-sm"><EyeOff /></div>
        <h2 className="text-4xl font-bold">Anonymous by default.<br />Specific by choice.</h2>
        <p className="mt-4 max-w-lg leading-relaxed text-background/70">Only an anonymous handle shows on what you share. Every other detail has its own switch, and they all start off. Employers never see who you are, and they can't pay to change a score.</p></div>
      <PrivacyDemo />
    </div></section>

    {/* The bigger picture, for people who want to know why this exists. */}
    <WhyGhosted />
    <LandingObjection />

    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6"><div className="rounded-xl border-2 border-foreground bg-primary p-8 text-primary-foreground shadow-hard md:flex md:items-center md:justify-between md:gap-8 md:p-12">
      <div><Feather className="mb-5 size-8" /><h2 className="text-4xl font-bold">Your experience is the next candidate's heads-up.</h2><p className="mt-2 opacity-80">About 30 seconds. Anonymous. No company email.</p></div>
      <Button size="lg" variant="outline" className="mt-7 min-h-12 bg-background text-foreground md:mt-0" asChild><Link to="/auth" search={{ intent: "share" }}>Share my experience <ArrowRight /></Link></Button>
    </div></section>
  </main><SiteFooter /></div>;
}
