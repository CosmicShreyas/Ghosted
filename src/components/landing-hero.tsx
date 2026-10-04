// The landing page's first screen. It leads with what a visitor can get right now (look a company
// up, no account needed) and only then asks for a story. Searching is a smaller step than posting,
// and it gets people inside the product.
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Building2, Hourglass, Loader2, PenLine, Search, ShieldCheck } from "lucide-react";
import { CompanyMark, FlagScore } from "@/components/ghosted";
import { Button } from "@/components/ui/button";
import { apiEnabled, track } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { ListCompanyDialog } from "@/components/dashboard/list-company";
import { useSearch } from "@/lib/search";
import { isRated, useCompanyIndex } from "@/lib/stories";
import { cn, formatCount } from "@/lib/utils";
import type { Company } from "@/mock/data";

// Names people in Bengaluru tech hiring search for most. Shown as one-tap examples only when the
// company is actually listed on Ghosted.
const POPULAR = ["Accenture", "TCS", "Infosys", "Wipro", "Amazon", "Microsoft", "Google", "Deloitte", "Capgemini", "Cognizant", "IBM", "NVIDIA"];

export function CompanySearch({ size = "lg", autoFocus = false, className }: { size?: "lg" | "md"; autoFocus?: boolean; className?: string }) {
  const navigate = useNavigate();
  const t = useT();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [requesting, setRequesting] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const search = useSearch(q);
  const { list } = useCompanyIndex();
  // The API's search (typo-tolerant); without it, a simple name match over the loaded list.
  const results: Company[] = apiEnabled ? (search.data?.companies ?? []) : list.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 5);
  const loading = apiEnabled && q.trim().length >= 2 && (search.debouncing || search.loading);
  const popular = POPULAR.map((n) => list.find((c) => c.name.toLowerCase() === n.toLowerCase())).filter((c): c is Company => !!c).slice(0, 6);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close);
  }, []);
  const go = (c: Company) => { track("company_search"); void navigate({ to: "/c/$slug", params: { slug: c.id } }); };
  const show = open && q.trim().length >= 2;

  return <div ref={box} className={cn("relative", className)}>
    <form role="search" onSubmit={(e) => { e.preventDefault(); if (results[0]) go(results[0]); }}>
      <label className={cn("flex items-center gap-2 rounded-xl border-2 border-foreground bg-card shadow-hard-sm focus-within:shadow-hard", size === "lg" ? "h-16 pl-4 pr-3" : "h-14 pl-3.5 pr-2.5")}>
        <Search className="size-5 shrink-0 text-muted-foreground" />
        <span className="sr-only">{t("search.label")}</span>
        <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} autoFocus={autoFocus} type="text" inputMode="search" enterKeyHint="search" autoComplete="off"
          placeholder={t("search.placeholder")} className={cn("min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground", size === "lg" ? "text-lg" : "text-base")} />
        {loading ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : <Button type="submit" size="sm" className="hidden min-h-10 sm:inline-flex" disabled={!results[0]}>{t("search.button")}</Button>}
      </label>
    </form>
    <AnimatePresence>{show && <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}
      className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-xl border-2 border-foreground bg-card text-left shadow-hard">
      {results.length ? <ul className="p-1.5">{results.map((c) => <li key={c.id}><button type="button" onClick={() => go(c)} className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-muted">
        <CompanyMark company={c} size="sm" />
        <span className="min-w-0 flex-1"><span className="block truncate font-bold">{c.name}</span><span className="block text-xs text-muted-foreground">{isRated(c) ? `${formatCount(c.storyCount ?? 0)} ${(c.storyCount ?? 0) === 1 ? "story" : "stories"}` : "No stories yet. Be the first."}</span></span>
        {isRated(c) && <FlagScore score={c.score} compact />}
      </button></li>)}</ul>
        : !loading && <div className="p-4 text-sm"><p className="font-bold">Not listed yet? Request it.</p><p className="mt-1 text-muted-foreground">No company called “{q.trim()}” on Ghosted yet. Add its website and we'll fill in the rest.</p><Button size="sm" className="mt-3 min-h-10" onClick={() => { setRequesting(q.trim()); setOpen(false); }}><Building2 />Request “{q.trim()}”</Button></div>}
    </motion.div>}</AnimatePresence>
    {popular.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2 text-sm"><span className="text-muted-foreground">{t("search.try")}</span>{popular.map((c) => <Link key={c.id} to="/c/$slug" params={{ slug: c.id }} className="inline-flex min-h-9 items-center rounded-full border-2 border-foreground/20 bg-card px-3 font-semibold hover:border-foreground">{c.name}</Link>)}</div>}
    {/* "Request it": the list-company flow, usable signed out until the final step. */}
    <ListCompanyDialog open={requesting !== null} onOpenChange={(v) => { if (!v) setRequesting(null); }} requestName={requesting ?? ""} onListed={go} />
  </div>;
}

export function LandingHero() {
  return <section className="relative border-b-2 border-foreground">
    <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.15fr_.85fr] lg:items-center lg:py-20">
      <div>
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-accent px-3 py-1 text-sm font-bold"><Building2 className="size-4" />Real hiring experiences, by company</p>
        <h1 className="max-w-3xl text-5xl font-bold leading-[1.02] sm:text-6xl lg:text-7xl">Know what happened before you apply.</h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">Real candidate experiences. Anonymous by default. Searchable by company.</p>
        <p className="mt-2 max-w-xl text-sm font-semibold">Interview rounds · Waiting time · Communication · Rejections · Offers · Ghosting</p>
        <CompanySearch className="mt-7 max-w-xl" />
      </div>
      <div className="grid gap-4">
        <div className="rounded-xl border-2 border-foreground bg-card p-5 shadow-hard">
          <p className="text-sm font-bold text-primary">Already went through a hiring process?</p>
          <p className="mt-1 font-display text-2xl font-bold leading-tight">Add your experience anonymously.</p>
          <p className="mt-2 text-sm text-muted-foreground">Tap a few answers and post in about 30 seconds. Writing more is optional.</p>
          <Button size="lg" className="mt-4 min-h-12 w-full" asChild><Link to="/auth" search={{ intent: "share" }}><PenLine />Share my experience<ArrowRight /></Link></Button>
          <p className="mt-3 flex items-center gap-2 text-xs font-semibold"><ShieldCheck className="size-4 shrink-0 text-flag-green" />No name. No company email. Employers never see who you are.</p>
        </div>
        <a href="#ghost-o-meter" className="group flex items-center gap-3 rounded-xl border-2 border-foreground bg-accent p-4 shadow-hard-sm transition-transform hover:-translate-y-0.5">
          <span className="grid size-11 shrink-0 place-items-center rounded-full border-2 border-foreground bg-card"><Hourglass className="size-5" /></span>
          <span className="min-w-0 flex-1"><span className="block font-bold">Waiting to hear back after an interview?</span><span className="block text-sm text-muted-foreground">Check how long is normal and get a follow-up message.</span></span>
          <ArrowRight className="size-5 shrink-0 transition-transform group-hover:translate-x-1" />
        </a>
      </div>
    </div>
  </section>;
}
