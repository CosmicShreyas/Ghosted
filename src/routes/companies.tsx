import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Building2, MapPin, PenLine, Search } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { CompanyMark } from "@/components/ghosted";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, apiEnabled } from "@/lib/api";
import { openStoryComposer } from "@/lib/guest";
import { INDUSTRY_LABEL } from "@/lib/industries";
import { breadcrumbLd, pageHead, SITE_URL } from "@/lib/meta";
import { companyFromApi, type CompanyDto } from "@/lib/stories";
import { cn } from "@/lib/utils";
import { companies as sampleCompanies, type Company } from "@/mock/data";

// /companies: every company with at least one published story, browsable by industry and city.
// It's the crawlable index of the company pages (search engines follow these links to reach every
// one) and a page that can rank for "<industry> companies interview experience". Filters stay in
// the page, not the URL, so they never create near-duplicate pages for search engines.
export const Route = createFileRoute("/companies")({
  loader: async () => {
    if (!apiEnabled) return null;
    try { return (await api<{ companies: CompanyDto[] }>("/v1/companies?sort=stories&limit=500", { timeoutMs: typeof window === "undefined" ? 8000 : 15000 })).companies; }
    catch { return null; }
  },
  head: ({ loaderData }) => {
    const list = loaderData ?? [];
    const total = list.reduce((n, c) => n + c.storyCount, 0);
    const description = list.length
      ? `Browse ${list.length} companies in India with ${total} anonymous candidate experiences: interview rounds, how long replies took, rejections, offers and ghosting. Search by company, industry or city.`
      : "Browse companies in India by the hiring experiences candidates shared anonymously: interview rounds, waiting time, rejections, offers and ghosting.";
    return pageHead({
      title: "Company Interview Experiences & Hiring Reviews in India | Ghosted",
      description, path: "/companies",
      jsonLd: [
        breadcrumbLd([{ name: "Ghosted", path: "/" }, { name: "Companies", path: "/companies" }]),
        {
          "@context": "https://schema.org", "@type": "CollectionPage", name: "Companies on Ghosted", url: `${SITE_URL}/companies`, description, isPartOf: { "@id": `${SITE_URL}/#website` },
          mainEntity: { "@type": "ItemList", numberOfItems: list.length, itemListElement: list.slice(0, 100).map((c, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE_URL}/c/${c.slug}`, name: c.name })) },
        },
      ],
    });
  },
  component: CompaniesPage,
});

const industryName = (id: string | null | undefined) => (id ? INDUSTRY_LABEL[id] ?? id : null);
const tone = (score: number) => (score >= 70 ? "text-flag-green" : score <= 40 ? "text-flag-red" : "text-flag-amber");
const ALL = "All";

function CompaniesPage() {
  const loaded = Route.useLoaderData();
  const companies: Company[] = useMemo(() => (loaded ? loaded.map(companyFromApi) : apiEnabled ? [] : sampleCompanies), [loaded]);
  const [query, setQuery] = useState("");
  const [industry, setIndustry] = useState(ALL);
  const [city, setCity] = useState(ALL);

  // Only the industries and cities that actually have companies, busiest first.
  const facet = (pick: (c: Company) => string | null | undefined) => {
    const counts = new Map<string, number>();
    for (const c of companies) { const v = pick(c); if (v) counts.set(v, (counts.get(v) ?? 0) + 1); }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([v]) => v);
  };
  const industries = useMemo(() => facet((c) => c.industry), [companies]); // eslint-disable-line react-hooks/exhaustive-deps
  const cities = useMemo(() => facet((c) => c.hqCity), [companies]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = companies.filter((c) => (industry === ALL || c.industry === industry) && (city === ALL || c.hqCity === city) && (!query || c.name.toLowerCase().includes(query.trim().toLowerCase())));
  const stories = companies.reduce((n, c) => n + (c.storyCount ?? 0), 0);

  return <div className="min-h-screen bg-background">
    <SiteHeader />
    <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground"><Link to="/" className="hover:text-primary hover:underline">Ghosted</Link> <span aria-hidden="true">/</span> <span className="font-semibold text-foreground">Companies</span></nav>
      <h1 className="mt-3 max-w-3xl font-display text-4xl font-bold sm:text-5xl">Company interview experiences in India</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">{companies.length ? `${companies.length} companies, ${stories} anonymous ${stories === 1 ? "story" : "stories"} from candidates. Pick one to see its rounds, how long replies took and how it usually ends.` : "Companies show up here once someone shares how their hiring went."}</p>

      <div className="mt-8 grid gap-3 rounded-xl border-2 border-foreground bg-card p-4 shadow-hard-sm sm:grid-cols-[1fr_auto_auto] sm:items-center">
        <label className="relative block"><span className="sr-only">Search companies</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a company" className="pl-9" /></label>
        <label className="flex items-center gap-2 text-sm font-semibold"><Building2 className="size-4 shrink-0 text-muted-foreground" /><span className="sr-only">Industry</span>
          <select value={industry} onChange={(e) => setIndustry(e.target.value)} className="h-10 w-full min-w-0 rounded-md border-2 border-foreground bg-background px-2 sm:w-48">{[ALL, ...industries].map((v) => <option key={v} value={v}>{v === ALL ? "All industries" : industryName(v)}</option>)}</select></label>
        <label className="flex items-center gap-2 text-sm font-semibold"><MapPin className="size-4 shrink-0 text-muted-foreground" /><span className="sr-only">City</span>
          <select value={city} onChange={(e) => setCity(e.target.value)} className="h-10 w-full min-w-0 rounded-md border-2 border-foreground bg-background px-2 sm:w-44">{[ALL, ...cities].map((v) => <option key={v} value={v}>{v === ALL ? "All cities" : v}</option>)}</select></label>
      </div>

      {shown.length
        ? <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Companies">{shown.map((c) => <li key={c.id}>
          <Link to="/c/$slug" params={{ slug: c.id }} className="flex h-full gap-4 rounded-xl border-2 border-foreground bg-card p-4 shadow-hard-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <CompanyMark company={c} />
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-display text-lg font-bold">{c.name}</h2>
              <p className="truncate text-xs text-muted-foreground">{[industryName(c.industry), c.hqCity].filter(Boolean).join(", ") || "Company"}</p>
              <p className="mt-2 text-sm"><span className="font-bold tabular-nums">{c.storyCount ?? 0}</span> {(c.storyCount ?? 0) === 1 ? "story" : "stories"}{c.avgDaysWaited != null && <>, about <span className="font-bold tabular-nums">{c.avgDaysWaited}</span> days to reply</>}</p>
            </div>
            <div className="shrink-0 text-right"><p className={cn("font-display text-2xl font-bold tabular-nums", tone(c.score))}>{c.score}</p><p className="text-[11px] font-semibold text-muted-foreground">Flag Score</p></div>
          </Link>
        </li>)}</ul>
        : <div className="mt-6 rounded-xl border-2 border-dashed border-foreground/40 p-10 text-center"><p className="font-display text-xl font-bold">No companies match that yet.</p><p className="mt-1 text-muted-foreground">Know how hiring went somewhere? That's how this list grows.</p></div>}

      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-xl border-2 border-foreground bg-accent p-6 shadow-hard-sm">
        <p className="font-display text-xl font-bold">Applied somewhere that isn't here? Put it on the map.</p>
        <Button onClick={openStoryComposer}><PenLine />Share your story</Button>
      </div>
    </main>
    <SiteFooter />
  </div>;
}
