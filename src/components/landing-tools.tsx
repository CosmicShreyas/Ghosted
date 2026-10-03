// Two free tools under the Ghost-o-meter, no account needed: a timeline checker ("is this wait
// normal for this round?") and a follow-up writer. Both run in the browser; nothing is sent except
// an anonymous daily "a tool was used" count.
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CalendarClock, Check, Copy, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/api";
import { cn } from "@/lib/utils";

type Stage = "application" | "screening" | "technical" | "final" | "offer";
const STAGES: { id: Stage; label: string; usual: number; what: string }[] = [
  { id: "application", label: "Applied", usual: 14, what: "hearing back on an application" },
  { id: "screening", label: "Recruiter call", usual: 7, what: "a reply after a recruiter call" },
  { id: "technical", label: "Technical round", usual: 7, what: "a reply after a technical round" },
  { id: "final", label: "Final round", usual: 10, what: "a decision after a final round" },
  { id: "offer", label: "Offer talks", usual: 5, what: "a reply during offer talks" },
];

const field = "h-11 w-full rounded-lg border-2 border-foreground bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Chips({ value, onChange, label }: { value: Stage; onChange: (s: Stage) => void; label: string }) {
  return <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">{STAGES.map((s) => <button key={s.id} type="button" role="radio" aria-checked={value === s.id} onClick={() => onChange(s.id)}
    className={cn("min-h-10 rounded-full border-2 border-foreground px-3 text-xs font-bold transition-colors", value === s.id ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-muted")}>{s.label}</button>)}</div>;
}

function verdict(days: number, usual: number) {
  if (days <= usual) return { tone: "text-flag-green", title: "Still normal", copy: `Most replies at this stage land within about ${usual} days. Give it a little longer.` };
  if (days <= usual * 2) return { tone: "text-primary", title: "Getting slow", copy: `That's past the usual ${usual} days. A short, polite follow-up is fair now.` };
  return { tone: "text-flag-red", title: "Likely ghosted", copy: `That's more than twice the usual ${usual} days. Follow up once, then keep your other options moving.` };
}

function TimelineChecker() {
  const [stage, setStage] = useState<Stage>("technical");
  const [days, setDays] = useState(10);
  const s = STAGES.find((x) => x.id === stage)!;
  const v = verdict(days, s.usual);
  const max = Math.max(days, s.usual * 3);
  const reduce = useReducedMotion();
  const used = () => track("timeline_check");
  return <div className="flex flex-col rounded-xl border-2 border-foreground bg-card p-6 shadow-hard">
    <p className="flex items-center gap-2 font-display text-xl font-bold"><CalendarClock className="size-5 text-primary" />Is this wait normal?</p>
    <p className="mt-1 text-sm text-muted-foreground">Pick the round you're waiting on and how long it's been.</p>
    <div className="mt-5"><Chips label="Round" value={stage} onChange={(x) => { setStage(x); used(); }} /></div>
    <label className="mt-5 block text-sm font-bold" htmlFor="tl-days">Days since they last replied</label>
    <div className="mt-2 flex items-center gap-3">
      <input id="tl-days" type="number" inputMode="numeric" min={0} max={365} value={days} onChange={(e) => { setDays(Math.max(0, Math.min(365, Number(e.target.value) || 0))); used(); }} className={cn(field, "w-24 tabular-nums")} />
      <span className="text-sm text-muted-foreground">days</span>
    </div>
    {/* The wait against the usual: a track with a ball at "usual" and the bar filling to your days. */}
    <div className="relative mt-6 h-3 rounded-full bg-muted" aria-hidden="true">
      <motion.div className={cn("h-full rounded-full", days <= s.usual ? "bg-flag-green" : days <= s.usual * 2 ? "bg-primary" : "bg-flag-red")} initial={false} animate={{ width: `${(days / max) * 100}%` }} transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 160, damping: 22 }} />
      <span className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground bg-accent" style={{ left: `${(s.usual / max) * 100}%` }} />
    </div>
    <p className="mt-2 text-xs text-muted-foreground">The dot marks the usual wait for {s.what}.</p>
    <div className="mt-5 flex-1 rounded-lg border-2 border-foreground bg-background p-4" aria-live="polite">
      <p className={cn("font-display text-2xl font-bold", v.tone)}>{v.title}</p>
      <p className="mt-1 text-sm">{v.copy}</p>
    </div>
  </div>;
}

type Tone = "warm" | "brief" | "firm";
function message({ company, role, stage, days, tone }: { company: string; role: string; stage: Stage; days: number; tone: Tone }) {
  const co = company.trim() || "the team";
  const r = role.trim() ? ` for the ${role.trim()} role` : "";
  const step = { application: "my application", screening: "our recruiter call", technical: "the technical round", final: "the final round", offer: "the offer discussion" }[stage];
  const when = days === 1 ? "yesterday" : days > 0 ? `${days} days ago` : "recently";
  if (tone === "brief") return `Hi, following up on ${step}${r} at ${co} (${when}). Is there an update on next steps? Thanks!`;
  if (tone === "firm") return `Hello,\n\nI'm following up on ${step}${r} at ${co}, which was ${when}. I'm currently weighing other processes, so I'd appreciate knowing where things stand by the end of this week, even if the answer is no.\n\nThank you for your time.`;
  return `Hi,\n\nI hope you're doing well. I wanted to follow up on ${step}${r} at ${co}, ${when}. I really enjoyed learning about the team and I'm still very interested.\n\nCould you share an update on the next steps when you have a moment?\n\nThanks so much,`;
}

function FollowUpWriter() {
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [stage, setStage] = useState<Stage>("final");
  const [days, setDays] = useState(10);
  const [tone, setTone] = useState<Tone>("warm");
  const [copied, setCopied] = useState(false);
  const text = message({ company, role, stage, days, tone });
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); track("followup"); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked: the text is still selectable */ }
  };
  return <div className="flex flex-col rounded-xl border-2 border-foreground bg-card p-6 shadow-hard">
    <p className="flex items-center gap-2 font-display text-xl font-bold"><MessageSquareText className="size-5 text-primary" />Write my follow-up</p>
    <p className="mt-1 text-sm text-muted-foreground">Fill in what you know. The message updates as you type.</p>
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-bold">Company<input value={company} onChange={(e) => setCompany(e.target.value.slice(0, 60))} placeholder="e.g. Acme" className={cn(field, "mt-1 font-normal")} /></label>
      <label className="text-sm font-bold">Role <span className="font-normal text-muted-foreground">(optional)</span><input value={role} onChange={(e) => setRole(e.target.value.slice(0, 60))} placeholder="e.g. Product designer" className={cn(field, "mt-1 font-normal")} /></label>
    </div>
    <div className="mt-4"><Chips label="Round" value={stage} onChange={setStage} /></div>
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <label className="text-sm font-bold">Days ago<input type="number" inputMode="numeric" min={0} max={365} value={days} onChange={(e) => setDays(Math.max(0, Math.min(365, Number(e.target.value) || 0)))} className={cn(field, "mt-1 w-24 font-normal tabular-nums")} /></label>
      <div role="radiogroup" aria-label="Tone" className="flex gap-2">{(["warm", "brief", "firm"] as const).map((t) => <button key={t} type="button" role="radio" aria-checked={tone === t} onClick={() => setTone(t)}
        className={cn("min-h-11 rounded-full border-2 border-foreground px-4 text-xs font-bold capitalize transition-colors", tone === t ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>{t}</button>)}</div>
    </div>
    <AnimatePresence mode="wait" initial={false}><motion.pre key={tone} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
      className="mt-5 flex-1 whitespace-pre-wrap rounded-lg border-2 border-foreground bg-background p-4 font-sans text-sm leading-relaxed">{text}</motion.pre></AnimatePresence>
    <Button type="button" className="mt-4 w-full" onClick={() => void copy()}>{copied ? <><Check />Copied</> : <><Copy />Copy message</>}</Button>
  </div>;
}

export function LandingTools() {
  return <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
    <h2 className="text-3xl font-bold sm:text-4xl">Two more free tools</h2>
    <p className="mt-2 max-w-xl text-muted-foreground">Check whether your wait is normal for that round, then send a follow-up that sounds like you.</p>
    <div className="mt-8 grid gap-5 lg:grid-cols-2"><TimelineChecker /><FollowUpWriter /></div>
  </section>;
}
