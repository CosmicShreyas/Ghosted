import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CheckCheck, EyeOff, Flag, Lock, ShieldCheck, Shuffle } from "lucide-react";
import { Avatar } from "@/components/ghosted";
import { authInbox, authPromises, authTestimonials, users } from "@/mock/data";

// Cycles through `length` items every `ms`, paused while `paused` is true.
function useTicker(length: number, ms: number, paused: boolean) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (paused) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % length), ms);
    return () => window.clearInterval(t);
  }, [length, ms, paused]);
  return [i, setI] as const;
}

function RecruiterInbox() {
  const reduce = useReducedMotion();
  const [i] = useTicker(authInbox.length, 3400, !!reduce);
  const msg = authInbox[i]!;
  return <div className="relative">
    <p className="mb-3 text-xs font-bold uppercase opacity-70">Live from a recruiter's outbox</p>
    <div className="relative h-44">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={i} initial={{ opacity: 0, y: 40, rotate: 2, scale: 0.96 }} animate={{ opacity: 1, y: 0, rotate: -1.5, scale: 1 }} exit={{ opacity: 0, y: -30, rotate: -6, scale: 0.94 }} transition={{ type: "spring", stiffness: 260, damping: 22 }} className="absolute inset-x-0 top-0 rounded-xl border-2 border-foreground bg-card p-4 text-foreground shadow-hard">
          <div className="flex items-center justify-between text-xs"><span className="font-bold">{msg.from}</span><span className="flex items-center gap-1 text-muted-foreground"><CheckCheck className="size-3.5 text-primary" />{msg.status}</span></div>
          <p className="mt-2 font-display text-xl font-bold">“{msg.text}”</p>
          <motion.p initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.45 }} className="mt-3 flex items-start gap-2 border-t-2 border-dashed border-foreground/30 pt-3 text-sm"><span className="shrink-0 rounded-full bg-flag-red px-2 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">Translation</span>{msg.truth}</motion.p>
        </motion.div>
      </AnimatePresence>
    </div>
  </div>;
}

// Counts up live from a fixed "we'll get back to you". Starts after mount so SSR and client match.
const GHOSTED_FOR = 34 * 86400 + 6 * 3600 + 12 * 60; // 34 days, 6 h, 12 min when you arrive

function GhostingClock() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, []);
  const total = GHOSTED_FOR + elapsed;
  const d = Math.floor(total / 86400), h = Math.floor((total % 86400) / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return <div className="rounded-xl border-2 border-foreground bg-foreground p-4 text-background shadow-hard">
    <p className="text-[11px] font-bold uppercase opacity-70">Time since “we'll get back to you”</p>
    <p className="mt-1 font-display text-3xl font-bold tabular-nums" aria-live="off">{d}d {pad(h)}:{pad(m)}:{pad(s)}</p>
    <p className="mt-1 text-xs opacity-70">Still counting. Their calendar invite said “quick sync”.</p>
  </div>;
}

const shields = [
  { icon: Lock, title: "Name encrypted", copy: "Even we can't read it without the key." },
  { icon: Shuffle, title: "Random handle", copy: "“Unbothered Falcon” tells HR nothing." },
  { icon: EyeOff, title: "No employer access", copy: "Companies can't buy, beg or bribe your name." },
];

function Shields() {
  return <div className="grid grid-cols-3 gap-3">{shields.map(({ icon: Icon, title, copy }, n) => <motion.div key={title} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + n * 0.12, type: "spring", stiffness: 220, damping: 20 }} whileHover={{ y: -4, rotate: n === 1 ? 0 : n ? 1.5 : -1.5 }} className="rounded-xl border-2 border-foreground bg-card p-3 text-foreground shadow-hard-sm">
    <Icon className="size-5 text-primary" />
    <p className="mt-2 text-sm font-bold leading-tight">{title}</p>
    <p className="mt-1 text-xs leading-snug text-muted-foreground">{copy}</p>
  </motion.div>)}</div>;
}

function Testimonials() {
  const [paused, setPaused] = useState(false);
  const [i, setI] = useTicker(authTestimonials.length, 5200, paused);
  const t = authTestimonials[i]!;
  return <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
    <AnimatePresence mode="wait">
      <motion.figure key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.35 }}>
        <blockquote className="max-w-xl font-display text-3xl font-bold leading-tight xl:text-4xl">“{t.quote}”</blockquote>
        <figcaption className="mt-3 text-sm opacity-75">{t.who}</figcaption>
      </motion.figure>
    </AnimatePresence>
    <div className="mt-5 flex gap-2">{authTestimonials.map((_, n) => <button key={n} type="button" aria-label={`Show testimonial ${n + 1}`} aria-current={n === i} onClick={() => setI(n)} className="h-2 overflow-hidden rounded-full border border-primary-foreground transition-all" style={{ width: n === i ? 40 : 8 }}>{n === i && !paused && <motion.span key={i} className="block h-full bg-primary-foreground" initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ duration: 5.2, ease: "linear" }} />}{n === i && paused && <span className="block h-full w-full bg-primary-foreground" />}</button>)}</div>
  </div>;
}

function Promises() {
  const items = [...authPromises, ...authPromises];
  return <div className="overflow-hidden border-y-2 border-primary-foreground/40 py-3"><div className="marquee-track flex w-max items-center">{items.map((p, n) => <span key={n} className="flex items-center gap-2 whitespace-nowrap px-4 text-sm font-bold"><ShieldCheck className="size-4" />{p}</span>)}</div></div>;
}

export function AuthShowcase() {
  return <aside className="relative hidden overflow-hidden border-l-2 border-foreground bg-primary text-primary-foreground lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
    <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full border-2 border-dashed border-primary-foreground/25 hero-orbit" />
    <div className="flex flex-1 flex-col justify-between gap-10 p-10 xl:p-12">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 font-display text-2xl font-bold"><Flag />Truth travels better anonymously.</p>
        <div className="flex -space-x-3">{users.slice(3, 8).map((u, n) => <motion.div key={u.id} animate={{ y: [0, -6, 0] }} transition={{ duration: 2.6, repeat: Infinity, delay: n * 0.25, ease: "easeInOut" }}><Avatar {...u} size="sm" label={u.handle} /></motion.div>)}</div>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[1.3fr_1fr]">
        <RecruiterInbox />
        <div className="xl:pt-7"><GhostingClock /></div>
      </div>
      <div><p className="mb-3 text-xs font-bold uppercase opacity-70">How you stay hidden</p><Shields /></div>
      <Testimonials />
    </div>
    <Promises />
    <p className="px-10 py-4 text-xs opacity-70 xl:px-12">Freshly launched. Your story could be the first receipt. HR has left the chat.</p>
  </aside>;
}
