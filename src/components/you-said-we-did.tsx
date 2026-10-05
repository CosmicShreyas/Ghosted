// "You said, we did": a company's public timeline of what it changed, each note linked to the
// candidate stories behind it. Written only by verified representatives (4 a month, 1 to 5 stories
// each), checked like every post, never edited, and only ever removed by moderators.
// Rules: backend/src/changes.ts.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { BadgeCheck, Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Markdown } from "@/components/markdown";
import { ApiRequestError, apiEnabled } from "@/lib/api";
import { useChanges } from "@/lib/company-voice";
import { useTone, voice } from "@/lib/session";
import type { StoryModel } from "@/lib/stories";
import { cn } from "@/lib/utils";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

function Composer({ name, stories, left, max, onPost }: { name: string; stories: StoryModel[]; left: number; max: number; onPost: (body: string, ids: string[]) => Promise<string | null> }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= max ? p : [...p, id]));
  const ready = body.trim().length >= 30 && picked.length > 0;
  const post = async () => {
    setBusy(true);
    try {
      const held = await onPost(body.trim(), picked);
      toast.success(held ?? "Posted. Every cited author has been told.");
      setOpen(false); setBody(""); setPicked([]); setConfirm(false);
    } catch (e) { toast.error(e instanceof ApiRequestError ? e.message : "Couldn't post the note. Try again."); }
    finally { setBusy(false); }
  };
  if (left <= 0) return <p className="rounded-lg border-2 border-dashed border-sky-700 p-3 text-xs text-muted-foreground dark:border-sky-400">You've used this month's change notes. You can post again next month.</p>;
  if (!open) return <div className="rounded-lg border-2 border-dashed border-sky-700 p-3 dark:border-sky-400">
    <p className="flex items-center gap-1.5 text-sm font-bold"><BadgeCheck className="size-4 text-sky-700 dark:text-sky-400" />You're a verified representative of {name}</p>
    <p className="mt-0.5 text-xs text-muted-foreground">Tell candidates what you changed because of their stories. {left} of 4 notes left this month. Notes can't be edited or deleted.</p>
    <Button size="sm" variant="outline" className="mt-2" onClick={() => setOpen(true)}><Sparkles />Post a change note</Button>
  </div>;
  return <div className="rounded-lg border-2 border-sky-700 p-3 dark:border-sky-400">
    <label className="block text-sm font-bold">What changed?
      <Textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, 800))} rows={4} placeholder="e.g. Every candidate now hears back within 7 days of their final round, yes or no." className="mt-1.5 border-2 border-foreground" />
    </label>
    <p className="mt-1 flex justify-between text-[11px] text-muted-foreground"><span>Facts only, no names. Checked like every post.</span><span className="tabular-nums">{body.length}/800</span></p>
    <p className="mt-3 text-sm font-bold">Which stories led to it? <span className="font-normal text-muted-foreground">({picked.length}/{max})</span></p>
    {stories.length ? <ul className="mt-1.5 max-h-56 space-y-1.5 overflow-y-auto pr-1" data-lenis-prevent>{stories.map((s) => {
      const on = picked.includes(s.id);
      return <li key={s.id}><button type="button" aria-pressed={on} onClick={() => toggle(s.id)} disabled={!on && picked.length >= max} className={cn("flex w-full items-center gap-2 rounded-lg border-2 p-2 text-left text-sm disabled:opacity-50", on ? "border-sky-700 bg-sky-50 dark:border-sky-400 dark:bg-sky-950/40" : "border-foreground/15 hover:border-foreground")}>
        <span className={cn("grid size-5 shrink-0 place-items-center rounded border-2", on ? "border-sky-700 bg-sky-700 text-white dark:border-sky-400 dark:bg-sky-400" : "border-foreground/40")}>{on && <Check className="size-3" />}</span>
        <span className="min-w-0 flex-1 truncate">{s.title ?? s.outcomeLabel}</span>
      </button></li>;
    })}</ul> : <p className="mt-1.5 text-xs text-muted-foreground">Scroll the stories below to load them here.</p>}
    <div className="mt-3 flex flex-wrap justify-end gap-2">
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      <Button size="sm" disabled={!ready} onClick={() => setConfirm(true)}>Review and post</Button>
    </div>
    <AlertDialog open={confirm} onOpenChange={(v) => { if (!busy) setConfirm(v); }}>
      <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-xl border-2 border-foreground shadow-hard">
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle className="font-display text-xl">Post this change note?</AlertDialogTitle>
          <AlertDialogDescription>It goes on {name}'s page for good, labelled as from a verified company representative. You can't edit or delete it, and the {picked.length} cited {picked.length === 1 ? "author is" : "authors are"} told.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <AlertDialogCancel disabled={busy}>Keep editing</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); void post(); }} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Sparkles />}Post it</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}

export function YouSaidWeDid({ slug, name, stories }: { slug: string; name: string; stories: StoryModel[] }) {
  const tone = useTone();
  const { data, post } = useChanges(slug);
  if (!apiEnabled || !data) return null;
  if (!data.changes.length && !data.viewerIsRep) return null;
  return <section id="changes" aria-labelledby="changes-heading" className="space-y-4">
    <div>
      <h2 id="changes-heading" className="flex items-center gap-2 text-2xl font-bold"><Sparkles className="size-6 text-flag-green" />You said, we did</h2>
      <p className="mt-1 text-sm text-muted-foreground">{voice(tone, `What ${name} says it changed because of candidates' stories. Their words, with the receipts linked.`, `Changes ${name} says it made after candidates' stories, linked to the stories behind them.`)}</p>
    </div>
    {data.viewerIsRep && <Composer name={name} stories={stories} left={data.leftThisMonth} max={data.maxCited ?? 5} onPost={post} />}
    {data.changes.length > 0 && <ol className="relative space-y-4 border-l-2 border-flag-green/50 pl-5">{data.changes.map((ch) => <li key={ch.publicId} id={`change-${ch.publicId}`} className="relative scroll-mt-24">
      <span aria-hidden="true" className="absolute -left-[1.72rem] top-4 size-3.5 rounded-full border-2 border-foreground bg-flag-green" />
      <article className="rounded-xl border-2 border-foreground bg-card p-4 shadow-hard-sm">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-700 px-2 py-0.5 font-bold text-white dark:bg-sky-400 dark:text-sky-950"><BadgeCheck className="size-3.5" />Verified company representative</span>
          <span className="text-muted-foreground">{fmt(ch.createdAt)}</span>
        </p>
        <Markdown text={ch.body} className="mt-2 text-[15px]" />
        {ch.stories.length > 0 && <div className="mt-3 border-t-2 border-dashed border-foreground/15 pt-2.5">
          <p className="text-[11px] font-bold uppercase text-muted-foreground">Because of {ch.stories.length === 1 ? "this story" : `these ${ch.stories.length} stories`}</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">{ch.stories.map((s) => <li key={s.publicId}><Link to="/s/$id" params={{ id: s.publicId }} className="inline-flex max-w-[18rem] items-center gap-1 truncate rounded-full border-2 border-foreground/20 px-2.5 py-0.5 text-xs font-semibold hover:border-foreground">{s.title}</Link></li>)}</ul>
        </div>}
        <p className="mt-2 text-[11px] text-muted-foreground">The company's own account of what changed. Candidates can keep sharing if it hasn't.</p>
      </article>
    </li>)}</ol>}
  </section>;
}
