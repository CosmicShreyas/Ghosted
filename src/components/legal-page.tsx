import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { FileText } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import type { Doc } from "@/content/legal";

const docs = [
  { to: "/about", label: "About" },
  { to: "/privacy", label: "Privacy Policy" },
  { to: "/terms", label: "Terms & Conditions" },
  { to: "/community", label: "Community Rules" },
] as const;

export const docHead = (doc: Doc, description: string) => ({
  meta: [
    { title: `${doc.eyebrow} | Ghosted` },
    { name: "description", content: description },
    { property: "og:title", content: `${doc.eyebrow} | Ghosted` },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
  ],
});

// `insertAfter` places extra content (e.g. the founders card) after the section with that id.
export function LegalPage({ doc, insertAfter = {} }: { doc: Doc; insertAfter?: Record<string, ReactNode> }) {
  return <div className="min-h-screen">
    <SiteHeader />
    <main>
      <section className="border-b-2 border-foreground bg-accent">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-card px-3 py-1 text-sm font-bold"><FileText className="size-4" />{doc.eyebrow}</p>
          <h1 className="max-w-4xl text-4xl font-bold leading-tight sm:text-6xl">{doc.title}</h1>
          <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">{doc.intro}</p>
          <p className="mt-6 text-sm font-semibold">Last updated: {doc.updated}</p>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-12">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <nav aria-label="Other pages" className="flex flex-wrap gap-2 lg:flex-col">{docs.map((d) => <Link key={d.to} to={d.to} className="rounded-lg border-2 border-foreground bg-card px-3 py-2 text-sm font-bold shadow-hard-sm transition-colors hover:bg-muted" activeProps={{ className: "!bg-primary text-primary-foreground" }}>{d.label}</Link>)}</nav>
          <nav aria-label="On this page" className="mt-8 hidden lg:block"><p className="mb-3 text-xs font-bold uppercase text-muted-foreground">On this page</p><ul className="space-y-2 border-l-2 border-foreground pl-4 text-sm">{doc.sections.map((s) => <li key={s.id}><a href={`#${s.id}`} className="text-muted-foreground hover:text-primary">{s.heading}</a></li>)}</ul></nav>
        </aside>

        {/* overflow-wrap:anywhere lets long URLs and email addresses break instead of widening the page on small phones. */}
        <article className="rounded-xl border-2 border-foreground bg-card p-5 shadow-hard [overflow-wrap:anywhere] sm:p-10">
          {doc.sections.map((s, i) => <section key={s.id} id={s.id} className={i ? "mt-10 scroll-mt-24 border-t-2 border-dashed border-foreground/20 pt-10" : "scroll-mt-24"}>
            <h2 className="text-2xl font-bold">{s.heading}</h2>
            <div className="mt-4 space-y-4 leading-relaxed text-foreground/85">{s.blocks.map((b, j) => typeof b === "string" ? <p key={j}>{b}</p> : <ul key={j} className="space-y-2">{b.map((item) => <li key={item} className="flex gap-3"><span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" /><span>{item}</span></li>)}</ul>)}</div>
            {insertAfter[s.id]}
          </section>)}
        </article>
      </div>
    </main>
    <SiteFooter />
  </div>;
}
