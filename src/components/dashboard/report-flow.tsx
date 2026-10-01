// Reporting a story or a chitchat: three quick steps, built so people finish it.
//
//   1. What's wrong?        big tappable cards; tapping one moves on by itself
//   2. Tell us a bit more   one-tap chips for that reason, plus an optional note (skippable)
//   3. Check and send       a one-line summary and what happens next
//
// Then Goofy confirms he's already looked at it. The chips travel as structured text in `details`,
// so the automatic triage (and a human, if it gets that far) reads exactly what was picked.
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft, ArrowRight, Check, EyeOff, FileWarning, Flame, HelpCircle, Loader2, Lock, Megaphone, MessageSquareOff, ShieldAlert, ShieldCheck, Sparkles, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ApiRequestError } from "@/lib/api";
import { GOOFY_AVATAR } from "@/lib/goofy";
import { useTone, voice } from "@/lib/session";
import { cn } from "@/lib/utils";
import { popup, popupBody } from "./ui-kit";

export type ReportKind = "story" | "chitchat";
type Reason = { id: string; icon: LucideIcon; label: string; blurb: string; chips: string[]; tone: string };

const REASONS: Record<string, Reason> = {
  identifies_person: { id: "identifies_person", icon: EyeOff, label: "Names or exposes someone", blurb: "A name, number, photo or anything that points to a real person", tone: "bg-flag-red text-primary-foreground",
    chips: ["Names a person", "Phone or email", "Photo or profile link", "Job title that gives them away", "Home or office address"] },
  harassment: { id: "harassment", icon: Flame, label: "Harassment or hate", blurb: "Insults, threats, slurs, or picking on someone", tone: "bg-flag-red text-primary-foreground",
    chips: ["Insults someone", "Threatens someone", "Slur or hate speech", "Sexual comments", "Targets the story's author"] },
  false_info: { id: "false_info", icon: FileWarning, label: "False or misleading", blurb: "Didn't happen, wrong company, or stated as fact without basis", tone: "bg-flag-amber",
    chips: ["I don't think this happened", "Wrong company", "Exaggerated", "Accuses someone of a crime", "Outdated (the process changed)"] },
  confidential: { id: "confidential", icon: Lock, label: "Shares confidential information", blurb: "Internal documents, salary sheets, code or anything under NDA", tone: "bg-flag-amber",
    chips: ["Internal document", "Salary or offer letter", "Code or credentials", "Interview questions under NDA"] },
  spam: { id: "spam", icon: Megaphone, label: "Spam or advertising", blurb: "Selling something, links, or 'DM me for referrals'", tone: "bg-muted",
    chips: ["Selling a course or service", "Paid referrals", "Suspicious links", "Same message posted many times"] },
  off_topic: { id: "off_topic", icon: MessageSquareOff, label: "Off-topic", blurb: "Nothing to do with this story or with hiring", tone: "bg-muted",
    chips: ["Not about this story", "Not about hiring", "Picking a fight"] },
  other: { id: "other", icon: HelpCircle, label: "Something else", blurb: "Tell us in your own words", tone: "bg-muted", chips: [] },
};
const ORDER: Record<ReportKind, string[]> = {
  story: ["identifies_person", "false_info", "harassment", "confidential", "spam", "other"],
  chitchat: ["harassment", "identifies_person", "spam", "false_info", "off_topic", "other"],
};
const STEPS = ["What's wrong", "Details", "Send"];

export function ReportFlow({ open, onOpenChange, kind, subject, onSubmit }: {
  open: boolean; onOpenChange: (v: boolean) => void; kind: ReportKind; subject?: string | null | undefined;
  onSubmit: (reason: string, details: string) => Promise<string>;
}) {
  const tone = useTone();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [reason, setReason] = useState<string | null>(null);
  const [chips, setChips] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => { if (open) { setStep(0); setReason(null); setChips([]); setNote(""); setError(null); setDone(null); } }, [open]);

  const r = reason ? REASONS[reason]! : null;
  const what = kind === "story" ? "story" : "chitchat";
  const go = (n: number) => { setDir(n > step ? 1 : -1); setStep(n); setError(null); };
  const pick = (id: string) => { setReason(id); setChips([]); go(1); };
  const toggle = (c: string) => setChips((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));
  // "Something else" needs a few words, otherwise the report can't be acted on.
  const needsNote = reason === "other" && note.trim().length < 5;
  const details = [chips.length ? `Picked: ${chips.join("; ")}` : "", note.trim()].filter(Boolean).join("\n").slice(0, 1000);

  const send = async () => {
    if (!reason) return;
    setBusy(true); setError(null);
    try { setDone(await onSubmit(reason, details)); }
    catch (err) { setError(err instanceof ApiRequestError ? (err.status === 401 ? "Log in to report." : err.message) : "Couldn't send the report. Try again."); }
    finally { setBusy(false); }
  };

  const steps = [
    // 1. What's wrong
    <div key="what" className="grid gap-2 sm:grid-cols-2">{ORDER[kind].map((id) => {
      const x = REASONS[id]!;
      return <motion.button key={id} type="button" onClick={() => pick(id)} whileTap={{ scale: 0.97 }} aria-pressed={reason === id}
        className={cn("group flex items-start gap-3 rounded-xl border-2 p-3 text-left transition-colors", reason === id ? "border-foreground bg-primary/10" : "border-foreground/20 hover:border-foreground hover:bg-muted/60")}>
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg border-2 border-foreground", x.tone)}><x.icon className="size-4" /></span>
        <span className="min-w-0"><span className="block text-sm font-bold">{x.label}</span><span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{x.blurb}</span></span>
      </motion.button>;
    })}</div>,

    // 2. Details
    r && <div key="more" className="space-y-4">
      <div className="flex items-center gap-2.5 rounded-lg bg-muted/60 px-3 py-2"><span className={cn("grid size-7 place-items-center rounded-md border-2 border-foreground", r.tone)}><r.icon className="size-3.5" /></span><span className="text-sm font-bold">{r.label}</span>
        <button type="button" onClick={() => go(0)} className="ml-auto text-xs font-semibold text-primary hover:underline">Change</button></div>
      {r.chips.length > 0 && <div>
        <p className="text-sm font-bold">What exactly? <span className="font-normal text-muted-foreground">Tap all that apply</span></p>
        <div className="mt-2 flex flex-wrap gap-2">{r.chips.map((c) => { const on = chips.includes(c); return <motion.button key={c} type="button" onClick={() => toggle(c)} whileTap={{ scale: 0.95 }} aria-pressed={on}
          className={cn("inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-xs font-bold transition-colors", on ? "border-foreground bg-primary text-primary-foreground" : "border-foreground/25 bg-card hover:border-foreground")}>
          {on && <Check className="size-3.5" />}{c}</motion.button>; })}</div>
      </div>}
      <div>
        <label htmlFor="report-note" className="text-sm font-bold">{reason === "other" ? "What's going on?" : "Anything else?"} <span className="font-normal text-muted-foreground">{reason === "other" ? "(a few words)" : "(optional)"}</span></label>
        <Textarea id="report-note" value={note} onChange={(e) => setNote(e.target.value.slice(0, 600))} rows={3} placeholder={reason === "identifies_person" ? "Which part gives them away? (don't repeat the details here)" : "Anything that helps us decide faster"} className="mt-1.5 rounded-lg border-2 border-foreground bg-background" />
        <p className="mt-1 text-right text-[11px] text-muted-foreground">{note.length}/600</p>
      </div>
    </div>,

    // 3. Send
    r && <div key="send" className="space-y-4">
      <div className="rounded-xl border-2 border-foreground bg-card p-4">
        <p className="text-xs font-bold uppercase text-muted-foreground">You're reporting this {what} for</p>
        <p className="mt-1 flex items-center gap-2 font-display text-lg font-bold"><r.icon className="size-4" />{r.label}</p>
        {chips.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{chips.map((c) => <span key={c} className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold">{c}</span>)}</div>}
        {note.trim() && <p className="mt-2 line-clamp-3 border-l-2 border-foreground/20 pl-2 text-sm text-muted-foreground">{note.trim()}</p>}
        {subject && <p className="mt-3 line-clamp-2 border-t-2 border-dashed border-foreground/15 pt-2 text-xs text-muted-foreground">“{subject}”</p>}
      </div>
      <ul className="space-y-2 text-sm">
        <li className="flex items-start gap-2"><Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />Goofy checks it the moment you send, and moves serious ones to the top of the queue.</li>
        <li className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-flag-green" />Nobody, including the {kind === "story" ? "author" : "person"}, ever learns it was you.</li>
        <li className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0" />If several people report something serious, it's hidden until it's decided.</li>
      </ul>
      {error && <p className="rounded-lg border-2 border-flag-red bg-flag-red/10 p-3 text-sm font-semibold text-flag-red">{error}</p>}
    </div>,
  ];

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className={popup}>
      {done ? <div className={cn(popupBody, "grid place-items-center py-10 text-center")} data-lenis-prevent>
        <motion.img src={GOOFY_AVATAR} alt="" initial={{ scale: 0.5, rotate: -10, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 14 }} className="size-20 rounded-full border-2 border-foreground object-cover shadow-hard-sm" />
        <DialogTitle className="mt-4 font-display text-2xl">{voice(tone, "Report received. I'm on it.", "Thank you. Your report is in.")}</DialogTitle>
        <DialogDescription className="mx-auto mt-2 max-w-sm">{done}</DialogDescription>
        <p className="mt-3 text-xs text-muted-foreground">{voice(tone, "You just made Ghosted a little less chaotic. Goofy owes you one.", "Reports like yours keep Ghosted safe and useful for everyone.")}</p>
        <Button className="mt-6" onClick={() => onOpenChange(false)}>Done</Button>
      </div> : <>
        <div className="border-b-2 border-foreground px-5 pb-4 pt-5 sm:px-7">
          <p className="text-xs font-bold uppercase text-flag-red">Step {step + 1} of 3</p>
          <DialogTitle className="mt-1 pr-8 font-display text-2xl">{step === 0 ? `What's wrong with this ${what}?` : step === 1 ? "Tell us a bit more" : "Ready to send?"}</DialogTitle>
          <DialogDescription className="sr-only">Report this {what} in three short steps.</DialogDescription>
          <div className="mt-3 grid grid-cols-3 gap-1.5">{STEPS.map((s, i) => <div key={s}>
            <span className="block h-1.5 overflow-hidden rounded-full bg-muted"><motion.span className="block h-full rounded-full bg-flag-red" initial={false} animate={{ width: i < step ? "100%" : i === step ? "55%" : "0%" }} transition={{ type: "spring", stiffness: 200, damping: 26 }} /></span>
            <span className={cn("mt-1 block text-[11px] font-semibold", i <= step ? "text-foreground" : "text-muted-foreground")}>{s}</span>
          </div>)}</div>
        </div>
        <div className={popupBody} data-lenis-prevent>
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.div key={step} custom={dir} initial={{ x: dir * 32, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: dir * -32, opacity: 0 }} transition={{ duration: 0.18, ease: "easeOut" }}>{steps[step]}</motion.div>
          </AnimatePresence>
        </div>
        <div className="flex items-center justify-between gap-2 border-t-2 border-foreground px-5 py-3 sm:px-7">
          {step > 0 ? <Button variant="outline" onClick={() => go(step - 1)}><ArrowLeft />Back</Button> : <span className="text-xs text-muted-foreground">Takes about 20 seconds</span>}
          {step === 1 && <Button onClick={() => go(2)} disabled={needsNote}>{chips.length || note.trim() ? "Next" : reason === "other" ? "Next" : "Skip"}<ArrowRight /></Button>}
          {step === 2 && <Button variant="destructive" onClick={() => void send()} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <ShieldAlert />}Send report</Button>}
        </div>
      </>}
    </DialogContent>
  </Dialog>;
}
