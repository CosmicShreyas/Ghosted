import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, EyeOff, Feather, Hourglass, PenLine, Search, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { animate, motion, useInView, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { useLandingStats } from "@/lib/stats";
import { useAuthGuard } from "@/lib/session";
import { FlairRing } from "@/lib/invite";
import { organizationLd, pageHead, websiteLd } from "@/lib/meta";
import { api, apiEnabled, track } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useLanding } from "@/content/landing-copy";
import { fromApi, isRated, useCompanyIndex, type StoryDto } from "@/lib/stories";
import { Preloader } from "@/components/preloader";
import { GhostOMeter, HiringMinefield } from "@/components/landing-games";
import { CompanySearch } from "@/components/landing-hero";
import { LandingTools } from "@/components/landing-tools";
import { PrivacyDemo } from "@/components/privacy-demo";
import { WhyGhosted } from "@/components/why-ghosted";
import { LandingPitch } from "@/components/landing-pitch";
import { LandingObjection } from "@/components/landing-objection";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Avatar, CompanyMark, FlagScore, StoryCard, StoryModelCard } from "@/components/ghosted";
import { companies, getUser, heroScene, stories, type Stat } from "@/mock/data";

// The original landing page, with a search-first hero: a visitor can look a company up (no account)
// before being asked for anything, and every "share" button leads straight into a first story.
export const Route = createFileRoute("/")({
  head: () => pageHead({
    title: "Ghosted | Interview experiences and company hiring reviews in India",
    description: "Know what happened before you apply. Real, anonymous candidate experiences searchable by company: interview rounds, waiting time, communication, rejections, offers and ghosting.",
    path: "/", jsonLd: [organizationLd, websiteLd],
  }),
  component: LandingPage,
});

// Starts with the first line already written (so the headline is readable instantly, even before
// JavaScript loads), holds it, then deletes and types the next one.
// Typed by whole characters as people see them (Hindi and Kannada vowel signs stay attached).
const graphemes = (s: string) => {
  try { return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s)].map((g) => g.segment); } catch { return [...s]; }
};
function RetypingLine() {
  const lines = useLanding().rotating;
  const [lineIndex, setLineIndex] = useState(0);
  const [count, setCount] = useState(() => graphemes(lines[0] ?? "").length);
  const [deleting, setDeleting] = useState(false);
  // A new language starts again from its first line, fully written.
  useEffect(() => { setLineIndex(0); setDeleting(false); setCount(graphemes(lines[0] ?? "").length); }, [lines]);
  const chars = graphemes(lines[lineIndex] ?? "");
  const text = chars.slice(0, count).join("");
  useEffect(() => {
    const full = count >= chars.length;
    const delay = deleting ? 22 : full ? 2200 : 42;
    const timer = window.setTimeout(() => {
      if (!deleting && full) setDeleting(true);
      else if (deleting && count === 0) { setDeleting(false); setLineIndex((i) => (i + 1) % lines.length); }
      else setCount((n) => n + (deleting ? -1 : 1));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [deleting, count, chars.length, lines.length]);
  // Screen readers get the whole current line, not a stream of single letters.
  return <>
    <span className="sr-only">{lines[lineIndex]}</span>
    <span aria-hidden="true">{text}<span className="ml-0.5 inline-block w-[0.08em] animate-pulse self-stretch bg-current align-baseline">&#8203;</span></span>
  </>;
}

const tiltSpring = { stiffness: 260, damping: 11, mass: 0.6 };

// Tilts in place toward the pointer; the spring overshoots on release for an elastic feel.
function TiltCard({ className, children }: { className: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [16, -16]), tiltSpring);
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-18, 18]), tiltSpring);
  const scale = useSpring(1, tiltSpring);
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (reduce || e.pointerType === "touch") return;
    const r = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - r.left) / r.width - 0.5);
    y.set((e.clientY - r.top) / r.height - 0.5);
    scale.set(1.04);
  };
  const leave = () => { x.set(0); y.set(0); scale.set(1); };
  return <motion.div className={className} style={{ rotateX, rotateY, scale, transformPerspective: 700 }} onPointerMove={move} onPointerLeave={leave}>{children}</motion.div>;
}

// Counts up to the value once scrolled into view. Zeros count *down* from 99, more dramatic.
function CountUp({ value, prefix = "", suffix = "" }: Stat) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();
  const from = value === 0 ? 99 : 0;
  const [shown, setShown] = useState(from);
  useEffect(() => {
    if (!inView) return;
    if (reduce) return setShown(value);
    const controls = animate(from, value, { duration: 1.8, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setShown(Math.round(v)) });
    return () => controls.stop();
  }, [inView, reduce, from, value]);
  return <span ref={ref} className="tabular-nums">{prefix}{shown.toLocaleString("en-IN")}{suffix}</span>;
}

// Live numbers once there are stories; until then, statements that are true from day one.
function StatsStrip() {
  const { stats } = useLandingStats();
  const { stats: labels, meter } = useLanding();
  // " day" / " days" after the median wait, in the page's language.
  const unit = (s: string) => (s.trim() === "day" ? ` ${meter.day}` : s.trim() === "days" ? ` ${meter.days}` : s);
  return <section className="border-b-2 border-foreground bg-primary text-primary-foreground"><div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-primary-foreground/30 md:grid-cols-4">{stats.map((stat) => <div key={stat.label} className="px-5 py-6 text-center"><p className="font-display text-3xl font-bold"><CountUp {...stat} {...(stat.suffix !== undefined && { suffix: unit(stat.suffix) })} /></p><p className="text-xs uppercase opacity-80">{labels[stat.label] ?? stat.label}</p></div>)}</div></section>;
}

function Marquee({ reverse = false }: { reverse?: boolean }) {
  const marquee = useLanding().marquee;
  const items = [...marquee, ...marquee];
  return <div className="overflow-hidden border-y-2 border-foreground bg-foreground py-3 text-background"><div className={`${reverse ? "marquee-track-reverse" : "marquee-track"} pause-on-hover flex items-center`}>{items.map((item, index) => <span key={`${item}-${index}`} className="flex items-center gap-5 whitespace-nowrap px-5 font-display text-lg font-bold sm:text-xl"><span className="text-primary">✦</span>{item}</span>)}</div></div>;
}

function LandingPage() {
  // Logged-in visitors go straight to their dashboard.
  const { waiting } = useAuthGuard("public-only");
  const t = useT();
  const L = useLanding();
  const { list, ready } = useCompanyIndex();
  const rated = list.filter(isRated).sort((a, b) => b.score - a.score);
  const loved = apiEnabled ? rated.filter((c) => c.score >= 50).slice(0, 4) : companies.slice(0, 4);
  const warned = apiEnabled ? [...rated].reverse().filter((c) => c.score < 50).slice(0, 4) : companies.slice(-4).reverse();
  const wall = useQuery({ queryKey: ["landing-stories"], queryFn: async () => (await api<{ stories: StoryDto[] }>("/v1/stories?limit=6")).stories, enabled: apiEnabled, staleTime: 60_000 });
  const wallStories = (wall.data ?? []).map((s) => fromApi(s, new Map(list.map((c) => [c.id, c]))));
  useEffect(() => { if (!waiting) track("visit"); }, [waiting]);
  if (waiting) return <Preloader />;

  return <div className="min-h-screen overflow-hidden"><SiteHeader /><main>
    {/* Hero: the promise, a company search (no account needed), then the ask. */}
    <section id="top-search" className="mx-auto grid max-w-7xl scroll-mt-20 items-center gap-8 overflow-x-clip px-4 py-10 sm:gap-12 sm:px-6 sm:py-14 lg:min-h-[640px] lg:grid-cols-[1.05fr_.95fr] lg:gap-16 lg:py-20">
      <div className="animate-fade-up">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-accent px-3 py-1 text-sm font-bold"><Sparkles className="size-4" />{t("hero.badge")}</div>
        {/* Exactly two lines are reserved for the typing line (h-[1.94em] at this line height), so the
    page below never moves; the lines themselves are short enough to never need a third. */}
<h1 className="max-w-3xl text-[2.6rem] font-bold leading-[.97] min-[380px]:text-5xl sm:text-6xl lg:text-7xl">{t("hero.title")}<br /><span className="block h-[1.94em] overflow-hidden text-primary"><RetypingLine /></span></h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">{t("hero.lede")}</p>
        <CompanySearch className="mt-7 max-w-xl" />
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button size="lg" asChild><Link to="/auth" search={{ intent: "share" }}><PenLine />{t("hero.share")} <ArrowRight /></Link></Button>
          <Button size="lg" variant="outline" asChild><a href="#ghost-o-meter"><Hourglass />{t("hero.waiting")}</a></Button>
        </div>
        <p className="mt-4 flex max-w-lg items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 shrink-0 text-flag-green" />{t("hero.trust")}</p>
      </div>
      {/* The collage is designed at 512×500 and scaled to fit smaller screens (66% on phones, 85% on
          small tablets). The outer box reserves the scaled height so nothing overlaps below it. */}
      <div className="relative mx-auto h-[330px] w-full max-w-lg sm:h-[425px] lg:h-[500px]"><div className="hero-scene absolute left-1/2 top-0 h-[500px] w-[32rem] origin-top -translate-x-1/2 scale-[0.66] sm:scale-[0.85] lg:scale-100">
        <div className="hero-orbit absolute inset-8 rounded-full border-2 border-dashed border-primary/35" /><div className="hero-orbit-delayed absolute inset-20 rounded-full border border-foreground/25" />
        <TiltCard className="absolute left-7 top-3 z-30 w-[68%] -rotate-6 rounded-xl border-2 border-foreground bg-accent p-4 shadow-hard"><p className="text-xs font-bold uppercase">{heroScene.status}</p><p className="mt-2 font-display text-lg font-bold">“{heroScene.headline}”</p></TiltCard>
        <TiltCard className="absolute right-0 top-24 z-20 rotate-3 rounded-xl border-2 border-foreground bg-card p-5 shadow-hard"><FlagScore score={heroScene.score} /><p className="mt-1 text-center text-[10px] font-bold uppercase text-flag-red">{heroScene.scoreLabel}</p></TiltCard>
        <TiltCard className="absolute bottom-14 left-2 z-30 w-[78%] -rotate-2 rounded-xl border-2 border-foreground bg-card p-5 shadow-hard"><p className="text-xs font-bold uppercase text-primary">{heroScene.receiptLabel}</p><p className="mt-2 font-display text-lg font-bold">“{heroScene.receipt}”</p><p className="mt-4 border-t-2 border-foreground pt-3 text-xs font-bold text-muted-foreground">{heroScene.footer}</p></TiltCard>
        <div className="hero-float absolute -left-1 top-42 z-40"><Avatar {...getUser("u3")} size="lg" /></div>
        <div className="hero-float-slow absolute bottom-4 right-7 z-40"><Avatar {...getUser("u7")} size="lg" /></div>
        <div className="hero-float-reverse absolute right-8 top-52 z-10 rounded-lg border-2 border-foreground bg-primary px-4 py-3 text-primary-foreground shadow-hard-sm"><p className="text-[10px] font-bold uppercase opacity-80">{heroScene.activity}</p><p className="font-display text-xl font-bold">{heroScene.activityValue}</p></div>
      </div></div>
    </section>
    <Marquee />
    <StatsStrip />

    <section id="how" className="mx-auto max-w-7xl px-4 py-24 sm:px-6"><p className="mb-3 text-sm font-bold uppercase text-primary">{L.how.eyebrow}</p><h2 className="max-w-2xl text-4xl font-bold sm:text-5xl">{L.how.title}</h2><div className="mt-10 grid gap-5 md:grid-cols-3">{L.how.steps.map(({ title, copy }, i) => <div key={i} className="card-lift rounded-xl border-2 border-foreground bg-card p-6 shadow-hard-sm"><span className="font-display text-5xl font-bold text-primary">{String(i + 1).padStart(2, "0")}</span><h3 className="mt-8 text-xl font-bold">{title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy}</p></div>)}</div></section>

    {/* The Ghost-o-meter, then the natural next step: look the company up. */}
    <div id="ghost-o-meter" className="scroll-mt-20 border-t-2 border-foreground">
      <GhostOMeter />
      <div className="mx-auto -mt-12 max-w-7xl px-4 pb-20 sm:px-6">
        <div className="rounded-xl border-2 border-foreground bg-accent p-5 shadow-hard-sm sm:p-6">
          <p className="flex items-center gap-2 font-display text-xl font-bold"><Search className="size-5" />{L.lookup.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{L.lookup.copy}</p>
          <CompanySearch size="md" className="mt-4 max-w-xl" />
        </div>
      </div>
      <LandingTools />
    </div>

    <WhyGhosted />
    <LandingObjection />
    <section className="border-y-2 border-foreground bg-accent py-24"><div className="mx-auto max-w-7xl px-4 sm:px-6"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-3 text-sm font-bold uppercase text-primary">{L.proofs.eyebrow}</p><h2 className="text-4xl font-bold sm:text-5xl">{L.proofs.title}</h2></div><p className="max-w-md text-muted-foreground">{L.proofs.aside}</p></div><div className="mt-10 grid gap-5 md:grid-cols-3">{L.proofs.items.map(({ title, expected, reality }) => <article key={title} className="rounded-xl border-2 border-foreground bg-card p-5 shadow-hard-sm"><p className="text-xs font-bold uppercase text-primary">{title}</p><p className="mt-5 text-sm text-muted-foreground">{expected}</p><p className="mt-3 border-t-2 border-foreground pt-3 font-display text-lg font-bold">{reality}</p></article>)}</div></div></section>
    <Marquee reverse />

    <section id="companies" className="border-b-2 border-foreground bg-secondary py-24"><div className="mx-auto max-w-7xl px-4 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-3 text-sm font-bold uppercase text-primary">{L.flags.eyebrow}</p><h2 className="text-4xl font-bold sm:text-5xl">{L.flags.title}</h2></div><p className="max-w-md text-muted-foreground">{L.flags.aside}</p></div>
      {apiEnabled && !loved.length && !warned.length
        ? <div className="mt-10 grid gap-5 rounded-xl border-2 border-foreground bg-card p-6 shadow-hard-sm sm:p-8 md:grid-cols-[1fr_auto] md:items-center">
            <div><p className="font-display text-2xl font-bold">{L.flags.emptyTitle}</p><p className="mt-2 max-w-md text-muted-foreground">{L.flags.emptyCopy}</p></div>
            <div className="grid gap-3"><Button asChild><Link to="/auth" search={{ intent: "share" }}><PenLine />{t("hero.share")}</Link></Button></div>
          </div>
        : <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-2 [&>*]:min-w-0">{([[L.flags.decent, loved, "text-flag-green"], [L.flags.snacks, warned, "text-flag-red"]] as const).map(([title, group, tone]) => <div key={title}><h3 className={`mb-4 text-xl font-bold ${tone}`}>{title}</h3><div className="space-y-3">
            {group.length === 0 && <p className="rounded-xl border-2 border-dashed border-foreground/40 p-4 text-sm text-muted-foreground">{L.flags.nobody}</p>}
            {group.map((company) => <Link key={company.id} to="/c/$slug" params={{ slug: company.id }} className="card-lift flex items-center gap-3 rounded-xl border-2 border-foreground bg-card p-3 shadow-hard-sm sm:gap-4 sm:p-4"><CompanyMark company={company} /><div className="min-w-0 flex-1"><h4 className="font-bold">{company.name}</h4><p className="truncate text-sm text-muted-foreground">{company.summary}</p></div><div className={`shrink-0 font-display text-2xl font-bold ${company.score >= 70 ? "text-flag-green" : company.score >= 40 ? "text-flag-amber" : "text-flag-red"}`}>{company.score}</div></Link>)}
          </div></div>)}</div>}
    </div></section>

    {/* Invites: a small strip; the details live on /invite. */}
    {/* Phones and tablets: avatars, text and a full-width button stacked; a single row from lg up. */}
    <section className="border-b-2 border-foreground bg-accent"><div className="mx-auto grid max-w-7xl gap-5 px-4 py-10 sm:px-6 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center lg:gap-8">
      <div className="flex -space-x-3">{(["violet", "sunrise", "gold"] as const).map((f, i) => <FlairRing key={f} flair={f} className="bg-card"><Avatar {...getUser(["u2", "u5", "u8"][i]!)} size="md" /></FlairRing>)}</div>
      <div className="min-w-0"><h2 className="font-display text-2xl font-bold leading-tight sm:text-3xl">{L.invite.title}</h2><p className="mt-2 max-w-2xl text-muted-foreground">{L.invite.copy}</p></div>
      <Button size="lg" variant="outline" className="min-h-12 w-full bg-card sm:w-fit" asChild><Link to="/invite">{L.invite.cta} <ArrowRight /></Link></Button>
    </div></section>
    <LandingPitch />
    <HiringMinefield />

    <section id="stories" className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-3 text-sm font-bold uppercase text-primary">{L.wall.eyebrow}</p><h2 className="text-4xl font-bold sm:text-5xl">{L.wall.title}</h2></div><Button variant="outline" asChild><Link to="/auth" search={{ intent: "share" }}><PenLine />{L.wall.add}</Link></Button></div>
      {apiEnabled
        ? wallStories.length ? <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{wallStories.map((story) => <StoryModelCard key={story.id} story={story} readMore={L.wall.readMore} />)}</div>
          : <div className="mt-10 grid gap-5 rounded-xl border-2 border-foreground bg-card p-6 shadow-hard-sm sm:p-8 md:grid-cols-[1fr_auto] md:items-center">
              <div><p className="font-display text-2xl font-bold">{wall.isPending ? L.wall.loading : L.wall.firstTitle}</p>{!wall.isPending && <p className="mt-2 max-w-lg text-muted-foreground">{L.wall.firstCopy}</p>}</div>
              {!wall.isPending && <Button asChild><Link to="/auth" search={{ intent: "share" }}><PenLine />{t("hero.share")}</Link></Button>}
            </div>
        : <div className="mt-10 columns-1 gap-5 space-y-5 md:columns-2 lg:columns-3">{stories.slice(0, 6).map((story) => <StoryCard key={story.id} story={story} />)}</div>}
    </section>

    <section className="border-y-2 border-foreground bg-foreground text-background"><div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 md:grid-cols-2"><div><div className="mb-4 grid size-12 place-items-center rounded-xl border-2 border-background/50 bg-primary text-primary-foreground shadow-hard-sm"><EyeOff /></div><h2 className="text-4xl font-bold">{L.privacy.title1}<br />{L.privacy.title2}</h2><p className="mt-4 max-w-lg leading-relaxed text-background/70">{L.privacy.copy}</p></div><PrivacyDemo /></div></section>
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6"><div className="rounded-xl border-2 border-foreground bg-primary p-8 text-primary-foreground shadow-hard md:flex md:items-center md:justify-between md:gap-8 md:p-12"><div><Feather className="mb-5 size-8" /><h2 className="text-4xl font-bold">{L.cta.title}</h2><p className="mt-2 opacity-80">{L.cta.copy}</p></div><Button size="lg" variant="outline" className="mt-7 bg-background text-foreground md:mt-0" asChild><Link to="/auth" search={{ intent: "share" }}>{L.cta.share} <ArrowRight /></Link></Button></div></section>
  </main><SiteFooter /></div>;
}
