// "Share a story": four steps, and the first choice decides everything after it.
//   1. What happened   how it ended (and, for an offer, whether you joined), the company, the role
//   2. The details     only what fits that journey: the stage and wait for people who were never
//                      hired, pay for offers, culture and growth only for people who joined
//   3. In your words   a title written from your taps, prompts that fit, or skip it entirely and
//                      post a quick story built from the taps
//   4. Review and post exactly how it'll look in the feed, the human check, and Post
// Drafts save themselves in this browser. The API checks the same rules (backend/src/score.ts).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft, ArrowRight, Bold, Briefcase, Building2, Check, ClipboardCheck, Code, Eye, SquareCode, FileSearch, Ghost, Heading, Italic, List, ListOrdered,
  Loader2, MessageSquareQuote, PartyPopper, PenLine, Plus, Sparkles, Star, Strikethrough, Undo2, Wand2, XCircle, Zap, IndianRupee, ChevronDown, Shuffle, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, CompanyMark, FlagScore, QuickBadge } from "@/components/ghosted";
import { HumanCheck, useHumanCheck } from "@/components/human-check";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CompanyPicker } from "@/components/company-picker";
import { speak } from "@/lib/goofy";
import { api, ApiRequestError, apiEnabled } from "@/lib/api";
import { liveNudge } from "@/lib/live";
import { displayName, isPublic, useMe, useTone, voice } from "@/lib/session";
import { useCompanyIndex, type StoryModel } from "@/lib/stories";
import { journey, storyScore, type Dimension, type Outcome } from "@/lib/score";
import { cn } from "@/lib/utils";
import { ListCompanyDialog } from "./list-company";
import { ShareCard } from "./share-card";
import { quickStory } from "@/lib/quick-story";
import { useFounding } from "@/lib/founding";
import { popup, popupBody, scoreTone } from "./ui-kit";
import { useComposer, type ComposerCopy } from "@/content/composer-copy";
import { fill } from "@/content/landing-copy";
import { useFit } from "@/components/fit";

// ---------- options ----------

const STAGES: { id: string; label: string; word: string; icon: LucideIcon }[] = [
  { id: "application", label: "Applied", word: "application", icon: FileSearch },
  { id: "screening", label: "Screening call", word: "screening call", icon: MessageSquareQuote },
  { id: "technical", label: "Technical round", word: "technical round", icon: Briefcase },
  { id: "final", label: "Final round", word: "final round", icon: Building2 },
  { id: "offer", label: "Offer stage", word: "offer stage", icon: ClipboardCheck },
];

const OUTCOMES: { id: Outcome; label: string; icon: LucideIcon; blurb: string; tone: string }[] = [
  { id: "ghosted", label: "Ghosted", icon: Ghost, blurb: "They stopped replying", tone: "text-flag-red" },
  { id: "rejected", label: "Rejected", icon: XCircle, blurb: "A no, at least", tone: "text-flag-amber" },
  { id: "ghost_job", label: "Ghost job", icon: FileSearch, blurb: "The role never really existed", tone: "text-flag-red" },
  { id: "offer_revoked", label: "Offer revoked", icon: Undo2, blurb: "Offered, then un-offered", tone: "text-flag-red" },
  { id: "offer", label: "Got an offer", icon: PartyPopper, blurb: "The rare happy ending", tone: "text-flag-green" },
];

const STAR_TONE = ["", "text-flag-red", "text-flag-red", "text-flag-amber", "text-flag-green", "text-flag-green"];

// Wait chips map to these day counts; the exact number can be typed instead.
const WAITS = [{ label: "Under a week", days: 5 }, { label: "1 to 2 weeks", days: 10 }, { label: "2 to 4 weeks", days: 21 }, { label: "1 to 2 months", days: 45 }, { label: "2+ months", days: 75 }];
const waitPhrase = (days: number) => (days < 7 ? "under a week" : days <= 14 ? "1 to 2 weeks" : days <= 30 ? "2 to 4 weeks" : days <= 60 ? "1 to 2 months" : "over 2 months");

const STEPS = [
  { id: "what", label: "What happened" },
  { id: "details", label: "The details" },
  { id: "words", label: "In your words" },
  { id: "post", label: "Review and post" },
] as const;

const ROLE_MAX = 140;
const tap = "min-h-11"; // 44px tap targets

// ---------- draft ----------

type Draft = {
  company: string; stage: string; role: string; outcome: Outcome | ""; joined: "" | "yes" | "no";
  title: string; titleTouched: boolean; body: string; quick: boolean;
  ratings: Record<Dimension, number>; min: string; max: string; days: string; showSalary: boolean;
};
const EMPTY: Draft = { company: "", stage: "", role: "", outcome: "", joined: "", title: "", titleTouched: false, body: "", quick: false, ratings: { hiring: 0, communication: 0, culture: 0, pay: 0, growth: 0 }, min: "", max: "", days: "", showSalary: false };

const DRAFT_KEY = "ghosted.storyDraft.v2";
const OLD_DRAFT_KEY = "ghosted.storyDraft";
const loadDraft = (): Draft | null => {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null") as Partial<Draft> | null;
    if (d && typeof d === "object") return { ...EMPTY, ...d, ratings: { ...EMPTY.ratings, ...d.ratings } };
    // A draft from the old four-step form: keep what still fits (it never asked about joining).
    const old = JSON.parse(localStorage.getItem(OLD_DRAFT_KEY) ?? "null") as (Partial<Draft> & { outcome?: string }) | null;
    localStorage.removeItem(OLD_DRAFT_KEY);
    if (!old || typeof old !== "object") return null;
    const migrated: Draft = { ...EMPTY, company: old.company ?? "", stage: old.stage ?? "", role: old.role ?? "", outcome: (OUTCOMES.some((o) => o.id === old.outcome) ? old.outcome : "") as Draft["outcome"], title: old.title ?? "", titleTouched: !!old.title, body: old.body ?? "", ratings: { ...EMPTY.ratings, ...old.ratings }, min: old.min ?? "", max: old.max ?? "", days: old.days ?? "", showSalary: !!(old.min || old.max) };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(migrated));
    return migrated;
  } catch { return null; }
};
const saveDraft = (d: Draft) => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* storage blocked */ } };
const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); localStorage.removeItem(OLD_DRAFT_KEY); } catch { /* storage blocked */ } };
const isBlank = (d: Draft) => JSON.stringify(d) === JSON.stringify(EMPTY);

// ---------- the journey ----------

const offerish = (o: Draft["outcome"]) => o === "offer" || o === "offer_revoked";
const neverHired = (o: Draft["outcome"]) => o === "ghosted" || o === "rejected" || o === "ghost_job";
const journeyOf = (d: Draft) => journey((d.outcome || "ghosted") as Outcome, d.joined === "yes");
const stageOf = (d: Draft) => (offerish(d.outcome) ? "offer" : d.stage);
const stageWord = (d: Draft) => STAGES.find((s) => s.id === stageOf(d))?.word ?? "process";
const daysOf = (d: Draft) => (d.days === "" ? null : Number(d.days));

// A title written from the taps; nothing invented.
function autoTitle(d: Draft): string {
  const days = daysOf(d);
  const wait = days != null && neverHired(d.outcome) ? `, waited ${waitPhrase(days)}` : "";
  switch (d.outcome) {
    case "ghosted": return `Ghosted after the ${stageWord(d)}${wait}`;
    case "rejected": return `Rejected after the ${stageWord(d)}${wait}`;
    case "ghost_job": return `Applied to a ghost job${wait}`;
    case "offer_revoked": return "Got an offer, then it was revoked";
    case "offer": return d.joined === "yes" ? "Got the offer and joined" : "Got an offer, didn't join";
    default: return "";
  }
}

// The quick story: natural, varied wording built only from the taps (src/lib/quick-story.ts).
const autoBody = (d: Draft, companyName: string) => quickStory({
  outcome: (d.outcome || "ghosted") as Outcome, company: companyName, stage: stageOf(d) || null, days: neverHired(d.outcome) ? daysOf(d) : null,
  joined: d.outcome === "offer" ? d.joined === "yes" : null, role: d.role.trim() || null,
  ratings: Object.fromEntries(journeyOf(d).ratings.filter((k) => d.ratings[k] > 0).map((k) => [k, d.ratings[k]])),
});

// Writing prompts (and placeholders) come from src/content/composer-copy.ts, in the chosen language.
const promptsIn = (C: ComposerCopy, d: Draft): string[] => (d.outcome === "offer" && d.joined === "yes" ? C.prompts.joined : d.outcome ? C.prompts[d.outcome] : []);

// ---------- markdown editor ----------

function MarkdownEditor({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const C = useComposer();
  const f = useFit();
  const [tab, setTab] = useState<"write" | "preview">("write");
  const wrap = (before: string, after = before, fallback = "text") => {
    const el = ref.current; if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const picked = value.slice(s, e) || fallback;
    onChange(value.slice(0, s) + before + picked + after + value.slice(e));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + before.length, s + before.length + picked.length); });
  };
  const lines = (prefix: (i: number) => string) => {
    const el = ref.current; if (!el) return;
    const s = value.lastIndexOf("\n", el.selectionStart - 1) + 1;
    const e = el.selectionEnd;
    const block = value.slice(s, e) || "";
    const next = block.split("\n").map((l, i) => prefix(i) + l.replace(/^(#{1,6}\s|>\s|[-*]\s|\d+\.\s)/, "")).join("\n");
    onChange(value.slice(0, s) + next + value.slice(e));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + next.length, s + next.length); });
  };
  const tools: { icon: LucideIcon; label: string; run: () => void }[] = [
    { icon: Bold, label: C.tools.bold, run: () => wrap("**") },
    { icon: Italic, label: C.tools.italic, run: () => wrap("_") },
    { icon: Strikethrough, label: C.tools.strike, run: () => wrap("~~") },
    { icon: Heading, label: C.tools.heading, run: () => lines(() => "### ") },
    { icon: List, label: C.tools.bullets, run: () => lines(() => "- ") },
    { icon: ListOrdered, label: C.tools.numbers, run: () => lines((i) => `${i + 1}. `) },
    { icon: MessageSquareQuote, label: C.tools.quote, run: () => lines(() => "> ") },
    { icon: Code, label: C.tools.code, run: () => wrap("`", "`", "code") },
    { icon: SquareCode, label: C.tools.block, run: () => wrap("\n```\n", "\n```\n", "your code here") },
  ];
  const onKey = (e: React.KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.key === "b") { e.preventDefault(); wrap("**"); }
    if (e.key === "i") { e.preventDefault(); wrap("_"); }
  };
  return <div className="overflow-hidden rounded-lg border-2 border-foreground bg-background focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-card">
    <div className="flex flex-wrap items-center gap-1 border-b-2 border-foreground bg-muted/60 px-1.5 py-1">
      <div className="relative mr-1 grid grid-cols-2 rounded-full border-2 border-foreground bg-card p-0.5 text-xs font-bold">
        <motion.span aria-hidden="true" className="absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-full bg-primary" initial={false} animate={{ x: tab === "write" ? "0%" : "100%" }} transition={{ type: "spring", stiffness: 420, damping: 34 }} />
        {(["write", "preview"] as const).map((t) => <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t} className={cn("relative z-10 inline-flex items-center justify-center gap-1 rounded-full px-2.5 py-1 capitalize transition-colors duration-200", tab === t ? "text-primary-foreground" : "text-foreground hover:text-primary")}>
          {t === "write" ? <PenLine className="size-3.5" /> : <Eye className="size-3.5" />}{f.c((c) => (t === "write" ? c.write : c.preview))}
        </button>)}
      </div>
      {tab === "write" && tools.map(({ icon: Icon, label, run }) => <button key={label} type="button" onClick={run} title={label} aria-label={label} className="grid size-8 place-items-center rounded-full border-2 border-transparent text-foreground transition-colors hover:border-foreground hover:bg-card"><Icon className="size-4" /></button>)}
    </div>
    {tab === "write"
      ? <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey} maxLength={4000} rows={9} placeholder={placeholder} className="block min-h-48 w-full resize-y bg-transparent px-3 py-2.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground" />
      : <div className="min-h-48 px-3 py-2.5 text-[15px]">{value.trim() ? <Markdown text={value} /> : <p className="text-muted-foreground">{C.nothingPreview}</p>}</div>}
  </div>;
}

// ---------- bits ----------

function StepHeader({ step, title, subtitle }: { step: number; title: ReactNode; subtitle: ReactNode }) {
  const C = useComposer();
  return <DialogHeader className="pr-8 text-left">
    <p className="text-xs font-bold uppercase tracking-wide text-primary">{fill(C.stepOf, { n: step + 1, total: STEPS.length })}</p>
    <DialogTitle className="font-display text-2xl">{title}</DialogTitle>
    <DialogDescription>{subtitle}</DialogDescription>
  </DialogHeader>;
}

function Progress({ step, reached, onJump }: { step: number; reached: number; onJump: (i: number) => void }) {
  const C = useComposer();
  const f = useFit();
  return <ol className="mt-5 grid grid-cols-4 gap-1.5" aria-label={C.progress}>{STEPS.map((s, i) => <li key={s.id}>
    <button type="button" disabled={i > reached} onClick={() => onJump(i)} className="group w-full text-left disabled:cursor-not-allowed" aria-current={i === step ? "step" : undefined}>
      <span className="block h-2 overflow-hidden rounded-full border-2 border-foreground bg-card">
        <motion.span className="block h-full bg-primary" initial={false} animate={{ width: i < step ? "100%" : i === step ? "55%" : "0%" }} transition={{ type: "spring", stiffness: 200, damping: 26 }} />
      </span>
      <span className={cn("mt-1 hidden items-center gap-1 text-[11px] font-bold sm:flex", i === step ? "text-foreground" : i < step ? "text-primary" : "text-muted-foreground")}>{i < step && <Check className="size-3" />}{f.c((c) => c.steps[s.id])}</span>
    </button>
  </li>)}</ol>;
}

function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3"><span className="text-sm font-bold">{children}</span>{hint && <span className="text-xs text-muted-foreground">{hint}</span>}</div>;
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <motion.button type="button" onClick={onClick} aria-pressed={on} whileTap={{ scale: 0.96 }}
    className={cn(tap, "rounded-full border-2 border-foreground px-3.5 text-sm font-bold transition-colors", on ? "bg-primary text-primary-foreground shadow-hard-sm" : "bg-card hover:bg-muted")}>{children}</motion.button>;
}

function Stars({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const [hover, setHover] = useState(0);
  const C = useComposer();
  const f = useFit();
  const shown = hover || value;
  return <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
    <div className="flex" role="radiogroup" aria-label={label}>{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={fill(C.starOf, { n, word: C.stars[n] ?? "" })} onMouseEnter={() => setHover(n)} onFocus={() => setHover(n)} onBlur={() => setHover(0)} onClick={() => onChange(n)} className="grid size-11 place-items-center sm:size-10">
      <motion.span className="block" animate={{ scale: n <= shown ? 1.12 : 1 }} transition={{ type: "spring", stiffness: 500, damping: 20 }}>
        <Star className={cn("size-6 transition-colors sm:size-7", n <= shown ? "fill-flag-amber text-foreground" : "text-muted-foreground")} strokeWidth={n <= shown ? 1.5 : 2} />
      </motion.span>
    </button>)}</div>
    {/* Sized for the longest word in English, so the stars never shift as you hover. */}
    <span className={cn("min-w-12 text-xs font-bold", STAR_TONE[shown])}>{shown ? f.c((c) => c.stars[shown] ?? "") : null}</span>
  </div>;
}

// ---------- the flow ----------

// A story being edited → the draft it starts from (the company can't change).
const draftFrom = (s: StoryModel): Draft => ({
  ...EMPTY,
  company: s.company.id, stage: s.stage ?? "", role: s.role ?? "", outcome: s.outcome as Outcome, title: s.title ?? "", titleTouched: true, body: s.body,
  joined: s.outcome === "offer" ? (s.joined === true ? "yes" : s.joined === false ? "no" : s.ratings?.culture != null ? "yes" : "no") : "",
  ratings: s.ratings ? { hiring: s.ratings.hiring ?? 0, communication: s.ratings.communication ?? 0, culture: s.ratings.culture ?? 0, pay: s.ratings.pay ?? 0, growth: s.ratings.growth ?? 0 } : EMPTY.ratings,
  min: s.salary ? String(s.salary[0]) : "", max: s.salary ? String(s.salary[1]) : "", showSalary: !!s.salary, days: s.daysWaited != null ? String(s.daysWaited) : "", quick: !!s.quick,
});

// `editing`: the same flow pre-filled to edit one of your stories (saves with PATCH, no draft).
// `presetCompany`: opened from a company's page. `preset`: opened from the Waiting Room or a deep
// link (/dashboard?share=1&company=…&outcome=…), so what's known is filled in and the flow starts
// at the first step that still needs an answer. `onPublished` hears back with the new story's id.
export type StoryPreset = { company?: string; stage?: string; role?: string; outcome?: string; days?: number };
export function ShareModal({ open, onOpenChange, editing = null, presetCompany = null, preset = null, onPublished }: { open: boolean; onOpenChange: (v: boolean) => void; editing?: StoryModel | null; presetCompany?: string | null; preset?: StoryPreset | null; onPublished?: (storyPublicId: string | null) => void }) {
  const qc = useQueryClient();
  const tone = useTone();
  const C = useComposer();
  const f = useFit(); // labels keep their English size, so nothing moves when the language changes
  const pv = (p: { sassy: string; calm: string }) => voice(tone, p.sassy, p.calm);
  const fv = (pick: (c: typeof C) => { sassy: string; calm: string }) => f.c((c) => voice(tone, pick(c).sassy, pick(c).calm));
  const { me } = useMe();
  const { list: companyList, index } = useCompanyIndex();
  // Solves in the background while the form is open (done long before the last step); editing an
  // existing story doesn't need it.
  const shield = useHumanCheck(open && !editing);
  const [d, setD] = useState<Draft>(EMPTY);
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [dir, setDir] = useState(1);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [listing, setListing] = useState(false);
  const [restored, setRestored] = useState(false);
  const [postedId, setPostedId] = useState<string | null>(null);
  const founding = useFounding();

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((s) => ({ ...s, [k]: v }));
  const company = index.get(d.company);
  const j = journeyOf(d);

  // What's missing on each step (shown once they try to move on).
  const problemsOf = (x: Draft): string[][] => {
    const min = x.min === "" ? null : Number(x.min), max = x.max === "" ? null : Number(x.max);
    const jj = journeyOf(x);
    return [
      [!x.outcome && C.problems.outcome, x.outcome === "offer" && !x.joined && C.problems.joined, !x.company && C.problems.company].filter(Boolean) as string[],
      [neverHired(x.outcome) && !x.stage && C.problems.stage,
        ...jj.ratings.filter((k) => !x.ratings[k]).map((k) => fill(C.problems.rate, { what: f.lang === "en" ? C.ratings[k].label.toLowerCase() : C.ratings[k].label })),
        jj.salary && (min === null) !== (max === null) && C.problems.bothPay,
        jj.salary && min !== null && max !== null && max < min && C.problems.maxMin,
        jj.salary && min !== null && (min > 1000 || (max ?? 0) > 1000) && C.problems.payOff,
        x.days !== "" && (Number(x.days) < 0 || Number(x.days) > 730) && C.problems.daysRange].filter(Boolean) as string[],
      [x.title.trim().length < 5 && C.problems.title,
        x.body.trim().length < 40 && fill(C.problems.body, { n: Math.max(0, 40 - x.body.trim().length) })].filter(Boolean) as string[],
      [],
    ];
  };
  const problems = useMemo(() => problemsOf(d), [d, C]); // eslint-disable-line react-hooks/exhaustive-deps
  // Presets and deep links skip ahead to the first step that still needs an answer (never past 3).
  const firstOpen = (x: Draft) => { const p = problemsOf(x); const i = p.findIndex((s) => s.length > 0); return i < 0 ? 2 : Math.min(i, 2); };

  // Bring back an unfinished draft (or the preset) when the flow opens.
  useEffect(() => {
    if (!open) return;
    let start = EMPTY, first = 0;
    if (editing) { start = draftFrom(editing); setRestored(false); setReached(STEPS.length - 1); }
    else if (preset) {
      const outcome = (OUTCOMES.some((o) => o.id === preset.outcome) ? preset.outcome : "") as Draft["outcome"];
      start = { ...EMPTY, company: preset.company ?? "", stage: preset.stage ?? (outcome === "ghost_job" ? "application" : ""), role: preset.role ?? "", outcome, days: preset.days != null ? String(Math.min(730, preset.days)) : "" };
      first = firstOpen(start); setRestored(false); setReached(first);
    } else {
      const saved = loadDraft();
      if (saved && !isBlank(saved)) { start = { ...saved, ...(presetCompany && { company: presetCompany }) }; setRestored(true); }
      else if (presetCompany) start = { ...EMPTY, company: presetCompany };
      setReached(0);
    }
    setD(start); setStep(first); setDone(false); setTried(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, presetCompany, preset]);
  useEffect(() => { if (open && !editing && !preset && !done && !isBlank(d)) saveDraft(d); }, [d, open, done, editing, preset]);
  // The title follows the taps until you edit it yourself.
  useEffect(() => { if (!d.titleTouched && d.outcome) { const t = autoTitle(d); if (t !== d.title) set("title", t); } }, [d.outcome, d.joined, d.stage, d.days, d.titleTouched]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickOutcome = (o: Outcome) => setD((s) => ({ ...s, outcome: o, joined: o === "offer" ? s.joined : "", stage: o === "ghost_job" && !s.stage ? "application" : s.stage }));

  const go = (to: number) => {
    if (to > step && problems[step]!.length) { setTried(true); return; }
    setTried(false); setDir(to > step ? 1 : -1); setStep(to); setReached((r) => Math.max(r, to));
  };
  // Live Flag Score from only the ratings this journey shows.
  const flagScore = storyScore(Object.fromEntries(j.ratings.filter((k) => d.ratings[k] > 0).map((k) => [k, d.ratings[k]])));
  const allRated = j.ratings.every((k) => d.ratings[k] > 0);

  // Skip the writing: a title and plain body from the taps, then straight to review.
  const quickStory = () => {
    if (problems[0]!.length || problems[1]!.length) { setTried(true); return; }
    setD((s) => ({ ...s, title: s.titleTouched && s.title.trim().length >= 5 ? s.title : autoTitle(s), body: autoBody(s, company?.name ?? "the company"), quick: true }));
    setTried(false); setDir(1); setStep(3); setReached(3);
  };

  const payload = () => {
    const min = d.min === "" ? null : Number(d.min), max = d.max === "" ? null : Number(d.max);
    return {
      outcome: d.outcome, stage: stageOf(d), title: d.title.trim(), body: d.body.trim(), ...(d.role.trim() && { role: d.role.trim() }),
      ratings: Object.fromEntries(j.ratings.map((k) => [k, d.ratings[k]])),
      ...(d.outcome === "offer" && { joined: d.joined === "yes" }),
      quick: d.quick,
      salary: j.salary && min !== null && max !== null ? { min, max } : null,
      daysWaited: neverHired(d.outcome) && d.days !== "" ? Number(d.days) : null,
    };
  };

  const refresh = () => {
    for (const key of [["feed"], ["my-stories"], ["person"], ["insights"], ["story"], ["founding"]]) void qc.invalidateQueries({ queryKey: key });
    liveNudge();
  };
  const showError = (err: unknown, fallback: string) => {
    if (err instanceof ApiRequestError && err.message.startsWith("Goofy: ")) speak(err.message, "error");
    else toast.error(err instanceof ApiRequestError ? (err.fields ? Object.values(err.fields)[0] ?? err.message : err.message) : fallback);
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!apiEnabled) { toast.success(C.toasts.previewSaved); return close(false); }
    setBusy(true);
    try {
      const p = payload();
      // Offers keep whatever wait the story had; the form doesn't ask for it.
      const body = neverHired(d.outcome) ? p : (({ daysWaited: _omit, ...rest }) => rest)(p);
      const r = await api<{ pending?: boolean; message?: string | null }>(`/v1/stories/${editing.id}`, { method: "PATCH", body });
      if (r.pending) speak(r.message ?? "Saved. Your story will be back up after a quick check.");
      else toast.success(pv(C.toasts.updated));
      refresh();
      close(false);
    } catch (err) { showError(err, C.toasts.saveFail); } finally { setBusy(false); }
  };

  const post = async () => {
    if (editing) return saveEdit();
    if (!apiEnabled) { if (!preset) clearDraft(); setDone(true); onPublished?.(null); return; }
    setBusy(true);
    let escalated = false;
    try {
      const { salary, daysWaited, ...p } = payload();
      const r = await api<{ story?: { publicId?: string }; pending?: boolean; publicId?: string; message?: string | null }>("/v1/stories", { method: "POST", body: {
        companySlug: d.company, ...p, ...(salary && { salary }), ...(daysWaited != null && { daysWaited }), captchaToken: shield.getToken(),
      } });
      if (!preset) clearDraft();
      if (r.pending) {
        speak(r.message ?? "Saved. Your story goes up after a quick check.");
        onPublished?.(r.publicId ?? null); refresh(); close(false);
        return;
      }
      setPostedId(r.story?.publicId ?? null);
      setDone(true);
      onPublished?.(r.story?.publicId ?? null);
      refresh();
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "captcha_escalate") { escalated = true; shield.escalate(); }
      showError(err, C.toasts.postFail);
    } finally { if (!escalated) shield.reset(); setBusy(false); }
  };

  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v) { if (done) setD(EMPTY); setRestored(false); }
  };
  const startOver = () => { clearDraft(); setD(EMPTY); setRestored(false); setStep(0); setReached(0); setTried(false); };

  const outcome = OUTCOMES.find((o) => o.id === d.outcome);
  const stage = STAGES.find((s) => s.id === stageOf(d));
  const days = daysOf(d);
  const quietLabel = f.c((c) => (d.outcome === "rejected" ? c.quiet.rejected : d.outcome === "ghost_job" ? c.quiet.ghost_job : c.quiet.other));
  // The outcome line on the preview card stays in English: it's how the posted story will read.
  const outcomeLine = outcome ? (d.outcome === "offer" ? (d.joined === "yes" ? "Got an offer, joined" : d.joined === "no" ? "Got an offer, didn't join" : outcome.label) : outcome.label) : "";

  // ---------- steps ----------

  const steps: ReactNode[] = [
    // 1. What happened
    <div key="what" className="space-y-5">
      <div>
        <Label>{f.c((c) => c.how)}</Label>
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:grid-cols-3">{OUTCOMES.map(({ id, icon: Icon, tone: t }) => <motion.button key={id} type="button" onClick={() => pickOutcome(id)} aria-pressed={d.outcome === id} whileTap={{ scale: 0.97 }}
          className={cn("flex min-h-14 items-start gap-2.5 rounded-lg border-2 border-foreground p-3 text-left transition-colors", d.outcome === id ? "bg-primary text-primary-foreground shadow-hard-sm" : "bg-card hover:bg-muted")}>
          <Icon className={cn("mt-0.5 size-5 shrink-0", d.outcome !== id && t)} />
          <span className="min-w-0"><span className="block text-sm font-bold">{f.c((c) => c.outcomes[id].label)}</span><span className={cn("block text-xs", d.outcome === id ? "opacity-85" : "text-muted-foreground")}>{f.c((c) => c.outcomes[id].blurb)}</span></span>
        </motion.button>)}</div>
      </div>
      <AnimatePresence initial={false}>{d.outcome === "offer" && <motion.div key="joined" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
        <Label>{f.c((c) => c.joined)}</Label>
        <div className="flex flex-wrap gap-2">
          <Chip on={d.joined === "yes"} onClick={() => set("joined", "yes")}>{f.c((c) => c.joinedYes)}</Chip>
          <Chip on={d.joined === "no"} onClick={() => set("joined", "no")}>{f.c((c) => c.joinedNo)}</Chip>
        </div>
      </motion.div>}</AnimatePresence>
      <div>
        <Label hint={editing ? f.c((c) => c.companyLocked) : <button type="button" onClick={() => setListing(true)} className="font-bold text-primary hover:underline">{f.c((c) => c.notListed)}</button>}>{f.c((c) => c.company)}</Label>
        <CompanyPicker value={d.company} onChange={(v) => set("company", v)} companies={companyList} disabled={!!editing} placeholder={C.chooseCompany}
          footer={(close, q) => <button type="button" onClick={() => { close(); setListing(true); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-bold text-primary hover:bg-muted"><Plus className="size-4" />{q ? fill(C.listQ, { q }) : C.notListed}</button>} />
      </div>
      <div>
        <Label hint={<span>{f.c((c) => c.optional)} · <span className="tabular-nums">{d.role.length}/{ROLE_MAX}</span></span>}>{f.c((c) => c.role)}</Label>
        <Input value={d.role} onChange={(e) => set("role", e.target.value)} maxLength={ROLE_MAX} placeholder={C.roleHint} className="h-11 border-2 border-foreground" />
      </div>
    </div>,

    // 2. The details: only what this journey needs
    <div key="details" className="space-y-5">
      {neverHired(d.outcome) && <>
        <div>
          <Label>{quietLabel}</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{STAGES.map(({ id, icon: Icon }, i) => <motion.button key={id} type="button" onClick={() => set("stage", id)} aria-pressed={d.stage === id} whileTap={{ scale: 0.96 }}
            className={cn("flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-foreground px-2 py-3 text-center text-xs font-bold transition-colors", d.stage === id ? "bg-primary text-primary-foreground shadow-hard-sm" : "bg-card hover:bg-muted", i === 4 && "col-span-2 sm:col-span-1")}>
            <Icon className="size-5" />{f.c((c) => c.stages[id as keyof typeof c.stages], "justify-items-center")}
          </motion.button>)}</div>
        </div>
        <div>
          <Label hint={f.c((c) => c.optional)}>{f.c((c) => (d.outcome === "rejected" ? c.waitQ.rejected : c.waitQ.other))}</Label>
          <div className="flex flex-wrap gap-2">
            {WAITS.map((w, wi) => <Chip key={w.days} on={days === w.days} onClick={() => set("days", days === w.days ? "" : String(w.days))}>{f.c((c) => c.waits[wi] ?? w.label)}</Chip>)}
            <label className={cn(tap, "inline-flex items-center gap-2 rounded-full border-2 border-dashed border-foreground/50 px-3 text-sm font-semibold text-muted-foreground")}>
              <span>{f.c((c) => c.exact)}</span>
              <input inputMode="numeric" value={WAITS.some((w) => w.days === days) ? "" : d.days} onChange={(e) => set("days", e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder={C.exactHint} aria-label={C.exactLabel} className="w-14 bg-transparent text-foreground outline-none" />
            </label>
          </div>
        </div>
      </>}
      {offerish(d.outcome) && <p className="rounded-lg border-2 border-foreground/20 bg-muted/50 px-3 py-2 text-sm">{(() => {
        const what = d.outcome === "offer" && d.joined ? (d.joined === "yes" ? C.joinedYes : C.joinedNo) : C.outcomes[d.outcome as Outcome].label;
        const [before, after] = fill(C.atOffer, { company: company ? fill(C.withCo, { name: company.name }) : "" }).split("{outcome}");
        return <>{before}<b>{what}</b>{after}</>;
      })()}</p>}

      <div className="flex items-center gap-4 rounded-xl border-2 border-foreground bg-accent p-4">
        <AnimatePresence mode="wait" initial={false}>{flagScore !== null && allRated
          ? <motion.div key="score" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="shrink-0"><FlagScore score={flagScore} compact /></motion.div>
          : <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid size-16 shrink-0 place-items-center rounded-full border-2 border-dashed border-foreground/40 font-display text-xl font-bold text-muted-foreground">?</motion.div>}</AnimatePresence>
        <p className="text-sm">{flagScore === null || !allRated
          ? fill(pv(C.rateAll), { all: j.ratings.length === 2 ? pv(C.both) : fill(pv(C.allN), { n: j.ratings.length }) })
          : (() => { const [before, after] = fill(C.gives, { company: company?.name ?? C.them }).split("{score}"); return <>{before}<strong className={scoreTone(flagScore)}>{flagScore}</strong>{after}</>; })()}</p>
      </div>
      <div className="space-y-2">{j.ratings.map((key) => <div key={key} className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border-2 px-3 py-2 transition-colors", d.ratings[key] ? "border-foreground bg-card" : "border-foreground/20 bg-muted/50")}>
        <span className="min-w-0"><span className="block text-sm font-bold">{f.c((c) => c.ratings[key].label)}</span><span className="block text-xs text-muted-foreground">{f.c((c) => c.ratings[key].hint)}</span></span>
        <Stars label={C.ratings[key].label} value={d.ratings[key]} onChange={(n) => set("ratings", { ...d.ratings, [key]: n })} />
      </div>)}</div>

      {j.salary && (d.showSalary
        ? <div>
            <Label hint={f.c((c) => c.payHint)}>{f.c((c) => (d.joined === "yes" ? c.payYours : c.payOffered))}</Label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-bold text-muted-foreground">{f.c((c) => c.min)}<Input inputMode="decimal" value={d.min} onChange={(e) => set("min", e.target.value.replace(/[^\d.]/g, ""))} placeholder="12" className="mt-1 h-11 border-2 border-foreground text-foreground" /></label>
              <label className="text-xs font-bold text-muted-foreground">{f.c((c) => c.max)}<Input inputMode="decimal" value={d.max} onChange={(e) => set("max", e.target.value.replace(/[^\d.]/g, ""))} placeholder="18" className="mt-1 h-11 border-2 border-foreground text-foreground" /></label>
            </div>
          </div>
        : <button type="button" onClick={() => set("showSalary", true)} className={cn(tap, "inline-flex items-center gap-2 rounded-lg border-2 border-dashed border-foreground/50 px-3 text-sm font-bold hover:border-foreground")}><IndianRupee className="size-4" />{f.c((c) => (d.joined === "yes" ? c.addYours : c.addOffered))}<ChevronDown className="size-4" /></button>)}
    </div>,

    // 3. In your words
    <div key="words" className="space-y-5">
      <button type="button" onClick={quickStory} className={cn(tap, "flex w-full items-center gap-3 rounded-xl border-2 border-foreground bg-accent p-3 text-left shadow-hard-sm transition-transform hover:-translate-y-0.5")}>
        <span className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-foreground bg-card"><Zap className="size-5" /></span>
        <span className="min-w-0"><span className="block font-bold">{fv((c) => c.quick)}</span><span className="block text-xs text-muted-foreground">{f.c((c) => c.quickNote)}</span></span>
        <ArrowRight className="ml-auto size-4 shrink-0" />
      </button>
      <div>
        <Label hint={<span className="tabular-nums">{d.title.length}/90</span>}>{f.c((c) => c.title)}</Label>
        <Input value={d.title} onChange={(e) => setD((s) => ({ ...s, title: e.target.value, titleTouched: true }))} maxLength={90} className="h-11 border-2 border-foreground font-semibold" />
      </div>
      <div>
        <Label hint={<span className="tabular-nums">{d.body.trim().length < 40 ? fill(C.moreToGo, { n: 40 - d.body.trim().length }) : `${d.body.length}/4000`}</span>}>{f.c((c) => c.tell)}</Label>
        <div className="mb-2 flex flex-wrap gap-1.5">{promptsIn(C, d).map((p) => <button key={p} type="button" onClick={() => setD((s) => ({ ...s, quick: false, body: `${s.body.trimEnd()}${s.body.trim() ? "\n\n" : ""}### ${p}\n\n` }))}
          className={cn(tap, "inline-flex items-center gap-1 rounded-full border-2 border-foreground/30 bg-card px-3 text-xs font-bold hover:border-foreground sm:min-h-9")}><Plus className="size-3.5" />{p}</button>)}</div>
        <MarkdownEditor value={d.body} onChange={(v) => setD((s) => ({ ...s, body: v, quick: false }))} placeholder={d.outcome ? pv(C.placeholder[d.outcome]) : ""} />
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span><strong className="text-foreground">{C.markdown}</strong> {C.markdownTips}</span>
          {!d.body.trim() && <button type="button" onClick={() => set("body", promptsIn(C, d).map((p) => `### ${p}\n\n`).join("\n"))} className="inline-flex items-center gap-1 font-bold text-primary hover:underline"><Wand2 className="size-3.5" />{f.c((c) => c.structure)}</button>}
        </div>
      </div>
    </div>,

    // 4. Review and post: only the fields that exist
    <div key="post" className="space-y-5">
      <p className="text-sm text-muted-foreground">{fv((c) => c.review)}</p>
      <article className="rounded-xl border-2 border-foreground bg-card p-5 shadow-hard-sm">
        <div className="flex items-start gap-3">
          <Avatar seed={me.avatarSeed} pastel={me.pastel} size="sm" label={displayName(me)} />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{displayName(me)}</p><p className="truncate text-xs text-muted-foreground">about <strong className="text-foreground">{company?.name ?? "a company"}</strong> · just now</p></div>
          {company && <CompanyMark company={company} size="sm" />}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {outcome && <span className="rounded-full border-2 border-foreground bg-accent px-2.5 py-0.5 text-[11px] font-bold uppercase">{outcomeLine}</span>}
          {d.quick && <QuickBadge />}
          {[neverHired(d.outcome) ? stage?.label : null, d.role.trim()].filter(Boolean).map((t) => <span key={t} className="text-xs font-semibold text-muted-foreground">{t}</span>)}
        </div>
        <h3 className="mt-3 font-bold leading-snug">{d.title.trim()}</h3>
        <Markdown text={d.body} className="mt-1.5" />
        {d.quick && <button type="button" onClick={() => set("body", autoBody(d, company?.name ?? "the company"))} className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-foreground/30 px-3 text-xs font-bold hover:border-foreground sm:min-h-9"><Shuffle className="size-3.5" />{f.c((c) => c.reword)}</button>}
        {flagScore !== null && <p className="mt-4 border-t-2 border-dashed border-foreground/15 pt-3 text-xs font-semibold text-muted-foreground">{C.scoreLine} <span className={cn("font-display text-sm font-bold", scoreTone(flagScore))}>{flagScore}</span>{j.salary && d.min && d.max ? ` · ₹${d.min} to ${d.max} LPA` : ""}{neverHired(d.outcome) && days != null ? ` · waited ${waitPhrase(days)}` : ""}</p>}
      </article>
      <div className="flex items-center gap-3 rounded-lg border-2 border-foreground bg-muted/50 p-3">
        <Avatar seed={me.avatarSeed} pastel={me.pastel} size="sm" label={displayName(me)} />
        <p className="min-w-0 flex-1 text-sm"><span className="font-bold">{fill(C.postingAs, { name: displayName(me) })}</span><span className="block text-xs text-muted-foreground">{isPublic(me) ? C.publicNote : C.anonNote} {C.changeNote}</span></p>
      </div>
      {!editing && <HumanCheck shield={shield} />}
    </div>,
  ];

  const titles = [
    { t: fv((c) => c.titles.what.t), s: fv((c) => c.titles.what.s) },
    { t: fv((c) => c.titles.details.t), s: fv((c) => (neverHired(d.outcome) ? c.titles.details.never : c.titles.details.other)) },
    { t: fv((c) => c.titles.words.t), s: fv((c) => c.titles.words.s) },
    editing ? { t: fv((c) => c.titles.edit.t), s: fv((c) => c.titles.edit.s) } : { t: fv((c) => c.titles.post.t), s: fv((c) => c.titles.post.s) },
  ];

  return <Dialog open={open} onOpenChange={close}>
    <DialogContent className={cn(popup, "max-w-2xl")}>
      {done ? <div className={cn(popupBody, "grid place-items-center py-8 text-center")} data-lenis-prevent>
        <motion.div initial={{ scale: 0.4, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 14 }} className="relative">
          <img src="/ghosted-mark.png" alt="" className="size-20 object-contain" />
          {[...Array(8)].map((_, i) => <motion.span key={i} className="absolute left-1/2 top-1/2 size-2.5 rounded-full" style={{ background: ["#6D28D9", "#F59E0B", "#22C55E", "#EF4444"][i % 4] }}
            initial={{ x: 0, y: 0, opacity: 1 }} animate={{ x: Math.cos((i / 8) * Math.PI * 2) * 80, y: Math.sin((i / 8) * Math.PI * 2) * 80, opacity: 0 }} transition={{ duration: 0.9, delay: 0.15, ease: "easeOut" }} />)}
        </motion.div>
        <DialogTitle className="mt-4 font-display text-3xl">{fv((c) => c.done.title)}</DialogTitle>
        <DialogDescription className="mx-auto mt-2 max-w-sm">{apiEnabled ? fv((c) => c.done.copy) : C.done.preview}</DialogDescription>
        <div className="mt-5 flex w-full justify-center"><ShareCard data={{ storyId: postedId, headline: d.title.trim() || autoTitle(d), wait: neverHired(d.outcome) && days != null ? waitPhrase(days) : null, score: flagScore, company: company?.name ?? "", foundingRank: founding?.foundingRank ?? null }} /></div>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button variant="outline" onClick={() => { setD(EMPTY); setDone(false); setStep(0); setReached(0); }}><PenLine />{f.c((c) => c.done.another)}</Button>
          <Button onClick={() => close(false)}><Sparkles />{f.c((c) => c.done.feed)}</Button>
        </div>
      </div> : <>
        <div className={popupBody} data-lenis-prevent>
          <StepHeader step={step} title={titles[step]!.t} subtitle={titles[step]!.s} />
          <Progress step={step} reached={reached} onJump={(i) => go(i)} />
          {restored && step === 0 && <p className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 border-primary bg-primary/10 px-3 py-2 text-xs font-semibold">
            <span>{fv((c) => c.restored)}</span>
            <button type="button" onClick={startOver} className="font-bold text-primary hover:underline">{f.c((c) => c.startOver)}</button>
          </p>}
          <div className="relative mt-6 overflow-x-clip">
            <AnimatePresence mode="wait" initial={false} custom={dir}>
              <motion.div key={step} custom={dir} initial={{ x: dir * 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: dir * -40, opacity: 0 }} transition={{ duration: 0.2, ease: "easeOut" }}>
                {steps[step]}
              </motion.div>
            </AnimatePresence>
          </div>
          <AnimatePresence>{tried && problems[step]!.length > 0 && <motion.ul initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-4 space-y-1 rounded-lg border-2 border-flag-red bg-flag-red/10 p-3 text-sm font-semibold text-flag-red">
            {problems[step]!.map((p) => <li key={p} className="flex items-center gap-1.5"><XCircle className="size-4 shrink-0" />{p}</li>)}
          </motion.ul>}</AnimatePresence>
        </div>
        <div className="flex items-center justify-between gap-2 border-t-2 border-foreground bg-card px-5 py-3 sm:px-7">
          {step > 0 ? <Button variant="outline" className={tap} onClick={() => go(step - 1)}><ArrowLeft />{f.c((c) => c.back)}</Button> : <span className="text-xs text-muted-foreground">{editing ? C.editingNote : isBlank(d) ? "" : C.draftSaved}</span>}
          {step < STEPS.length - 1
            ? <Button className={tap} onClick={() => go(step + 1)}>{f.c((c) => c.steps[STEPS[step + 1]!.id])}<ArrowRight /></Button>
            : editing
              ? <Button onClick={() => void post()} disabled={busy} className={cn(tap, "min-w-36")}>{busy ? <Loader2 className="animate-spin" /> : <Check />}{f.c((c) => (busy ? c.saving : c.save))}</Button>
              : <Button onClick={() => void post()} disabled={busy || shield.status !== "done"} className={cn(tap, "min-w-36")}>{busy ? <Loader2 className="animate-spin" /> : <Sparkles />}{f.c((c) => (busy ? c.posting : shield.status !== "done" ? c.checking : c.post))}</Button>}
        </div>
      </>}
      <ListCompanyDialog open={listing} onOpenChange={setListing} onListed={(co) => set("company", co.id)} />
    </DialogContent>
  </Dialog>;
}
