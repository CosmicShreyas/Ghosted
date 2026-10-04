// The chitchat thread under a story. Chitchats are Ghosted's comments: they can be marked
// relatable, replied to (one level, so conversations stay readable) and reported. No red flags.
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CornerDownRight, HeartHandshake, Loader2, MessageCircle, MoreHorizontal, PenLine, Send, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { GOOFY_AVATAR, GOOFY_ID, speak } from "@/lib/goofy";
import { ReportFlow } from "./report-flow";
import { Avatar } from "@/components/ghosted";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { ApiRequestError } from "@/lib/api";
import { useChitchats, type Chitchat, type ChitchatSort } from "@/lib/chitchats";
import { useReachEnd } from "@/lib/feed";
import { displayName, useMe, useTone, voice } from "@/lib/session";
import { samplePublicId, timeAgo, type Author } from "@/lib/stories";
import { apiEnabled } from "@/lib/api";
import { cn, formatCount } from "@/lib/utils";
import { PersonLink } from "./widgets";
import { card } from "./ui-kit";
import { GameBreak } from "@/components/game-break";

const MAX = 1000;

// ---------- composer ----------

// Also used by Ask candidates (company-voice.tsx): `label` names the button ("Ask", "Answer"),
// `max` caps the length.
export function Composer({ onPost, placeholder, autoFocus, onCancel, compact, label, max }: { onPost: (body: string) => Promise<string | null | void>; placeholder: string; autoFocus?: boolean; onCancel?: () => void; compact?: boolean; label?: string; max?: number }) {
  const { me } = useMe();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const limit = max ?? MAX;
  const ok = text.trim().length >= 2 && text.length <= limit;
  const send = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try {
      const held = await onPost(text.trim());
      // Held by the automatic review: saved, appears after a quick check.
      if (typeof held === "string") speak(held);
      setText(""); onCancel?.();
    }
    catch (err) { if (err instanceof ApiRequestError && err.status !== 401) speak(err.message, "error"); else toast.error(err instanceof ApiRequestError ? "Log in to chitchat." : "Couldn't post that. Try again."); }
    finally { setBusy(false); }
  };
  return <div className="flex items-start gap-3">
    {!compact && <Avatar seed={me.avatarSeed} pastel={me.pastel} size="sm" label={displayName(me)} />}
    <div className="min-w-0 flex-1 rounded-xl border-2 border-foreground bg-background transition-shadow focus-within:shadow-hard-sm">
      <Textarea ref={ref} autoFocus={autoFocus} value={text} maxLength={limit} rows={compact ? 2 : 3} placeholder={placeholder}
        onChange={(e) => { setText(e.target.value); const el = e.target; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 320)}px`; }}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } if (e.key === "Escape") onCancel?.(); }}
        className="min-h-0 resize-none border-0 bg-transparent px-3 py-2.5 shadow-none focus-visible:ring-0" />
      <div className="flex items-center justify-between gap-2 border-t border-foreground/15 px-2 py-1.5">
        <span className="pl-1 text-[11px] text-muted-foreground">{text.length > limit * 0.8 ? `${limit - text.length} left` : <span className="hidden sm:inline">**Markdown** works · Ctrl+Enter to post</span>}</span>
        <div className="flex gap-1.5">
          {onCancel && <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>}
          <Button size="sm" disabled={!ok || busy} onClick={() => void send()}>{busy ? <Loader2 className="animate-spin" /> : <Send />}{label ?? (compact ? "Reply" : "Post")}</Button>
        </div>
      </div>
    </div>
  </div>;
}

// ---------- one chitchat ----------

function Item({ c, isReply, storyAuthorId, onReply, hooks, onReport }: { c: Chitchat; isReply?: boolean; storyAuthorId: string; onReply: () => void; hooks: ReturnType<typeof useChitchats>; onReport: (c: Chitchat) => void }) {
  const tone = useTone();
  const [busy, setBusy] = useState(false);
  if (c.deleted || !c.author) return <div className="flex items-center gap-3 py-2 text-sm italic text-muted-foreground"><span className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-dashed border-foreground/30"><Trash2 className="size-3.5" /></span>This chitchat was deleted.</div>;
  const a: Author = c.author;
  const relate = async () => { try { await hooks.relate(c); } catch (err) { toast.error(err instanceof ApiRequestError && err.status === 401 ? "Log in to react." : "Couldn't save that."); } };
  const remove = async () => { setBusy(true); try { await hooks.remove(c); toast.success(voice(tone, "Chitchat deleted. It never happened.", "Your chitchat was deleted.")); } catch { toast.error("Couldn't delete it."); } finally { setBusy(false); } };
  return <div className="flex gap-3">
    <PersonLink author={a} className="shrink-0 rounded-full"><Avatar seed={a.avatarSeed} pastel={a.pastel} size="sm" label={a.name} /></PersonLink>
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <PersonLink author={a} className="truncate text-sm font-bold hover:underline">{a.name}</PersonLink>
        {a.publicId === storyAuthorId && <span className="rounded-full border border-primary bg-primary/10 px-1.5 py-px text-[10px] font-bold uppercase text-primary">Author</span>}
        <span className="text-xs text-muted-foreground">{timeAgo(c.createdAt)}{c.editedAt ? " · edited" : ""}</span>
      </div>
      <Markdown text={c.body ?? ""} className="mt-1 text-[15px]" />
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {/* Chitchats can be relatable (never red-flagged). */}
        <button type="button" aria-pressed={c.myRelatable} onClick={() => void relate()} className={cn("inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-0.5 text-xs font-bold transition-colors", c.myRelatable ? "border-foreground bg-primary text-primary-foreground" : "border-transparent hover:border-foreground hover:bg-muted")}>
          <HeartHandshake className="size-3.5" />{c.relatable > 0 ? formatCount(c.relatable) : ""}<span className="sr-only sm:not-sr-only">{c.relatable === 1 ? "relatable" : "relatable"}</span>
        </button>
        <button type="button" onClick={onReply} className="inline-flex items-center gap-1.5 rounded-full border-2 border-transparent px-2.5 py-0.5 text-xs font-bold hover:border-foreground hover:bg-muted"><CornerDownRight className="size-3.5" />Reply</button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><button type="button" aria-label="Chitchat options" className="grid size-7 place-items-center rounded-full hover:bg-muted"><MoreHorizontal className="size-4" /></button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            {c.mine
              ? <DropdownMenuItem disabled={busy} onSelect={() => void remove()} className="text-flag-red focus:bg-flag-red focus:text-primary-foreground"><Trash2 />Delete</DropdownMenuItem>
              : <DropdownMenuItem onSelect={() => onReport(c)} className="text-flag-red focus:bg-flag-red focus:text-primary-foreground"><ShieldAlert />Report</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {!isReply && null}
    </div>
  </div>;
}

// ---------- report ----------

// The three-step report (report-flow.tsx) for one chitchat.
function ReportDialog({ target, onClose, onSubmit }: { target: Chitchat | null; onClose: () => void; onSubmit: (c: Chitchat, reason: string, details: string) => Promise<string> }) {
  return <ReportFlow open={!!target} onOpenChange={(v) => { if (!v) onClose(); }} kind="chitchat" subject={target?.body?.slice(0, 140) ?? null}
    onSubmit={(reason, details) => (target ? onSubmit(target, reason, details) : Promise.reject(new Error("Nothing to report")))} />;
}

// ---------- the thread ----------

export function ChitchatThread({ storyId, storyAuthorId }: { storyId: string; storyAuthorId: string }) {
  const tone = useTone();
  const { me } = useMe();
  const myAuthor: Author = { publicId: me.publicId ?? samplePublicId("u1"), name: displayName(me), avatarSeed: me.avatarSeed, pastel: me.pastel, revealed: null };
  const [sort, setSort] = useState<ChitchatSort>("top");
  // Pages of 10 top-level chitchats, in the server's order for the chosen sort, loaded as you scroll.
  const hooks = useChitchats(storyId, myAuthor, sort);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [reporting, setReporting] = useState<Chitchat | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const list = hooks.thread?.chitchats ?? [];
  const total = hooks.thread?.total ?? 0;
  const sentinel = useReachEnd(hooks.loadMore, hooks.hasMore);

  return <section id="chitchats" className={cn(card, "scroll-mt-24 p-4 sm:p-6")} aria-label="Chitchats">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 font-display text-xl font-bold"><MessageCircle className="size-5" />Chitchats <span className="rounded-full bg-muted px-2 py-0.5 text-sm tabular-nums">{total}</span></h2>
      {list.length > 1 && <div className="relative grid grid-cols-2 rounded-full border-2 border-foreground bg-card p-0.5 text-xs font-bold" role="tablist" aria-label="Sort chitchats">
        <motion.span aria-hidden="true" className="absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-full bg-primary" initial={false} animate={{ x: sort === "top" ? "0%" : "100%" }} transition={{ type: "spring", stiffness: 420, damping: 34 }} />
        {(["top", "new"] as const).map((s) => <button key={s} type="button" role="tab" aria-selected={sort === s} onClick={() => setSort(s)} className={cn("relative rounded-full px-3 py-1 transition-colors", sort === s ? "text-primary-foreground" : "hover:text-primary")}>
          <span className="relative">{s === "top" ? "Top" : "Newest"}</span>
        </button>)}
      </div>}
    </div>

    <div className="mt-4"><Composer onPost={(b) => hooks.post(b)} placeholder={voice(tone, "Add to the tea. Been there? Know something useful?", "Share something useful with the next candidate.")} /></div>
    <Link to="/u/$id" params={{ id: GOOFY_ID }} className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
      <img src={GOOFY_AVATAR} alt="" className="size-4 rounded-full border border-foreground object-cover" />{voice(tone, "Goofy's watching this thread. Keep it spicy, not vulgar.", "Goofy, our AutoMod, keeps this thread respectful.")}
    </Link>

    {hooks.loading ? <div className="mt-6 space-y-4" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="flex gap-3"><div className="skeleton size-9 rounded-full" /><div className="flex-1 space-y-2"><div className="skeleton h-3 w-32 rounded" /><div className="skeleton h-3 w-full rounded" /><div className="skeleton h-3 w-2/3 rounded" /></div></div>)}</div>
      : list.length === 0 ? <div className="mt-6 rounded-xl border-2 border-dashed border-foreground/30 p-8 text-center">
          <p className="font-display text-lg font-bold">{voice(tone, "Crickets. Start the chitchat.", "No chitchats yet.")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{voice(tone, "Been through the same? Say so. It helps more than you think.", "Be the first to add something useful.")}</p>
          <GameBreak className="mx-auto mt-5 max-w-lg" line={voice(tone, "Waiting for someone to reply? Classic. Play meanwhile.", "Waiting for replies? Play a quick game.")} />
        </div>
      : <ul className="mt-6 space-y-5">
          <AnimatePresence initial={false}>{list.map((t) => {
            const open = expanded.has(t.publicId) || t.replies.length <= 3;
            const shown = open ? t.replies : t.replies.slice(0, 2);
            return <motion.li key={t.publicId} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Item c={t} storyAuthorId={storyAuthorId} onReply={() => setReplyTo(t.publicId)} hooks={hooks} onReport={setReporting} />
              {(shown.length > 0 || replyTo === t.publicId) && <div className="ml-4 mt-3 space-y-4 border-l-2 border-foreground/15 pl-4 sm:ml-[18px] sm:pl-6">
                {shown.map((r) => <Item key={r.publicId} c={r} isReply storyAuthorId={storyAuthorId} onReply={() => setReplyTo(t.publicId)} hooks={hooks} onReport={setReporting} />)}
                {!open && <button type="button" onClick={() => setExpanded((s) => new Set(s).add(t.publicId))} className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"><CornerDownRight className="size-3.5" />Show {t.replies.length - 2} more {t.replies.length - 2 === 1 ? "reply" : "replies"}</button>}
                <AnimatePresence>{replyTo === t.publicId && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <Composer compact autoFocus onPost={(b) => hooks.post(b, t.publicId)} onCancel={() => setReplyTo(null)} placeholder={`Reply to ${t.author?.name ?? "this thread"}…`} />
                </motion.div>}</AnimatePresence>
              </div>}
            </motion.li>;
          })}</AnimatePresence>
        </ul>}
    {/* More chitchats as you scroll (600 px before the end), with the same loading wave as the feed. */}
    {hooks.loadingMore && <div className="mt-5 space-y-4" aria-busy="true">{[0, 1].map((i) => <div key={i} className="flex gap-3"><div className="skeleton size-9 rounded-full" /><div className="flex-1 space-y-2"><div className="skeleton h-3 w-32 rounded" /><div className="skeleton h-3 w-full rounded" /><div className="skeleton h-3 w-2/3 rounded" /></div></div>)}</div>}
    <div ref={sentinel} aria-hidden="true" />
    {!hooks.loading && !hooks.hasMore && list.length >= 10 && <p className="mt-5 text-center text-xs text-muted-foreground">{voice(tone, "That's the whole chitchat. Go touch grass.", "You've reached the end of the chitchats.")}</p>}
    <ReportDialog target={reporting} onClose={() => setReporting(null)} onSubmit={hooks.report} />
    {!apiEnabled && list.length > 0 && <p className="mt-5 flex items-center gap-1.5 text-xs text-muted-foreground"><PenLine className="size-3.5" />Preview: chitchats you add are kept in this browser only.</p>}
  </section>;
}
