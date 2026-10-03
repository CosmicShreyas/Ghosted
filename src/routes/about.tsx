import { createFileRoute } from "@tanstack/react-router";
import { Linkedin } from "lucide-react";
import { Avatar } from "@/components/ghosted";
import { LegalPage, docHead } from "@/components/legal-page";
import { aboutDoc, founders } from "@/content/legal";

export const Route = createFileRoute("/about")({
  head: () => docHead(aboutDoc, "Why Ghosted exists: an anonymous, searchable place for real hiring experiences in India, built for candidates, not employers.", "/about"),
  component: AboutPage,
});

function Founders() {
  return <div className="mt-8">
    <p className="mb-3 text-xs font-bold uppercase text-muted-foreground">The people behind it</p>
    <div className="grid gap-4 sm:grid-cols-2">{founders.map((f) => <div key={f.name} className="card-lift flex flex-col rounded-xl border-2 border-foreground bg-background p-5 shadow-hard-sm">
      <div className="flex items-center gap-4"><Avatar seed={f.seed} pastel={f.pastel} size="lg" label={`${f.name}, ${f.role}`} /><div><p className="font-display text-xl font-bold">{f.name}</p><span className="mt-1 inline-block rounded-full border-2 border-foreground bg-accent px-2.5 py-0.5 text-[11px] font-bold uppercase">{f.role}</span></div></div>
      <p className="mt-4 flex-1 text-sm leading-relaxed text-foreground/85">{f.bio}</p>
      <a href={`https://www.linkedin.com/${f.linkedin}`} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex w-fit items-center gap-2 rounded-lg border-2 border-foreground bg-card px-3 py-1.5 text-sm font-bold transition-colors hover:bg-primary hover:text-primary-foreground"><Linkedin className="size-4" />{f.linkedin}</a>
    </div>)}</div>
  </div>;
}

function AboutPage() {
  return <LegalPage doc={aboutDoc} insertAfter={{ story: <Founders /> }} />;
}
