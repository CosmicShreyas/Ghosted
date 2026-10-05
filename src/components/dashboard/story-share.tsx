// Sharing a story: the card (receipt or classic, as an image) next to a LinkedIn post written from
// the story, ready to edit. Shown right after posting (inside the share flow) and from the share
// button on any story (StoryShareDialog). "Post on LinkedIn" copies the text and opens LinkedIn's
// composer with it filled in; the image can be downloaded to attach. The company stays unnamed
// until you switch it on, for the card and the post together.
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Linkedin, Link2, RotateCcw, Twitter } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LINKEDIN_LIMIT, linkedInComposeUrl, writePost, type PostAngle, type PostSource } from "@/lib/linkedin-post";
import { useTone, voice } from "@/lib/session";
import type { StoryModel } from "@/lib/stories";
import { cn } from "@/lib/utils";
import { ShareCard, type ShareCardData } from "./share-card";
import { popup, popupBody } from "./ui-kit";

export type StoryShareInput = { card: ShareCardData; post: Omit<PostSource, "url">; mine: boolean };

const ANGLES: Record<"mine" | "theirs", { id: PostAngle; label: string; hint: string }[]> = {
  mine: [
    { id: "story", label: "Full story", hint: "Your story in your words, with the key facts" },
    { id: "lessons", label: "Lessons", hint: "A short version plus what you'd tell others" },
    { id: "short", label: "Short", hint: "Just the hook, the facts and the link" },
  ],
  theirs: [
    { id: "story", label: "Pass it on", hint: "Quotes the story, clearly someone else's" },
    { id: "lessons", label: "Takeaways", hint: "A short quote plus what to learn from it" },
    { id: "short", label: "Short", hint: "Just the hook, the facts and the link" },
  ],
};

// From a feed story to what the card and the post need.
export function shareInputFromStory(story: StoryModel, mine: boolean): StoryShareInput {
  const salary = story.salary ? { min: story.salary[0], max: story.salary[1] } : null;
  return {
    mine,
    card: { storyId: story.id, headline: story.title ?? `A story about ${story.company.name}`, wait: null, score: story.flagScore ?? null, company: story.company.name, outcome: story.outcome, stage: story.stage ?? null, days: story.daysWaited ?? null, salary },
    post: { title: story.title, body: story.body, company: story.company.name, outcome: story.outcome, stage: story.stage ?? null, days: story.daysWaited ?? null, salary, role: story.role, score: story.flagScore ?? null },
  };
}

export function StoryShare({ input }: { input: StoryShareInput }) {
  const tone = useTone();
  const [nameCompany, setNameCompany] = useState(false);
  const [angle, setAngle] = useState<PostAngle>(input.mine ? "story" : "short");
  const url = input.card.storyId ? `${window.location.origin}/s/${input.card.storyId}` : window.location.origin;
  const generated = useMemo(() => writePost({ ...input.post, url }, { angle, mine: input.mine, nameCompany, tone }), [input, url, angle, nameCompany, tone]);
  const [text, setText] = useState(generated);
  const [edited, setEdited] = useState(false);
  const [copied, setCopied] = useState(false);
  // A new angle or company setting rewrites the post, unless you've edited it yourself.
  useEffect(() => { if (!edited) setText(generated); }, [generated, edited]);

  const copy = async (silent = false) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); if (!silent) toast.success("Post copied."); return true; }
    catch { if (!silent) toast.error("Couldn't copy. Select the text and copy it yourself."); return false; }
  };
  const postToLinkedIn = async () => {
    await copy(true);
    window.open(linkedInComposeUrl(text), "_blank", "noopener,noreferrer");
    toast.success(voice(tone, "LinkedIn is open with your post. If the box is empty, just paste, it's copied.", "LinkedIn is open with your post filled in. If it's empty, paste it: it's on your clipboard."));
  };
  const copyLink = async () => { try { await navigator.clipboard.writeText(url); toast.success("Link copied."); } catch { toast.error("Couldn't copy the link."); } };
  const angles = ANGLES[input.mine ? "mine" : "theirs"];
  const over = text.length > LINKEDIN_LIMIT;

  return <div className="grid w-full gap-6 text-left md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
    <div className="flex justify-center"><ShareCard data={input.card} social={false} showCompany={nameCompany} onShowCompany={setNameCompany} /></div>

    <div className="min-w-0 space-y-3">
      <div>
        <h3 className="flex items-center gap-2 font-display text-lg font-bold"><Linkedin className="size-5 text-[#0A66C2]" />{input.mine ? "Post it on LinkedIn" : "Share it on LinkedIn"}</h3>
        <p className="text-xs text-muted-foreground">{input.mine ? voice(tone, "Written from your story. Your name goes on LinkedIn, so give it a read first.", "Written from your story. It will appear under your name on LinkedIn, so read it through first.") : "Written as passing on someone's story, never as yours."}</p>
      </div>
      <div className="grid grid-cols-3 rounded-lg border-2 border-foreground bg-muted p-1 text-xs font-bold" role="group" aria-label="Post style">
        {angles.map((a) => <button key={a.id} type="button" title={a.hint} aria-pressed={angle === a.id} onClick={() => { setAngle(a.id); setEdited(false); }} className={cn("rounded-md px-2 py-1.5 transition-colors", angle === a.id ? "bg-primary text-primary-foreground" : "hover:bg-background")}>{a.label}</button>)}
      </div>
      <p className="text-xs text-muted-foreground">{angles.find((a) => a.id === angle)?.hint}{nameCompany ? ". Names the company." : ". Company not named."}</p>
      <div className="relative">
        <Textarea value={text} onChange={(e) => { setText(e.target.value); setEdited(true); }} rows={12} aria-label="LinkedIn post" className="min-h-64 resize-y border-2 border-foreground text-sm leading-relaxed" data-lenis-prevent />
        <span className={cn("pointer-events-none absolute bottom-2 right-3 rounded bg-card/90 px-1 text-[11px] tabular-nums", over ? "font-bold text-flag-red" : "text-muted-foreground")}>{text.length.toLocaleString("en-IN")}/{LINKEDIN_LIMIT.toLocaleString("en-IN")}</span>
      </div>
      {input.mine && <p className="text-[11px] text-muted-foreground">Your story text goes in as written. If it mentions the company or anyone by name, edit that out here.</p>}
      <div className="flex flex-wrap gap-2">
        <Button className="min-h-11 flex-1 bg-[#0A66C2] text-white hover:bg-[#0A66C2]/90 sm:flex-none" onClick={() => void postToLinkedIn()} disabled={over || !text.trim()}><Linkedin />Post on LinkedIn</Button>
        <Button className="min-h-11" variant="outline" onClick={() => void copy()}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy post"}</Button>
        {edited && <Button className="min-h-11" variant="ghost" onClick={() => setEdited(false)}><RotateCcw />Rewrite</Button>}
      </div>
      <div className="flex flex-wrap gap-2 border-t-2 border-foreground/10 pt-3">
        <Button size="sm" variant="outline" asChild><a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`${input.card.headline}. Shared anonymously on Ghosted.`)}&url=${encodeURIComponent(url)}&hashtags=GhostedReceipts`} target="_blank" rel="noopener noreferrer"><Twitter />Post on X</a></Button>
        {input.card.storyId && <Button size="sm" variant="outline" onClick={() => void copyLink()}><Link2 />Copy link</Button>}
      </div>
      <p className="text-[11px] text-muted-foreground">Tip: download the card image and add it to your LinkedIn post. Posts with an image get far more reach.</p>
    </div>
  </div>;
}

// The popup used by the share button on stories.
export function StoryShareDialog({ open, onOpenChange, input }: { open: boolean; onOpenChange: (v: boolean) => void; input: StoryShareInput }) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className={cn(popup, "max-w-4xl")}>
      <div className={popupBody} data-lenis-prevent>
        <DialogHeader className="mb-4 text-left">
          <DialogTitle className="font-display text-2xl">Share this story</DialogTitle>
          <DialogDescription>{input.mine ? "Your card and a ready-to-post LinkedIn draft. You stay anonymous on Ghosted either way." : "The story card and a ready-to-post LinkedIn draft. The author stays anonymous."}</DialogDescription>
        </DialogHeader>
        {open && <StoryShare input={input} />}
      </div>
    </DialogContent>
  </Dialog>;
}
