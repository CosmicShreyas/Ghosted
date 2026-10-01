import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import { Bookmark, Flag, HeartHandshake, MessageCircle, MoreHorizontal, PenLine, Share2, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Avatar } from "@/components/ghosted";
import { StoryBody } from "@/components/markdown";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api, ApiRequestError, apiEnabled } from "@/lib/api";
import { liveNudge } from "@/lib/live";
import { useMe, useTone, voice } from "@/lib/session";
import { react, samplePublicId, type Author, type StoryModel } from "@/lib/stories";
import { ShareModal } from "./share-story";
import { GOOFY_AVATAR, GOOFY_ID } from "@/lib/goofy";
import { ReportFlow } from "./report-flow";
import { cn } from "@/lib/utils";
import type { Company } from "@/mock/data";

// Shared class names (re-exported: many components import them from here).
export { card, popup, popupBody, scoreTone } from "./ui-kit";
import { card, popup, popupBody, scoreTone } from "./ui-kit";

// ---------- reporting someone else's story ----------

// The three-step report (report-flow.tsx), wired to the story's report endpoint.
function ReportStoryDialog({ open, onOpenChange, storyId, subject }: { open: boolean; onOpenChange: (v: boolean) => void; storyId: string; subject?: string | null }) {
  const send = async (reason: string, details: string) => apiEnabled
    ? (await api<{ message: string }>(`/v1/stories/${storyId}/report`, { method: "POST", body: { reason, ...(details && { details }) } })).message
    : "In the live app, Goofy checks it straight away and moderators review it within 24 hours.";
  return <ReportFlow open={open} onOpenChange={onOpenChange} kind="story" subject={subject} onSubmit={send} />;
}

// ---------- links to a person's page ----------

// Wraps an avatar or name so it opens that person's page (/u/<publicId>).
export function PersonLink({ author, className, children }: { author: Pick<Author, "publicId" | "name">; className?: string; children: ReactNode }) {
  if (!author.publicId) return <span className={className}>{children}</span>;
  return <Link to="/u/$id" params={{ id: author.publicId }} className={cn("focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2", className)} aria-label={`Open ${author.name}'s page`}>{children}</Link>;
}

// ---------- story card with working reactions, save and share ----------

type Reactions = { relatable: boolean; flag: boolean };

// `full`: the story's own page (whole text, no "Read more", the chitchat pill scrolls to the thread).
// Everywhere else the title and text open that page.
export function FeedStory({ story, saved, onSave, onOpenCompany, full = false }: { story: StoryModel; saved: boolean; onSave: () => void; onOpenCompany: (c: Company) => void; full?: boolean }) {
  const { company, author } = story;
  // Counts and your reactions start from the server's (or the sample's) and update instantly on tap.
  const [state, setState] = useState({ mine: story.mine, relatable: story.relatable, flags: story.flags });
  useEffect(() => setState({ mine: story.mine, relatable: story.relatable, flags: story.flags }), [story.mine, story.relatable, story.flags]);
  const toggle = async (k: keyof Reactions) => {
    const prev = state;
    const on = !prev.mine[k];
    const count = k === "relatable" ? "relatable" : "flags";
    setState({ ...prev, mine: { ...prev.mine, [k]: on }, [count]: prev[count] + (on ? 1 : -1) });
    if (!apiEnabled) return;
    try { const r = await react(story.id, k); setState({ mine: r.myReactions, relatable: r.counts.relatable, flags: r.counts.flags }); }
    catch (err) { setState(prev); toast.error(err instanceof ApiRequestError && err.status === 401 ? "Log in to react." : "Couldn't save that. Try again."); }
  };
  // Links go to the story's own page. Phones get the native share sheet; elsewhere it's copied.
  const share = async () => {
    const url = `${window.location.origin}/s/${story.id}`;
    const title = story.title ?? `A story about ${company.name}`;
    try {
      if (navigator.share && window.matchMedia("(pointer: coarse)").matches) { await navigator.share({ title, url }); return; }
      await navigator.clipboard.writeText(url); toast.success("Link copied. Spread the receipts.");
    } catch (err) { if ((err as Error).name !== "AbortError") toast.error("Couldn't copy the link."); }
  };
  // Rough reading time (220 words a minute), shown for longer stories.
  const minutes = Math.max(1, Math.round(story.body.split(/\s+/).length / 220));

  const pill = (active: boolean) => cn("inline-flex items-center gap-1.5 rounded-full border-2 border-foreground px-3 py-1 text-xs font-bold transition-colors", active ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted");
  const { mine } = state;

  // Your own stories get Edit and Delete (in the preview, the sample person standing in for you).
  const { me } = useMe();
  const tone = useTone();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isMine = !!author.publicId && author.publicId === (apiEnabled ? me.publicId : samplePublicId("u1"));
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [reporting, setReporting] = useState(false);
  const remove = async () => {
    try {
      if (apiEnabled) await api(`/v1/stories/${story.id}`, { method: "DELETE" });
      setDeleted(true);
      toast.success(voice(tone, "Story deleted. Poof, like a recruiter after the final round.", "Your story has been deleted."));
      for (const key of [["feed"], ["my-stories"], ["person"], ["insights"]]) void qc.invalidateQueries({ queryKey: key });
      liveNudge();
    } catch (err) { toast.error(err instanceof ApiRequestError ? err.message : "Couldn't delete it right now. Try again."); }
    finally { setConfirmDelete(false); }
  };
  const editedLabel = voice(tone, "Edited, receipts updated", "Edited");
  if (deleted) return null;

  // The whole card opens the story (outside its own page). Clicks on anything interactive inside
  // (author, company, reactions, menus), selecting text, and ctrl/cmd-clicks keep their usual job.
  const openStory = (e: React.MouseEvent) => {
    if (full || e.defaultPrevented || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("a, button, input, textarea, select, [role='menu'], [role='menuitem'], [role='dialog']")) return;
    if (window.getSelection()?.toString()) return;
    if (e.metaKey || e.ctrlKey) { window.open(`/s/${story.id}`, "_blank", "noopener"); return; }
    void navigate({ to: "/s/$id", params: { id: story.id } });
  };

  return <motion.article layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} onClick={openStory}
    className={cn(card, "p-5", !full && "cursor-pointer transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-hard")}>
    <div className="flex items-start gap-3">
      {/* The avatar and name open this person's page (addressed by id, whatever name they show). */}
      <PersonLink author={author} className="shrink-0 rounded-full"><Avatar seed={author.avatarSeed} pastel={author.pastel} size="sm" label={author.name} /></PersonLink>
      <div className="min-w-0 flex-1">
        <PersonLink author={author} className="block truncate text-sm font-bold underline-offset-2 hover:underline">{author.name}</PersonLink>
        <p className="flex min-w-0 flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
          <span className="truncate">about <Link to="/c/$slug" params={{ slug: company.id }} className="font-semibold text-foreground underline underline-offset-2 decoration-foreground/30 transition-colors hover:text-primary hover:decoration-primary">{company.name}</Link> · {story.timeLabel}</span>
          {story.goofy === "redacted" && <Link to="/u/$id" params={{ id: GOOFY_ID }} title="Goofy, our AutoMod, replaced a person's name with [name] so nobody can be identified" className="inline-flex items-center gap-1 rounded-full border border-foreground/30 py-px pl-0.5 pr-1.5 text-[10px] font-bold uppercase tracking-wide hover:bg-muted"><img src={GOOFY_AVATAR} alt="" className="size-3.5 rounded-full object-cover" />Name hidden by Goofy</Link>}
          {story.editedAt && <span title={`Edited ${new Date(story.editedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`} className="inline-flex items-center gap-0.5 rounded-full border border-foreground/30 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide"><PenLine className="size-2.5" />{editedLabel}</span>}
        </p>
      </div>
      <Link to="/c/$slug" params={{ slug: company.id }} className={cn("shrink-0 rounded-lg border-2 border-foreground px-2 py-0.5 font-display text-sm font-bold transition-transform hover:-translate-y-0.5", scoreTone(company.score))} aria-label={`${company.name} Flag Score ${company.score}: open the company page`}>{company.score}</Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><button type="button" aria-label="Story options" className="-mr-1 grid size-8 shrink-0 place-items-center rounded-lg border-2 border-transparent hover:border-foreground hover:bg-muted"><MoreHorizontal className="size-4" /></button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {isMine ? <>
            <DropdownMenuItem onSelect={() => setEditing(true)}><PenLine />Edit story</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setConfirmDelete(true)} className="text-flag-red focus:bg-flag-red focus:text-primary-foreground"><Trash2 />Delete story</DropdownMenuItem>
          </> : <DropdownMenuItem onSelect={() => setReporting(true)} className="text-flag-red focus:bg-flag-red focus:text-primary-foreground"><ShieldAlert />Report story</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2"><span className="rounded-full border-2 border-foreground bg-accent px-2.5 py-0.5 text-[11px] font-bold uppercase">{story.outcomeLabel}</span>{story.role && <span className="text-xs font-semibold text-muted-foreground">{story.role}</span>}{minutes > 1 && <span className="ml-auto text-xs text-muted-foreground">{minutes} min read</span>}</div>
    {full
      ? <>{story.title && <h1 className="mt-3 font-display text-2xl font-bold leading-tight sm:text-3xl">{story.title}</h1>}<StoryBody text={story.body} fold={false} className={cn("text-[16px] sm:text-[17px]", story.title ? "mt-3" : "mt-3")} /></>
      : <>
          {/* The card itself opens the story; the title is also a real link for keyboards and screen readers. */}
          <h3 className="mt-3 font-bold leading-snug"><Link to="/s/$id" params={{ id: story.id }} className="rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" aria-label={`Open the story${story.title ? `: ${story.title}` : ""}`}>{story.title ?? `A story about ${company.name}`}</Link></h3>
          <StoryBody text={story.body} className="mt-1.5" />
        </>}
    {!isMine && reporting && <ReportStoryDialog open={reporting} onOpenChange={setReporting} storyId={story.id} subject={story.title ?? story.body.slice(0, 120)} />}
    {isMine && <>
      <ShareModal open={editing} onOpenChange={setEditing} editing={editing ? story : null} />
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-xl border-2 border-foreground shadow-hard">
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle className="font-display text-xl">{voice(tone, "Ghost your own story?", "Delete this story?")}</AlertDialogTitle>
            <AlertDialogDescription>{voice(tone, "It disappears from the feed, your page and the company's score. Unlike some companies, we'll actually tell you it's gone. This can't be undone.", "It will be removed from the feed, your page and the company's score. This can't be undone.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void remove(); }} className="bg-flag-red text-primary-foreground hover:bg-flag-red/90"><Trash2 />Delete story</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>}
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button type="button" aria-pressed={mine.relatable} onClick={() => void toggle("relatable")} className={pill(mine.relatable)}><HeartHandshake className="size-3.5" />{state.relatable} relatable</button>
      {/* Red flags are always red: outlined in red, and solid red once you add yours. */}
      <button type="button" aria-pressed={mine.flag} onClick={() => void toggle("flag")} className={cn("inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-xs font-bold transition-colors", mine.flag ? "border-flag-red bg-flag-red text-primary-foreground" : "border-flag-red bg-card text-flag-red hover:bg-flag-red/10")}><Flag className={cn("size-3.5", !mine.flag && "fill-flag-red/20")} />{state.flags} red flags</button>
      {full
        ? <button type="button" onClick={() => document.getElementById("chitchats")?.scrollIntoView({ behavior: "smooth", block: "start" })} className={pill(false)}><MessageCircle className="size-3.5" />{story.comments} chitchats</button>
        : <Link to="/s/$id" params={{ id: story.id }} hash="chitchats" className={pill(false)}><MessageCircle className="size-3.5" />{story.comments} chitchats</Link>}
      <span className="flex-1" />
      <button type="button" onClick={share} aria-label="Copy link to story" className="grid size-8 place-items-center rounded-lg hover:bg-muted"><Share2 className="size-4" /></button>
      <button type="button" onClick={onSave} aria-pressed={saved} aria-label={saved ? "Remove from saved" : "Save story"} className="grid size-8 place-items-center rounded-lg hover:bg-muted"><Bookmark className={cn("size-4", saved && "fill-primary text-primary")} /></button>
    </div>
  </motion.article>;
}

// The "Share a story" flow lives in share-story.tsx.

// The company popup, red flags popup and right rail live in global-widgets.tsx.


