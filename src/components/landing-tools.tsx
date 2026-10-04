// Two free tools under the Ghost-o-meter, no account needed: a timeline checker ("is this wait
// normal for this round?") and a follow-up writer. Both run in the browser; nothing is sent except
// an anonymous daily "a tool was used" count.
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CalendarClock, Check, Copy, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/api";
import { fill, landingCopy, useLanding, type LandingCopy } from "@/content/landing-copy";
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
  const T = useLanding().tools;
  return <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">{STAGES.map((s) => <button key={s.id} type="button" role="radio" aria-checked={value === s.id} onClick={() => onChange(s.id)}
    className={cn("min-h-10 rounded-full border-2 border-foreground px-3 text-xs font-bold transition-colors", value === s.id ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-muted")}>{T.rounds[s.id]}</button>)}</div>;
}

function verdict(T: LandingCopy["tools"], days: number, usual: number) {
  const v = (x: { title: string; copy: string; next: string }, tone: string) => ({ tone, title: x.title, copy: fill(x.copy, { days, usual }), next: fill(x.next, { days, usual }) });
  if (days === 0) return v(T.v0, "text-flag-green");
  if (days <= usual) return v(T.v1, "text-flag-green");
  if (days <= usual * 2) return v(T.v2, "text-primary");
  return v(T.v3, "text-flag-red");
}

function TimelineChecker() {
  const T = useLanding().tools;
  const [stage, setStage] = useState<Stage>("technical");
  const [days, setDays] = useState(10);
  const s = STAGES.find((x) => x.id === stage)!;
  const v = verdict(T, days, s.usual);
  const max = Math.max(days, s.usual * 3);
  const reduce = useReducedMotion();
  const used = () => track("timeline_check");
  return <div className="flex flex-col rounded-xl border-2 border-foreground bg-card p-6 shadow-hard">
    <p className="flex items-center gap-2 font-display text-xl font-bold"><CalendarClock className="size-5 text-primary" />{T.checkTitle}</p>
    <p className="mt-1 text-sm text-muted-foreground">{T.checkCopy}</p>
    <p className="mt-5 text-sm font-bold">{T.where}</p>
    <div className="mt-2"><Chips label={T.where} value={stage} onChange={(x) => { setStage(x); used(); }} /></div>
    <label className="mt-5 block text-sm font-bold" htmlFor="tl-days">{T.silence}</label>
    <div className="mt-2 flex items-center gap-3">
      <input id="tl-days" type="number" inputMode="numeric" min={0} max={365} value={days} onChange={(e) => { setDays(Math.max(0, Math.min(365, Number(e.target.value) || 0))); used(); }} className={cn(field, "w-24 tabular-nums")} />
      <span className="text-sm text-muted-foreground">{days === 1 ? T.inboxOne : T.inboxMany}</span>
    </div>
    {/* The wait against the usual: a track with a ball at "usual" and the bar filling to your days. */}
    <div className="relative mt-6 h-3 rounded-full bg-muted" aria-hidden="true">
      <motion.div className={cn("h-full rounded-full", days <= s.usual ? "bg-flag-green" : days <= s.usual * 2 ? "bg-primary" : "bg-flag-red")} initial={false} animate={{ width: `${(days / max) * 100}%` }} transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 160, damping: 22 }} />
      <span className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground bg-accent" style={{ left: `${(s.usual / max) * 100}%` }} />
    </div>
    <p className="mt-2 text-xs text-muted-foreground">{fill(T.dot, { what: T.what[s.id] })}</p>
    <div className="mt-5 flex flex-1 flex-col rounded-lg border-2 border-foreground bg-background p-4" aria-live="polite">
      <p className="text-xs font-bold text-muted-foreground">{T.verdict}</p>
      <p className={cn("mt-1 font-display text-2xl font-bold", v.tone)}>{v.title}</p>
      <p className="mt-1 text-sm">{v.copy}</p>
      <p className="mt-auto border-t-2 border-foreground/15 pt-3 text-sm font-semibold"><span className="text-muted-foreground">{T.todo}</span>{v.next}</p>
    </div>
  </div>;
}

type Tone = "warm" | "brief" | "firm";
function message({ company, role, stage, days, tone }: { company: string; role: string; stage: Stage; days: number; tone: Tone }) {
  const co = company.trim();
  const at = co ? ` at ${co}` : "";
  const r = role.trim() ? ` for the ${role.trim()} role` : "";
  const step = { application: "my application", screening: "our recruiter call", technical: "the technical round", final: "the final round", offer: "the offer discussion" }[stage];
  const when = days === 1 ? "yesterday" : days > 0 ? `${days} days ago` : "recently";
  if (tone === "brief") return `Hi! Quick nudge on ${step}${r}${at} from ${when}. Any update on next steps? Happy to share anything else you need.\n\nThanks,`;
  if (tone === "firm") return `Hello,\n\nI'm following up on ${step}${r}${at}, ${when}. I have other processes moving forward, so it would help to know where I stand by the end of this week. A clear no is completely fine; I'd just rather not guess.\n\nThanks for your time,`;
  return `Hi,\n\nHope your week's going well! I wanted to check in on ${step}${r}${at}, ${when}. I enjoyed the conversation${co ? ` and I'm still genuinely excited about ${co}` : " and I'm still genuinely excited about the role"}.\n\nWhenever you get a moment, could you share where things stand and what the next step looks like?\n\nThanks so much,`;
}

function FollowUpWriter() {
  const L = useLanding();
  const T = L.tools;
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
    <p className="flex items-center gap-2 font-display text-xl font-bold"><MessageSquareText className="size-5 text-primary" />{T.pokeTitle}</p>
    <p className="mt-1 text-sm text-muted-foreground">{T.pokeCopy}</p>
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-bold">{T.company}<input value={company} onChange={(e) => setCompany(e.target.value.slice(0, 60))} placeholder={T.companyHint} className={cn(field, "mt-1 font-normal")} /></label>
      <label className="text-sm font-bold">{T.role} <span className="font-normal text-muted-foreground">{T.optional}</span><input value={role} onChange={(e) => setRole(e.target.value.slice(0, 60))} placeholder={T.roleHint} className={cn(field, "mt-1 font-normal")} /></label>
    </div>
    <p className="mt-4 text-sm font-bold">{T.last}</p>
    <div className="mt-2"><Chips label={T.last} value={stage} onChange={setStage} /></div>
    <div className="mt-5 grid gap-4">
      <label className="flex items-center gap-4 text-sm font-bold">{T.ago}
        <span className="flex items-center gap-2 font-normal"><input type="number" inputMode="numeric" min={0} max={365} value={days} onChange={(e) => setDays(Math.max(0, Math.min(365, Number(e.target.value) || 0)))} className={cn(field, "w-20 tabular-nums")} /><span className="text-muted-foreground">{days === 1 ? L.meter.day : L.meter.days}</span></span>
      </label>
      <div className="flex flex-col gap-2 text-sm font-bold">{T.mood}
        <div role="radiogroup" aria-label={T.mood} className="flex flex-wrap gap-2">{(["warm", "brief", "firm"] as const).map((t) => [t, T.moods[t]] as const).map(([t, label]) => <button key={t} type="button" role="radio" aria-checked={tone === t} onClick={() => setTone(t)}
          className={cn("min-h-11 rounded-full border-2 border-foreground px-4 text-xs font-bold transition-colors", tone === t ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>{label}</button>)}</div>
      </div>
    </div>
    <AnimatePresence mode="wait" initial={false}><motion.pre key={tone} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
      lang="en" className="mt-5 flex-1 whitespace-pre-wrap rounded-lg border-2 border-foreground bg-background p-4 font-sans text-sm leading-relaxed">{text}</motion.pre></AnimatePresence>
    {L !== landingCopy("en") && <p className="mt-2 text-xs text-muted-foreground">{T.englishNote}</p>}
    <Button type="button" className="mt-4 w-full" onClick={() => void copy()}>{copied ? <><Check />{T.copiedPoke}</> : <><Copy />{T.copyPoke}</>}</Button>
  </div>;
}

export function LandingTools() {
  const T = useLanding().tools;
  return <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
    <h2 className="text-3xl font-bold sm:text-4xl">{T.title}</h2>
    <p className="mt-2 max-w-xl text-muted-foreground">{T.copy}</p>
    <div className="mt-8 grid gap-5 lg:grid-cols-2"><TimelineChecker /><FollowUpWriter /></div>
  </section>;
}
