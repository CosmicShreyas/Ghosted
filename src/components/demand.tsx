// Candidates asking a company to show up:
//   AskToRespond   one tap on company and story pages: "Ask {company} to respond". One per member,
//                  can be taken back; the count shows only from 3 (backend/src/demand.ts)
//   AskHrShare     for a story's author: copies a message and a link to /for-hr for that company,
//                  pointing at the story, with nothing about who wrote it
import { useState } from "react";
import { Check, Loader2, Megaphone, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiRequestError, apiEnabled, askToJoin } from "@/lib/api";
import { useDemand } from "@/lib/company-voice";
import { SITE_URL } from "@/lib/meta";
import { useMe, useTone, voice } from "@/lib/session";
import { cn } from "@/lib/utils";

export function AskToRespond({ slug, name, className }: { slug: string; name: string; className?: string }) {
  const tone = useTone();
  const { signedOut } = useMe();
  const { data, toggle } = useDemand(slug);
  const [busy, setBusy] = useState(false);
  if (!apiEnabled || !data) return null;
  // A company's own reps see the counter, not the button.
  if (data.viewerIsRep) return data.count ? <p className={cn("inline-flex items-center gap-1.5 text-xs font-bold", className)}><Megaphone className="size-3.5 text-primary" />{data.count} candidates asked {name} to respond</p> : null;
  const go = async () => {
    if (signedOut) return askToJoin();
    setBusy(true);
    try { await toggle(!data.asked); toast.success(data.asked ? "Taken back." : voice(tone, `Noted. ${name} will see the queue growing.`, `Your request to ${name} has been counted.`)); }
    catch (e) { toast.error(e instanceof ApiRequestError ? e.message : "Couldn't save that. Try again."); }
    finally { setBusy(false); }
  };
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>
    <Button size="sm" variant={data.asked ? "default" : "outline"} aria-pressed={data.asked} disabled={busy} onClick={() => void go()}>
      {busy ? <Loader2 className="animate-spin" /> : data.asked ? <Check /> : <Megaphone />}{data.asked ? `You asked ${name} to respond` : `Ask ${name} to respond`}
    </Button>
    {data.count != null && <span className="text-xs font-semibold text-muted-foreground">{data.count} candidates asked so far</span>}
  </div>;
}

export function AskHrShare({ slug, name, storyId }: { slug: string; name: string; storyId: string }) {
  const tone = useTone();
  const link = `${SITE_URL}/for-hr?company=${encodeURIComponent(slug)}&story=${encodeURIComponent(storyId)}`;
  const message = `Hi, a candidate shared their hiring experience with ${name} on Ghosted, anonymously. Companies can respond for free as a verified representative: ${link}`;
  const share = async () => {
    try {
      if (navigator.share && window.matchMedia("(pointer: coarse)").matches) { await navigator.share({ title: `A candidate's story about ${name}`, text: message }); return; }
      await navigator.clipboard.writeText(message);
      toast.success(voice(tone, `Copied. Send it to ${name}'s HR or a recruiter there. It says nothing about who you are.`, `Message copied. It doesn't include anything about who you are.`));
    } catch (e) { if ((e as Error).name !== "AbortError") toast.error("Couldn't copy the message."); }
  };
  return <div className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-dashed border-foreground/25 p-3">
    <p className="min-w-0 flex-1 basis-56 text-xs text-muted-foreground"><b className="text-foreground">Want {name} to see this?</b> Send their HR a link where they can verify and respond for free. Nothing in it says who you are.</p>
    <Button size="sm" variant="outline" onClick={() => void share()}><Send />Ask {name}'s HR to respond</Button>
  </div>;
}
