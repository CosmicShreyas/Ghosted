// Landing page: the "empty room" objection, answered (copy in mock/data.ts → landingObjection).
// A pull quote of the doubt, the short answer, six reasons, and how one story compounds over time.
import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { ArrowRight, Bot, Check, Crown, EyeOff, Hourglass, Pin, Ruler, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanding } from "@/content/landing-copy";

const ICONS = [Pin, Crown, Hourglass, Ruler, EyeOff, Bot];

export function LandingObjection() {
  const o = useLanding().objection;
  return <section id="why-now" className="border-b-2 border-foreground bg-background py-24">
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <p className="mb-4 inline-flex rounded-full border-2 border-foreground bg-accent px-3 py-1 text-sm font-bold uppercase">{o.eyebrow}</p>
      <div className="grid gap-8 lg:grid-cols-[1.1fr_.9fr] lg:items-end">
        <div>
          <blockquote className="font-display text-3xl font-bold leading-tight text-muted-foreground sm:text-4xl">{o.quote}</blockquote>
          <motion.p initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ type: "spring", stiffness: 140, damping: 18 }} className="mt-3 font-display text-5xl font-bold text-primary sm:text-6xl">{o.answer}</motion.p>
        </div>
        <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">{o.intro}</p>
      </div>

      {/* What we're for: better hiring, never fewer applications. */}
      <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ type: "spring", stiffness: 140, damping: 18 }}
        className="mt-14 rounded-xl border-2 border-foreground bg-primary p-6 text-primary-foreground shadow-hard sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[.9fr_1.1fr] lg:items-start">
          <div>
            <span className="grid size-11 place-items-center rounded-lg border-2 border-primary-foreground/60 bg-primary-foreground/15"><Target className="size-5" /></span>
            <h3 className="mt-4 font-display text-3xl font-bold leading-tight sm:text-4xl">{o.goal.title}</h3>
            <p className="mt-3 max-w-md leading-relaxed opacity-90">{o.goal.lead}</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">{o.goal.points.map((g) => <li key={g.title} className="rounded-lg border-2 border-primary-foreground/30 bg-primary-foreground/10 p-4">
            <p className="flex items-center gap-2 font-bold"><Check className="size-4 shrink-0" />{g.title}</p>
            <p className="mt-1.5 text-sm leading-relaxed opacity-85">{g.copy}</p>
          </li>)}</ul>
        </div>
      </motion.div>

      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{o.reasons.map((r, i) => {
        const Icon = ICONS[i] ?? Pin;
        return <motion.article key={r.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ delay: (i % 3) * 0.08, type: "spring", stiffness: 140, damping: 18 }}
          className="card-lift flex flex-col rounded-xl border-2 border-foreground bg-card p-6 shadow-hard-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="grid size-11 place-items-center rounded-lg border-2 border-foreground bg-primary text-primary-foreground"><Icon className="size-5" /></span>
            <span className="rounded-full border-2 border-foreground/20 px-2.5 py-0.5 text-[11px] font-bold uppercase text-muted-foreground">{r.tag}</span>
          </div>
          <h3 className="mt-4 font-display text-2xl font-bold">{r.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{r.copy}</p>
        </motion.article>;
      })}</div>

      {/* How one story compounds: a real sequence, so it's numbered as one. */}
      <div className="mt-16 rounded-xl border-2 border-foreground bg-secondary p-6 shadow-hard sm:p-8">
        <h3 className="font-display text-2xl font-bold sm:text-3xl">{o.compounds}</h3>
        <ol className="mt-6 grid gap-6 md:grid-cols-4">{o.timeline.map((t, i) => <motion.li key={t.when} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.12 }} className="relative">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-foreground bg-primary font-display font-bold text-primary-foreground">{i + 1}</span>
            {i < o.timeline.length - 1 && <span aria-hidden="true" className="hidden h-0.5 flex-1 bg-foreground/25 md:block" />}
          </div>
          <p className="mt-3 text-sm font-bold uppercase text-primary">{t.when}</p>
          <p className="mt-1 text-sm leading-relaxed">{t.what}</p>
        </motion.li>)}</ol>
      </div>

      <div className="mt-12 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
        <div><p className="text-lg text-muted-foreground">{o.closer.line}</p><p className="mt-1 font-display text-3xl font-bold sm:text-4xl">{o.closer.punch}</p></div>
        <Button size="lg" asChild className="shrink-0"><Link to="/auth">{o.closer.cta}<ArrowRight /></Link></Button>
      </div>
    </div>
  </section>;
}
