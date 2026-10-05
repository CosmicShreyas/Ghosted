import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import { Bookmark, Check, Flag, HandHeart, Heart, HeartHandshake, Lightbulb, MessageCircle, MoreHorizontal, PenLine, Plus, Share2, ShieldAlert, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Avatar, QuickBadge } from "@/components/ghosted";
import { LevelBadge, markRead } from "@/lib/levels";
import { plainText, StoryBody } from "@/components/markdown";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api, ApiRequestError, apiEnabled, askToJoin } from "@/lib/api";
import { liveNudge } from "@/lib/live";
import { useMe, useTone, voice } from "@/lib/session";
import { GREEN_FLAG_LABEL, react, samplePublicId, type Author, type StoryModel, type StoryReaction, type StoryReactionCounts } from "@/lib/stories";
import { ShareModal } from "./share-story";
import { shareInputFromStory, StoryShareDialog } from "./story-share";
import { GOOFY_AVATAR, GOOFY_ID } from "@/lib/goofy";
import { ReportFlow } from "./report-flow";
import { cn, formatCount } from "@/lib/utils";
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

const REACTIONS: { id: StoryReaction; label: string; Icon: typeof HeartHandshake; active: string; soft: string }[] = [
  { id: "relatable", label: "Relatable", Icon: HeartHandshake, active: "border-primary bg-primary text-primary-foreground", soft: "text-primary hover:bg-primary/10" },
  { id: "insightful", label: "Eye-opening", Icon: Lightbulb, active: "border-sky-600 bg-sky-500 text-white", soft: "text-sky-700 hover:bg-sky-500/10 dark:text-sky-300" },
  { id: "creative", label: "Fresh take", Icon: Sparkles, active: "border-emerald-700 bg-emerald-500 text-slate-950", soft: "text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300" },
  { id: "support", label: "With you", Icon: HandHeart, active: "border-amber-700 bg-amber-400 text-slate-950", soft: "text-amber-700 hover:bg-amber-400/15 dark:text-amber-300" },
  { id: "love", label: "Love this", Icon: Heart, active: "border-pink-700 bg-pink-500 text-white", soft: "text-pink-700 hover:bg-pink-500/10 dark:text-pink-300" },
];

// `full`: the story's own page (whole text, no "Read more", the chitchat pill scrolls to the thread).
// Everywhere else the title and text open that page.
export function FeedStory({ story, saved, onSave, onOpenCompany, full = false }: { story: StoryModel; saved: boolean; onSave: () => void; onOpenCompany: (c: Company) => void; full?: boolean }) {
  const { company, author } = story;
  // Counts and your reactions start from the server's (or the sample's) and update instantly on tap.
  const [state, setState] = useState({ mine: story.myReaction, counts: story.reactions });
  const [pickerOpen, setPickerOpen] = useState(false);
  const holdTimer = useRef<number | null>(null);
  const held = useRef(false);
  const reactSeq = useRef(0);
  useEffect(() => setState({ mine: story.myReaction, counts: story.reactions }), [story.myReaction, story.reactions]);
  // On the story's own page: after 8 seconds of reading, it counts as read (XP, once per story).
  useEffect(() => { if (!full) return; const t = window.setTimeout(() => markRead(story.id), 8000); return () => window.clearTimeout(t); }, [full, story.id]);
  const toggle = async (kind: StoryReaction) => {
    const prev = state;
    const next = prev.mine === kind ? null : kind;
    const counts = { ...prev.counts };
    if (prev.mine) counts[prev.mine] = Math.max(0, counts[prev.mine] - 1);
    if (next) counts[next] += 1;
    setState({ mine: next, counts });
    setPickerOpen(false);
    if (!apiEnabled) return;
    // Quick double taps: only the latest reply may set the counts, so an older one can't undo a newer tap.
    const seq = ++reactSeq.current;
    try { const r = await react(story.id, kind); if (seq !== reactSeq.current) return; setState({ mine: r.myReaction, counts: { relatable: r.counts.relatable, insightful: r.counts.insightful, creative: r.counts.creative, support: r.counts.support, love: r.counts.love } }); }
    // Signed out: the page's join prompt opens instead (api.ts), so no extra error toast.
    catch (err) { if (seq === reactSeq.current) setState(prev); if (!(err instanceof ApiRequestError && err.status === 401)) toast.error("Couldn't save that. Try again."); }
  };
  const startHold = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") return;
    held.current = false;
    holdTimer.current = window.setTimeout(() => { held.current = true; setPickerOpen(true); }, 450);
  };
  const endHold = () => { if (holdTimer.current != null) window.clearTimeout(holdTimer.current); holdTimer.current = null; };
  // Opens the share popup: the story card plus a LinkedIn post written from the story (story-share.tsx).
  const [sharing, setSharing] = useState(false);
  const share = () => setSharing(true);
  // Rough reading time (220 words a minute), shown for longer stories.
  const minutes = Math.max(1, Math.round(story.body.split(/\s+/).length / 220));

  const pill = (active: boolean) => cn("inline-flex items-center gap-1.5 rounded-full border-2 border-foreground px-3 py-1 text-xs font-bold transition-colors", active ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted");
  const selected = REACTIONS.find((r) => r.id === state.mine) ?? REACTIONS[0]!;

  // Your own stories get Edit and Delete (in the preview, the sample person standing in for you).
  const { me, signedIn } = useMe();
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
    className={cn(card, "p-5", !full && "cursor-pointer transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-hard", story.greenFlags?.length && "border-flag-green bg-flag-green/[0.07] shadow-[4px_4px_0_0_var(--flag-green)]")}>
    <div className="flex items-start gap-3">
      {/* The avatar and name open this person's page (addressed by id, whatever name they show). */}
      <PersonLink author={author} className="shrink-0 rounded-full"><Avatar seed={author.avatarSeed} pastel={author.pastel} size="sm" label={author.name} /></PersonLink>
      <div className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5"><PersonLink author={author} className="block truncate text-sm font-bold underline-offset-2 hover:underline">{author.name}</PersonLink><LevelBadge level={author.level} size="xs" /></span>
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
          <DropdownMenuItem onSelect={() => (apiEnabled && !signedIn ? askToJoin() : onSave())}><Bookmark className={cn(saved && "fill-primary text-primary")} />{saved ? "Remove from saved" : "Save story"}</DropdownMenuItem>
          {isMine ? <>
            <DropdownMenuItem onSelect={() => setEditing(true)}><PenLine />Edit story</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setConfirmDelete(true)} className="text-flag-red focus:bg-flag-red focus:text-primary-foreground"><Trash2 />Delete story</DropdownMenuItem>
          </> : <DropdownMenuItem onSelect={() => setReporting(true)} className="text-flag-red focus:bg-flag-red focus:text-primary-foreground"><ShieldAlert />Report story</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    {/* In the feed every card is the same height: one row of tags, a one-line title and exactly three
        lines of story (padded when shorter, cut with "…" when longer). The full story is one click away. */}
    <div className={cn("mt-3 flex items-center gap-2", full ? "flex-wrap" : "min-w-0 flex-nowrap overflow-hidden")}>{story.greenFlags?.length
      ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full border-2 border-foreground bg-flag-green px-2.5 py-0.5 text-[11px] font-bold uppercase text-primary-foreground"><Flag className="size-3" />Green flag shout-out</span>
      : <><span className="shrink-0 rounded-full border-2 border-foreground bg-accent px-2.5 py-0.5 text-[11px] font-bold uppercase">{story.outcomeLabel}</span>{story.quick && <span className="shrink-0"><QuickBadge /></span>}</>}{story.role && <span className={cn("text-xs font-semibold text-muted-foreground", !full && "min-w-0 truncate")}>{story.role}</span>}{minutes > 1 && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{minutes} min read</span>}</div>
    {full
      ? <>{story.title && <h1 className="mt-3 font-display text-2xl font-bold leading-tight sm:text-3xl">{story.title}</h1>}
        {/* A shout-out's ticks, as green chips (the feed card keeps its fixed height and skips them). */}
        {!!story.greenFlags?.length && <ul className="mt-3 flex flex-wrap gap-2">{story.greenFlags.map((g) => <li key={g} className="inline-flex items-center gap-1.5 rounded-full border-2 border-flag-green bg-flag-green/10 px-3 py-1 text-xs font-bold"><Check className="size-3.5 text-flag-green" />{GREEN_FLAG_LABEL[g]}</li>)}</ul>}<StoryBody text={story.body} fold={false} className={cn("text-[16px] sm:text-[17px]", story.title ? "mt-3" : "mt-3")} /></>
      : <>
          {/* The card itself opens the story; the title is also a real link for keyboards and screen readers. */}
          <h3 className="mt-3 truncate font-bold leading-snug"><Link to="/s/$id" params={{ id: story.id }} className="rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" aria-label={`Open the story${story.title ? `: ${story.title}` : ""}`}>{story.title ?? `A story about ${company.name}`}</Link></h3>
          {/* Exactly three lines, cut with "…"; tapping the card (or the title) opens the whole story. */}
          <p className="mt-1.5 line-clamp-3 h-[4.875em] leading-[1.625] text-foreground/90">{plainText(story.body)}</p>
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
    <div className="relative mt-4 flex flex-wrap items-center gap-2">
      <div className="flex items-stretch">
        <button type="button" aria-pressed={!!state.mine} aria-label={`${state.mine ? `Remove ${selected.label}` : "Relatable"}. Press and hold on touch screens for more reactions.`}
          onPointerDown={startHold} onPointerUp={endHold} onPointerCancel={endHold} onPointerLeave={endHold}
          onContextMenu={(e) => e.preventDefault()}
          onClick={() => { if (held.current) { held.current = false; return; } void toggle(state.mine ?? "relatable"); }}
          className={cn("inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-xs font-bold transition-colors [@media(pointer:fine)]:rounded-r-none", state.mine ? selected.active : "border-foreground bg-card hover:bg-muted")}>
          <selected.Icon className={cn("size-3.5", state.mine === "love" && "fill-current")} />{formatCount(state.counts[state.mine ?? "relatable"])} {state.mine ? selected.label.toLowerCase() : "relatable"}
        </button>
        <button type="button" aria-label="Choose another reaction" aria-expanded={pickerOpen} onClick={() => setPickerOpen((v) => !v)} className="hidden w-8 place-items-center rounded-r-full border-2 border-l-0 border-foreground bg-card hover:bg-muted [@media(pointer:fine)]:grid"><Plus className="size-3.5" /></button>
      </div>
      {/* One strip above the button on every screen. Phones get icon + count only, so all five fit in a row. */}
      <AnimatePresence>{pickerOpen && <motion.div initial={{ opacity: 0, y: 6, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.96 }} transition={{ type: "spring", stiffness: 500, damping: 32 }}
        className="absolute bottom-10 left-0 z-20 flex max-w-[calc(100vw-3rem)] origin-bottom-left gap-1 rounded-full border-2 border-foreground bg-card p-1 shadow-hard sm:gap-1.5 sm:rounded-xl sm:p-2" role="menu" aria-label="Story reactions">
        {REACTIONS.map(({ id, label, Icon, active, soft }) => <button key={id} type="button" role="menuitemradio" aria-checked={state.mine === id} aria-label={`${label}, ${state.counts[id]}`} onClick={() => void toggle(id)} title={label} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border-2 border-transparent px-2 py-1.5 text-xs font-bold sm:gap-1.5 sm:px-2.5", state.mine === id ? active : soft)}><Icon className={cn("size-4", id === "love" && state.mine === id && "fill-current")} /><span className="hidden sm:inline">{label}</span><span className="tabular-nums opacity-75">{formatCount(state.counts[id])}</span></button>)}
      </motion.div>}</AnimatePresence>
      {full
        ? <button type="button" onClick={() => document.getElementById("chitchats")?.scrollIntoView({ behavior: "smooth", block: "start" })} className={pill(false)}><MessageCircle className="size-3.5" />{formatCount(story.comments)} chitchats</button>
        : <Link to="/s/$id" params={{ id: story.id }} hash="chitchats" className={pill(false)}><MessageCircle className="size-3.5" />{formatCount(story.comments)} chitchats</Link>}
      <span className="flex-1" />
      <button type="button" onClick={share} aria-label="Share story" className="grid size-8 place-items-center rounded-lg hover:bg-muted"><Share2 className="size-4" /></button>
    </div>
    {sharing && <StoryShareDialog open={sharing} onOpenChange={setSharing} input={shareInputFromStory(story, isMine)} />}
  </motion.article>;
}

// The "Share a story" flow lives in share-story.tsx.

// The company popups and right rail live in global-widgets.tsx.
