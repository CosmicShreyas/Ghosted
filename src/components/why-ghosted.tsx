import { motion } from "motion/react";
import { Check, Github, MessagesSquare, Minus, Star, Users } from "lucide-react";
import { entity } from "@/content/legal";
import { cn } from "@/lib/utils";
import { useLanding } from "@/content/landing-copy";

const placeIcons = [Users, Star, MessagesSquare];

// Landing page: why post on Ghosted instead of the usual places. Platforms are described by type,
// never named (see the note on whyGhosted in mock/data.ts).
export function WhyGhosted() {
  const w = useLanding().why;
  return <section id="why" className="border-y-2 border-foreground bg-card py-24">
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="mb-3 text-sm font-bold uppercase text-primary">{w.eyebrow}</p><h2 className="max-w-2xl text-4xl font-bold sm:text-5xl">{w.title}</h2></div>
        <p className="max-w-md text-muted-foreground">{w.intro}</p>
      </div>

      {/* The usual suspects, by type. */}
      <div className="mt-10 grid gap-4 md:grid-cols-3">{w.places.map((p, i) => {
        const Icon = placeIcons[i] ?? Users;
        return <motion.div key={i} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }} className="rounded-xl border-2 border-dashed border-foreground/50 bg-background p-5">
          <Icon className="size-5 text-muted-foreground" />
          <p className="mt-3 font-display text-lg font-bold">{p.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">{p.quip}</p>
        </motion.div>;
      })}</div>

      {/* Side by side. On phones each row stacks: topic, then elsewhere, then Ghosted. */}
      <div className="mt-8 overflow-hidden rounded-xl border-2 border-foreground shadow-hard">
        <div className="hidden grid-cols-[12rem_1fr_1fr] border-b-2 border-foreground bg-foreground text-background md:grid">
          <span className="px-5 py-3 text-xs font-bold uppercase opacity-70">&nbsp;</span>
          <span className="border-l-2 border-background/20 px-5 py-3 text-sm font-bold">{w.elsewhereHead}</span>
          <span className="flex items-center gap-2 border-l-2 border-background/20 bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"><img src="/ghosted-mark.png" alt="" className="size-5 object-contain" />{w.ghostedHead}</span>
        </div>
        {w.rows.map((r, i) => <motion.div key={i} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.04 }} className={cn("grid md:grid-cols-[12rem_1fr_1fr]", i > 0 && "border-t-2 border-foreground/15")}>
          <p className="bg-muted/60 px-5 py-4 font-display font-bold md:bg-transparent">{r.topic}</p>
          <p className="flex gap-2.5 px-5 py-4 text-sm text-muted-foreground md:border-l-2 md:border-foreground/15"><Minus className="mt-0.5 size-4 shrink-0" /><span><span className="mb-1 block text-[11px] font-bold uppercase md:hidden">{w.elsewhere}</span>{r.elsewhere}</span></p>
          <p className="flex gap-2.5 bg-primary/5 px-5 py-4 text-sm font-semibold md:border-l-2 md:border-foreground/15">
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-flag-green text-primary-foreground"><Check className="size-3" strokeWidth={3} /></span>
            <span><span className="mb-1 block text-[11px] font-bold uppercase text-primary md:hidden">{w.ghosted}</span>{r.ghosted}{/* The open-source row (4th) links to the code. */}{i === 3 && <a href={entity.github} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center gap-1 font-bold text-primary underline-offset-2 hover:underline"><Github className="size-3.5" />{w.seeCode}</a>}</span>
          </p>
        </motion.div>)}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">{w.footnote}</p>
    </div>
  </section>;
}
