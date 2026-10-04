import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeftRight, Scale } from "lucide-react";
import { CompanyMark, FlagScore } from "@/components/ghosted";
import { CompanyPicker } from "@/components/company-picker";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { OutcomeMix, STAGE_NAME } from "@/components/typical-process";
import { Button } from "@/components/ui/button";
import { card } from "@/components/dashboard/ui-kit";
import { useCompanyPage, type CompanyPage } from "@/lib/companies";
import { pageHead } from "@/lib/meta";
import { isRated, useCompanyIndex } from "@/lib/stories";
import { cn } from "@/lib/utils";

// /compare?a=<slug>&b=<slug>: two companies side by side. Only real numbers: a score shows only when
// stories rated it, process figures only from 5+ stories (the same rules as the company page).
// Kept out of search results (noindex): every pair would be a thin duplicate of two company pages.
const SLUG = /^[a-z0-9-]{2,60}$/;
export const Route = createFileRoute("/compare")({
  validateSearch: (s: Record<string, unknown>): { a?: string; b?: string } => ({
    ...(typeof s["a"] === "string" && SLUG.test(s["a"]) && { a: s["a"] }),
    ...(typeof s["b"] === "string" && SLUG.test(s["b"]) && { b: s["b"] }),
  }),
  head: () => pageHead({ title: "Compare companies · Ghosted", description: "Compare two companies' hiring side by side: Flag Score, how far candidates get, how long they wait and how it ends.", path: "/compare", noindex: true }),
  component: ComparePage,
});

const DIMS = [["hiring", "Hiring process"], ["communication", "Communication"], ["pay", "Pay transparency"], ["culture", "Work culture"], ["growth", "Growth"]] as const;

// One company's column. Mounted only once a company is picked, so it never fetches an empty slug.
function Column({ slug }: { slug: string }) {
  const { page, loading, notFound } = useCompanyPage(slug);
  if (loading) return <div className="skeleton h-[32rem] rounded-xl" aria-busy="true" />;
  if (notFound || !page) return <div className={cn(card, "p-6 text-sm text-muted-foreground")}>That company isn't listed.</div>;
  return <CompanyColumn page={page} />;
}

const none = <span className="text-sm font-semibold text-muted-foreground">Not enough data</span>;

function CompanyColumn({ page }: { page: CompanyPage }) {
  const c = page.company;
  const p = page.stats.process;
  const rated = isRated(c);
  return <article className={cn(card, "flex flex-col gap-4 p-4 sm:p-5")}>
    <Link to="/c/$slug" params={{ slug: c.id }} className="flex items-center gap-3 rounded-lg hover:underline">
      <CompanyMark company={c} /><span className="min-w-0"><span className="block truncate font-display text-xl font-bold">{c.name}</span><span className="text-xs text-muted-foreground">{page.stats.stories} {page.stats.stories === 1 ? "story" : "stories"}</span></span>
    </Link>
    <div><p className="mb-1 text-xs font-bold text-muted-foreground">Flag Score</p>{rated ? <FlagScore score={c.score} compact /> : <span className="text-sm font-semibold text-muted-foreground">Not rated yet</span>}</div>
    <div>
      <p className="mb-1.5 text-xs font-bold text-muted-foreground">Ratings, out of 100</p>
      <ul className="space-y-1.5">{DIMS.map(([k, label]) => {
        // Only categories real stories rated (a missing rating is never shown as a number).
        const n = c.scoreCounts?.[k] ?? 0;
        return <li key={k} className="flex items-center justify-between gap-2 text-sm"><span>{label}</span>{rated && n > 0 ? <span className="font-display font-bold tabular-nums">{c.scores[k]} <span className="text-[11px] font-normal text-muted-foreground">({n})</span></span> : <span className="text-xs text-muted-foreground">No ratings</span>}</li>;
      })}</ul>
    </div>
    <div className="space-y-2 border-t-2 border-dashed border-foreground/15 pt-3">
      <p className="text-xs font-bold text-muted-foreground">Typical process</p>
      {!p ? none : !p.ready ? <p className="text-sm text-muted-foreground">Needs {p.needed} more {p.needed === 1 ? "story" : "stories"}.</p> : <>
        <p className="flex justify-between gap-2 text-sm"><span>Usually gets as far as</span><b className="text-right">{p.usualStage ? STAGE_NAME[p.usualStage] : "Not enough data"}</b></p>
        <p className="flex justify-between gap-2 text-sm"><span>Typical wait</span><b>{p.medianDays != null ? `${p.medianDays} ${p.medianDays === 1 ? "day" : "days"}` : "Not enough data"}</b></p>
        <p className="flex justify-between gap-2 text-sm"><span>Reported offer pay</span><b>{p.offerPay ? `₹${p.offerPay.median} LPA` : "Not enough data"}</b></p>
        <div className="pt-1"><OutcomeMix outcomes={p.outcomes} /></div>
      </>}
    </div>
  </article>;
}

function ComparePage() {
  const { a, b } = Route.useSearch();
  const navigate = useNavigate();
  const { list } = useCompanyIndex();
  const set = (key: "a" | "b", v: string) => void navigate({ to: "/compare", search: (s: { a?: string; b?: string }) => ({ ...s, [key]: v }), replace: true });
  const swap = () => void navigate({ to: "/compare", search: { ...(b && { a: b }), ...(a && { b: a }) }, replace: true });
  return <div className="min-h-screen"><SiteHeader /><main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
    <h1 className="flex items-center gap-2 font-display text-3xl font-bold sm:text-4xl"><Scale className="size-8 text-primary" />Compare companies</h1>
    <p className="mt-2 max-w-2xl text-muted-foreground">Two companies' hiring, side by side, from real candidate stories. Anything without enough stories behind it says so.</p>
    <div className="mt-6 grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
      <div><p className="mb-1.5 text-sm font-bold">First company</p><CompanyPicker value={a ?? ""} onChange={(v) => set("a", v)} companies={list} placeholder="Choose a company" /></div>
      <Button variant="outline" size="icon" className="mx-auto" aria-label="Swap the two companies" onClick={swap} disabled={!a && !b}><ArrowLeftRight /></Button>
      <div><p className="mb-1.5 text-sm font-bold">Second company</p><CompanyPicker value={b ?? ""} onChange={(v) => set("b", v)} companies={list} placeholder="Choose a company" /></div>
    </div>
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      {a ? <Column key={a} slug={a} /> : <div className="grid min-h-48 place-items-center rounded-xl border-2 border-dashed border-foreground/30 p-6 text-sm text-muted-foreground">Pick the first company</div>}
      {b ? <Column key={b} slug={b} /> : <div className="grid min-h-48 place-items-center rounded-xl border-2 border-dashed border-foreground/30 p-6 text-sm text-muted-foreground">Pick a company to compare</div>}
    </div>
    {a && b && a === b && <p className="mt-3 text-sm text-muted-foreground">That's the same company twice. Pick a different one on either side.</p>}
  </main><SiteFooter /></div>;
}
