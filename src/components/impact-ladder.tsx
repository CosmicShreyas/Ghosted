// The impact ladder: what happened after a story was posted.
//
//   Posted → Seen by the team → Heard → Being looked into → Changed
//
// "Changed" lights up two ways, each labelled for what it is: a rep's one-tap "fixed" ("The
// company says this is fixed", their claim) or a citation in a "You said, we did" note (public,
// reviewed text). Reps of the story's company get one-tap buttons for the next steps: forward
// only, each once, never edited. Counts only: never which rep saw or responded.
// Rules: backend/src/impact.ts.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { BadgeCheck, Check, Eye, Hammer, Loader2, MessageSquareReply, PenLine, Sparkles, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ApiRequestError } from "@/lib/api";
import { useStoryImpact, type Impact, type ImpactStatus } from "@/lib/company-voice";
import { useTone, voice } from "@/lib/session";
import { cn } from "@/lib/utils";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null);
const RANK: Record<ImpactStatus, number> = { heard: 1, looking_into_it: 2, fixed: 3 };
const ACTION: Record<ImpactStatus, { label: string; icon: typeof Check; confirm: string }> = {
  heard: { label: "We've heard this", icon: Check, confirm: "The author is told the company has heard them." },
  looking_into_it: { label: "We're looking into it", icon: Wrench, confirm: "The author is told the company is looking into it." },
  fixed: { label: "We've fixed this", icon: Hammer, confirm: "Shown publicly as \"The company says this is fixed\". Only claim it if it's true: candidates can still post if it isn't." },
};

type Step = { key: string; label: string; done: boolean; detail: string | null; note?: string | null; icon: typeof Check; link?: { to: string; label: string } };

function stepsOf(impact: Impact, createdAt: string | null, company: string, slug?: string): Step[] {
  const at = (s: ImpactStatus) => impact.steps.find((x) => x.status === s);
  const fixed = at("fixed"), cited = impact.cited[0];
  return [
    { key: "posted", label: "Posted", done: true, detail: fmt(createdAt), icon: PenLine },
    { key: "seen", label: "Seen by the team", done: impact.repViews > 0, detail: impact.repViews ? `Seen by ${impact.repViews} ${impact.repViews === 1 ? "person" : "people"} at ${company}` : null, icon: Eye },
    { key: "heard", label: "Heard", done: !!at("heard"), detail: fmt(at("heard")?.at ?? null), note: at("heard")?.note ?? null, icon: Check },
    { key: "looking", label: "Being looked into", done: !!at("looking_into_it"), detail: fmt(at("looking_into_it")?.at ?? null), note: at("looking_into_it")?.note ?? null, icon: Wrench },
    {
      key: "changed", label: "Changed", done: !!fixed || !!cited, icon: Sparkles, note: fixed?.note ?? null,
      // Labelled for its source: the company's own claim, or a reviewed public change note.
      detail: cited ? `Cited in a change note · ${fmt(cited.at)}` : fixed ? `The company says this is fixed · ${fmt(fixed.at)}` : null,
      ...(cited && { link: { to: `/c/${slug ?? ""}#change-${cited.changePublicId}`, label: "Read the change note" } }),
    },
  ];
}

// The rep's buttons: only the steps still ahead, each confirmed, with an optional short note.
function RepActions({ impact, onSet }: { impact: Impact; onSet: (s: ImpactStatus, note?: string) => Promise<{ notePending: boolean }> }) {
  const top = Math.max(0, ...impact.steps.map((s) => RANK[s.status]));
  const next = (Object.keys(RANK) as ImpactStatus[]).filter((s) => RANK[s] > top);
  const [picked, setPicked] = useState<ImpactStatus | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!next.length) return <p className="mt-3 text-xs text-muted-foreground">Every step is set. Steps can't be changed.</p>;
  const go = async () => {
    if (!picked) return;
    setBusy(true);
    try { const r = await onSet(picked, note); toast.success(r.notePending ? "Step set. Your note appears after a quick check." : "Step set. The author has been told."); setPicked(null); setNote(""); }
    catch (e) { toast.error(e instanceof ApiRequestError ? e.message : "Couldn't set that step. Try again."); }
    finally { setBusy(false); }
  };
  return <div className="mt-4 rounded-lg border-2 border-dashed border-sky-700 p-3 dark:border-sky-400">
    <p className="flex items-center gap-1.5 text-xs font-bold"><BadgeCheck className="size-4 text-sky-700 dark:text-sky-400" />Respond as a verified company representative</p>
    <p className="mt-0.5 text-[11px] text-muted-foreground">Steps only move forward and can't be edited or undone. The author is told, never who you are.</p>
    <div className="mt-2 flex flex-wrap gap-2">{next.map((s) => { const A = ACTION[s]; return <Button key={s} size="sm" variant="outline" className="min-h-10" onClick={() => setPicked(s)}><A.icon />{A.label}</Button>; })}</div>
    <AlertDialog open={!!picked} onOpenChange={(v) => { if (!v && !busy) setPicked(null); }}>
      <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-xl border-2 border-foreground shadow-hard">
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle className="font-display text-xl">{picked ? ACTION[picked].label : ""}?</AlertDialogTitle>
          <AlertDialogDescription>{picked ? ACTION[picked].confirm : ""} This can't be changed later.</AlertDialogDescription>
        </AlertDialogHeader>
        <label className="block text-sm font-bold">Short note <span className="font-normal text-muted-foreground">(optional, public)</span>
          <Textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 280))} rows={3} placeholder="What you heard, or what's changing. No names." className="mt-1.5 border-2 border-foreground" />
          <span className="mt-1 block text-right text-[11px] font-normal text-muted-foreground tabular-nums">{note.length}/280</span>
        </label>
        <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); void go(); }} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Check />}Set this step</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}

// On the story page. Shown to the author and the company's reps always; to everyone else once the
// company has done something.
export function ImpactLadder({ storyPublicId, createdAt, isAuthor }: { storyPublicId: string; createdAt: string | null; isAuthor: boolean }) {
  const tone = useTone();
  const { data, setStatus } = useStoryImpact(storyPublicId);
  if (!data?.impact) return null;
  const { impact, viewerIsRep } = data;
  const company = data.company?.name ?? "the company";
  const moved = impact.repViews > 0 || impact.steps.length > 0 || impact.replied || impact.cited.length > 0;
  if (!moved && !isAuthor && !viewerIsRep) return null;
  const steps = stepsOf(impact, createdAt, company, data.company?.slug);
  const current = steps.reduce((n, s, i) => (s.done ? i : n), 0);

  return <section aria-label="What happened after this story" className="rounded-xl border-2 border-foreground bg-card p-4 shadow-hard-sm sm:p-5">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="font-display text-lg font-bold">What happened next</h2>
      <p className="text-xs text-muted-foreground">{moved ? `${company}'s response, step by step` : isAuthor ? voice(tone, `Waiting for ${company} to notice. They will.`, `You'll be told when ${company} sees or responds to it.`) : `Waiting for ${company}`}</p>
    </div>
    {/* Phones: a vertical list. Tablet and up: one row, the line between the balls filling as it moves. */}
    <ol className="mt-4 grid gap-3 sm:grid-cols-5 sm:gap-2">{steps.map((s, i) => <li key={s.key} className="relative flex gap-3 sm:flex-col sm:items-center sm:gap-2 sm:text-center">
      {i > 0 && <span aria-hidden="true" className={cn("absolute hidden h-0.5 sm:block sm:top-4 sm:-left-1/2 sm:right-1/2", i <= current ? "bg-flag-green" : "bg-foreground/15")} />}
      <span className={cn("relative z-10 grid size-8 shrink-0 place-items-center rounded-full border-2", s.done ? "border-foreground bg-flag-green text-primary-foreground" : "border-foreground/25 bg-card text-muted-foreground")}><s.icon className="size-4" /></span>
      <span className="min-w-0">
        <span className={cn("block text-sm font-bold", !s.done && "text-muted-foreground")}>{s.label}</span>
        {s.detail && <span className="block text-[11px] text-muted-foreground">{s.detail}</span>}
        {s.link && <a href={s.link.to} className="text-[11px] font-bold text-primary hover:underline">{s.link.label}</a>}
      </span>
    </li>)}</ol>
    {/* Notes from the company, labelled as such. */}
    {steps.filter((s) => s.note).map((s) => <p key={s.key} className="mt-3 rounded-lg border-l-4 border-sky-700 bg-sky-50 p-2.5 text-sm dark:border-sky-400 dark:bg-sky-950/40">
      <span className="mb-0.5 flex items-center gap-1 text-[11px] font-bold"><BadgeCheck className="size-3.5 text-sky-700 dark:text-sky-400" />Verified company representative · {s.label}</span>{s.note}
    </p>)}
    {impact.replied && <p className="mt-3 flex items-center gap-1.5 text-xs font-bold"><MessageSquareReply className="size-4 text-sky-700 dark:text-sky-400" />{company} posted an official reply to this story, shown below.</p>}
    {viewerIsRep && <RepActions impact={impact} onSet={setStatus} />}
  </section>;
}

// My Stories: the same ladder as five small balls and where it's up to.
export function ImpactStrip({ impact, createdAt, company, storyPublicId }: { impact: Impact | undefined; createdAt: string | null; company: string; storyPublicId: string }) {
  if (!impact) return null;
  const steps = stepsOf(impact, createdAt, company);
  const current = steps.reduce((n, s, i) => (s.done ? i : n), 0);
  const label = current === 0 ? `Not seen by ${company} yet` : steps[current]!.detail && current === 1 ? steps[current]!.detail! : steps[current]!.label;
  return <Link to="/s/$id" params={{ id: storyPublicId }} className="flex items-center gap-3 rounded-lg border-2 border-foreground/15 bg-background px-3 py-2 text-xs hover:border-foreground" aria-label={`Impact: ${label}. Open the story`}>
    <span className="flex items-center" aria-hidden="true">{steps.map((s, i) => <span key={s.key} className="flex items-center">
      {i > 0 && <span className={cn("h-0.5 w-3 sm:w-5", i <= current ? "bg-flag-green" : "bg-foreground/15")} />}
      <span className={cn("size-2.5 rounded-full border-2", s.done ? "border-flag-green bg-flag-green" : "border-foreground/25 bg-card")} />
    </span>)}</span>
    <span className="min-w-0 flex-1 truncate font-semibold">{label}</span>
    {impact.replied && <span className="inline-flex shrink-0 items-center gap-1 font-bold text-sky-700 dark:text-sky-400"><MessageSquareReply className="size-3.5" />Reply</span>}
  </Link>;
}
