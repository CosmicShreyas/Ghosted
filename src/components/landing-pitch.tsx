import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { ArrowRight, EyeOff, Receipt, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { landingPitch } from "@/mock/data";

const pillarIcons = [Receipt, EyeOff, ShieldCheck];

// One manifesto line that brightens as it scrolls through the middle of the screen.
function ManifestoLine({ text, index, total, progress, last }: { text: string; index: number; total: number; progress: MotionValue<number>; last: boolean }) {
  const start = index / total, end = (index + 1) / total;
  const opacity = useTransform(progress, [start - 0.1, start + 0.05, end + 0.1], [0.2, 1, last ? 1 : 0.45]);
  return <motion.p style={{ opacity }} className={last ? "font-display text-3xl font-bold text-primary sm:text-5xl" : "font-display text-2xl font-bold sm:text-4xl"}>{text}</motion.p>;
}

// Landing-page billboard: the marketing pitch (copy in mock/data.ts → landingPitch).
export function LandingPitch() {
  const p = landingPitch;
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 80%", "end 45%"] });

  return <section id="pitch" className="relative overflow-hidden border-y-2 border-foreground bg-foreground py-24 text-background">
    <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-32 size-96 rounded-full border-2 border-dashed border-background/15 hero-orbit" />
    <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
      <p className="mb-4 inline-flex items-center gap-2 rounded-full border-2 border-background/40 px-3 py-1 text-sm font-bold uppercase">{p.eyebrow}</p>
      <h2 className="max-w-4xl text-5xl font-bold leading-[1.02] sm:text-7xl">
        <span className="block">{p.headline[0]}</span>
        <motion.span initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.15, type: "spring", stiffness: 120, damping: 18 }} className="block text-primary">{p.headline[1]}</motion.span>
      </h2>

      <div ref={ref} className="mt-14 max-w-3xl space-y-3 border-l-4 border-primary pl-6">
        {p.manifesto.map((line, i) => <ManifestoLine key={line} text={line} index={i} total={p.manifesto.length} progress={scrollYProgress} last={i === p.manifesto.length - 1} />)}
      </div>

      <div className="mt-16 grid gap-5 md:grid-cols-3">{p.pillars.map((pillar, i) => {
        const Icon = pillarIcons[i] ?? Receipt;
        return <motion.article key={pillar.title} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ delay: i * 0.1, type: "spring", stiffness: 140, damping: 18 }} className="card-lift flex flex-col rounded-xl border-2 border-background bg-card p-6 text-foreground shadow-[6px_6px_0_var(--primary)]">
          <span className="grid size-11 place-items-center rounded-lg border-2 border-foreground bg-accent"><Icon className="size-5" /></span>
          <h3 className="mt-4 font-display text-2xl font-bold">{pillar.title}</h3>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{pillar.copy}</p>
          <div className="mt-5 flex items-baseline gap-2 border-t-2 border-dashed border-foreground/20 pt-4"><strong className="font-display text-4xl text-primary">{pillar.stat}</strong><span className="text-xs font-bold uppercase text-muted-foreground">{pillar.statLabel}</span></div>
        </motion.article>;
      })}</div>

      <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mt-16 flex flex-col items-start justify-between gap-6 rounded-xl border-2 border-background/30 p-6 sm:p-8 md:flex-row md:items-center">
        <div><p className="text-lg text-background/70">{p.closer.line}</p><p className="mt-1 font-display text-3xl font-bold sm:text-4xl">{p.closer.punch}</p></div>
        <Button size="lg" asChild className="shrink-0"><Link to="/auth">{p.closer.cta}<ArrowRight /></Link></Button>
      </motion.div>
    </div>
  </section>;
}
