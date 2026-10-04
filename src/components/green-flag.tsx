// Green flag shout-out: the quickest happy post on Ghosted. Pick the company, say how it ended, tick
// up to three things they did well and add one optional line. It's posted as an ordinary quick story
// (so it counts toward the Founding 50 and the company's Flag Score like any story), shown with a
// green card. The ratings come straight from the ticks and are shown before posting.
// Afterwards: an anonymous "Say thanks to a recruiter" card to share, with no names on it.
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Download, Flag, Heart, Loader2, Share2, Star } from "lucide-react";
import { toast } from "sonner";
import { CompanyPicker } from "@/components/company-picker";
import { HumanCheck, useHumanCheck } from "@/components/human-check";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { popup, popupBody } from "@/components/dashboard/ui-kit";
import { STAGE_NAME } from "@/components/typical-process";
import { api, ApiRequestError, apiEnabled } from "@/lib/api";
import { speak } from "@/lib/goofy";
import { liveNudge } from "@/lib/live";
import { useTone, voice } from "@/lib/session";
import { GREEN_FLAG_LABEL, useCompanyIndex, type GreenFlag } from "@/lib/stories";
import { cn } from "@/lib/utils";

const FLAGS = Object.keys(GREEN_FLAG_LABEL) as GreenFlag[];
const SENTENCE: Record<GreenFlag, string> = {
  replied_48h: "They replied within 48 hours.", clear_pay: "The pay range was clear from the start.", respectful_rejection: "Even the no was respectful.",
  quick_process: "The whole process moved quickly.", gave_feedback: "They gave useful feedback.",
};
const SHORT: Record<GreenFlag, string> = { replied_48h: "replied within 48 hours", clear_pay: "was upfront about pay", respectful_rejection: "said no respectfully", quick_process: "moved quickly", gave_feedback: "gave feedback" };
type End = "offer" | "rejected";

// Ratings from the ticks, nothing else: 5 stars where a tick speaks to it, 4 otherwise (it's a
// shout-out, so nothing below "good").
function ratingsFor(end: End, flags: GreenFlag[]) {
  const has = (f: GreenFlag) => flags.includes(f);
  const r: Record<string, number> = {
    hiring: has("quick_process") || has("gave_feedback") ? 5 : 4,
    communication: has("replied_48h") || has("respectful_rejection") || has("gave_feedback") ? 5 : 4,
  };
  if (end === "offer") r["pay"] = has("clear_pay") ? 5 : 4;
  return r;
}
const RATING_NAME: Record<string, string> = { hiring: "Hiring process", communication: "Communication", pay: "Pay transparency" };

// ---------- the anonymous thank-you card ----------

async function thanksImage(company: string, flags: GreenFlag[]) {
  await document.fonts?.ready;
  const c = document.createElement("canvas");
  c.width = 1200; c.height = 630;
  const g = c.getContext("2d")!;
  g.fillStyle = "#16A34A"; g.fillRect(0, 0, 1200, 630);
  g.fillStyle = "#14532D"; g.fillRect(74, 82, 1060, 474);
  g.fillStyle = "#F2E9D8"; g.strokeStyle = "#141110"; g.lineWidth = 6; g.fillRect(60, 68, 1060, 474); g.strokeRect(60, 68, 1060, 474);
  g.fillStyle = "#16A34A"; g.font = "700 30px 'Space Grotesk', system-ui, sans-serif"; g.fillText("A green flag, from a candidate", 104, 136);
  g.fillStyle = "#141110"; g.font = "700 60px 'Space Grotesk', system-ui, sans-serif";
  const lines = [`To the recruiter at ${company}:`, "thank you."];
  lines.forEach((l, i) => g.fillText(l.length > 34 ? `${l.slice(0, 33)}…` : l, 100, 230 + i * 72));
  g.font = "600 28px Inter, system-ui, sans-serif"; g.fillStyle = "#3f3a36";
  flags.forEach((f, i) => g.fillText(`✓  ${GREEN_FLAG_LABEL[f]}`, 104, 368 + i * 42));
  g.fillStyle = "#141110"; g.font = "700 24px 'Space Grotesk', system-ui, sans-serif"; g.fillText("Candidates notice. · Ghosted", 104, 510);
  return new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/png"));
}

function ThanksCard({ company, flags }: { company: string; flags: GreenFlag[] }) {
  const [busy, setBusy] = useState(false);
  const text = `To the recruiter at ${company} who ${flags.map((f) => SHORT[f]).join(", ")}: thank you. Candidates notice. #GreenFlag`;
  const share = async () => {
    setBusy(true);
    try {
      const blob = await thanksImage(company, flags);
      const file = blob ? new File([blob], "green-flag-thanks.png", { type: "image/png" }) : null;
      if (file && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
      if (blob) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "green-flag-thanks.png"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
      await navigator.clipboard?.writeText(text).catch(() => undefined);
      toast.success("Card saved and the message copied. Post it, or send it to the recruiter.");
    } catch (e) { if ((e as Error).name !== "AbortError") toast.error("Couldn't make the card. Try again."); }
    finally { setBusy(false); }
  };
  return <div className="rounded-xl border-2 border-foreground bg-flag-green/10 p-4 text-left">
    <p className="flex items-center gap-2 font-display text-lg font-bold"><Heart className="size-5 text-flag-green" />Say thanks to a recruiter</p>
    <p className="mt-1 text-sm">“{text}”</p>
    <p className="mt-1 text-xs text-muted-foreground">No names on it, theirs or yours. Share it on LinkedIn, or send it straight to them.</p>
    <Button size="sm" className="mt-3" disabled={busy} onClick={() => void share()}>{busy ? <Loader2 className="animate-spin" /> : typeof navigator !== "undefined" && "share" in navigator ? <Share2 /> : <Download />}Get the thank-you card</Button>
  </div>;
}

// ---------- the shout-out ----------

export function ShoutoutDialog({ open, onOpenChange, presetCompany = null }: { open: boolean; onOpenChange: (v: boolean) => void; presetCompany?: string | null }) {
  const tone = useTone();
  const qc = useQueryClient();
  const shield = useHumanCheck(open);
  const { list, index } = useCompanyIndex();
  const [company, setCompany] = useState(presetCompany ?? "");
  const [end, setEnd] = useState<End | "">("");
  const [stage, setStage] = useState("final");
  const [flags, setFlags] = useState<GreenFlag[]>([]);
  const [line, setLine] = useState("");
  const [busy, setBusy] = useState(false);
  const [posted, setPosted] = useState(false);
  useEffect(() => { if (open) { setCompany(presetCompany ?? ""); setEnd(""); setFlags([]); setLine(""); setPosted(false); } }, [open, presetCompany]);
  const name = index.get(company)?.name ?? "the company";
  const toggle = (f: GreenFlag) => setFlags((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : cur.length >= 3 ? cur : [...cur, f]));
  const ratings = useMemo(() => (end ? ratingsFor(end, flags) : null), [end, flags]);
  const ready = !!company && !!end && flags.length > 0 && (!apiEnabled || shield.status === "done");

  const post = async () => {
    if (!ready || !end) return;
    if (!apiEnabled) { setPosted(true); return; }
    setBusy(true);
    const title = `Green flag for ${name}: ${flags.map((f) => SHORT[f]).join(", ")}`.slice(0, 90);
    const body = [`A green flag shout-out for ${name}.`, end === "offer" ? "I got an offer." : "It didn't work out for me, but they handled it well.", ...flags.map((f) => SENTENCE[f]), line.trim()].filter(Boolean).join(" ");
    try {
      const r = await api<{ pending?: boolean; message?: string | null }>("/v1/stories", { method: "POST", body: {
        companySlug: company, outcome: end, stage: end === "offer" ? "offer" : stage, title, body, ratings, quick: true, greenFlags: flags, captchaToken: shield.getToken(),
      } });
      for (const key of [["feed"], ["my-stories"], ["founding"], ["companies"]]) void qc.invalidateQueries({ queryKey: key });
      liveNudge();
      if (r.pending) { speak(r.message ?? "Saved. Your shout-out goes up after a quick check."); }
      setPosted(true);
    } catch (e) {
      if (e instanceof ApiRequestError && e.code === "captcha_escalate") shield.escalate();
      if (e instanceof ApiRequestError && e.message.startsWith("Goofy: ")) speak(e.message, "error"); else toast.error(e instanceof ApiRequestError ? e.message : "Couldn't post that. Try again.");
    } finally { shield.reset(); setBusy(false); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className={cn(popup, "max-w-xl")}>
      <div className={popupBody} data-lenis-prevent>
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="flex items-center gap-2 font-display text-2xl"><Flag className="size-6 text-flag-green" />Green flag shout-out</DialogTitle>
          <DialogDescription>{voice(tone, "Somebody did hiring right? Rare. Let's make it loud.", "Thank a company that handled hiring well. It takes a few taps.")}</DialogDescription>
        </DialogHeader>
        {posted ? <div className="mt-5 space-y-4 text-center">
            <p className="font-display text-2xl font-bold">{voice(tone, "Green flag raised.", "Shout-out posted.")}</p>
            <p className="text-sm text-muted-foreground">{apiEnabled ? `It's on ${name}'s page with a green card, and it counts toward their Flag Score.` : "Preview mode: shout-outs aren't saved here."}</p>
            <ThanksCard company={name} flags={flags} />
            <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
          </div>
          : <div className="mt-5 space-y-5">
            {!presetCompany && <div><p className="mb-1.5 text-sm font-bold">Which company?</p><CompanyPicker value={company} onChange={setCompany} companies={list} placeholder="Choose the company" /></div>}
            <div>
              <p className="mb-1.5 text-sm font-bold">How did it end?</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {([["offer", "Got an offer"], ["rejected", "Didn't get it, but they were decent"]] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={end === id} onClick={() => setEnd(id)}
                  className={cn("min-h-12 rounded-lg border-2 border-foreground px-3 text-left text-sm font-bold transition-colors", end === id ? "bg-flag-green text-primary-foreground" : "bg-card hover:bg-muted")}>{label}</button>)}
              </div>
              {end === "rejected" && <div className="mt-3"><p className="mb-1.5 text-xs font-bold text-muted-foreground">How far did you get?</p>
                <div className="flex flex-wrap gap-2">{["application", "screening", "technical", "final"].map((s) => <button key={s} type="button" aria-pressed={stage === s} onClick={() => setStage(s)} className={cn("min-h-10 rounded-full border-2 border-foreground px-3 text-xs font-bold", stage === s ? "bg-foreground text-background" : "bg-card hover:bg-muted")}>{STAGE_NAME[s]}</button>)}</div>
              </div>}
            </div>
            <div>
              <p className="mb-1.5 text-sm font-bold">What did they do well? <span className="font-normal text-muted-foreground">Up to 3</span></p>
              <div className="flex flex-wrap gap-2">{FLAGS.map((f) => {
                const on = flags.includes(f), full = !on && flags.length >= 3;
                return <button key={f} type="button" aria-pressed={on} disabled={full} onClick={() => toggle(f)}
                  className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-full border-2 px-3 text-sm font-bold transition-colors disabled:opacity-40", on ? "border-flag-green bg-flag-green text-primary-foreground" : "border-foreground bg-card hover:bg-muted")}>{on && <Check className="size-4" />}{GREEN_FLAG_LABEL[f]}</button>;
              })}</div>
            </div>
            <label className="block text-sm font-bold">One line <span className="font-normal text-muted-foreground">(optional)</span>
              <Input value={line} onChange={(e) => setLine(e.target.value.slice(0, 140))} maxLength={140} placeholder="e.g. The recruiter called to explain the decision." className="mt-1 h-11 border-2 border-foreground font-normal" />
              <span className="mt-1 block text-xs font-normal text-muted-foreground">No names of individuals, even nice ones. {140 - line.length} left.</span>
            </label>
            {/* The ratings this shout-out gives, straight from the ticks. */}
            {ratings && flags.length > 0 && <div className="rounded-lg border-2 border-foreground/15 p-3 text-xs">
              <p className="font-bold">Your shout-out rates {name}:</p>
              <ul className="mt-1.5 space-y-1">{Object.entries(ratings).map(([k, v]) => <li key={k} className="flex items-center justify-between gap-2"><span>{RATING_NAME[k]}</span><span className="flex" aria-label={`${v} of 5`}>{[1, 2, 3, 4, 5].map((n) => <Star key={n} className={cn("size-3.5", n <= v ? "fill-flag-amber text-foreground" : "text-muted-foreground")} />)}</span></li>)}</ul>
              <p className="mt-1.5 text-muted-foreground">5 stars where one of your ticks speaks to it, 4 otherwise. Want to rate in detail? Write a full story instead.</p>
            </div>}
            {apiEnabled && <HumanCheck shield={shield} />}
            <Button className="w-full bg-flag-green text-primary-foreground hover:bg-flag-green/90" disabled={!ready || busy} onClick={() => void post()}>{busy ? <Loader2 className="animate-spin" /> : <Flag />}Raise the green flag</Button>
          </div>}
      </div>
    </DialogContent>
  </Dialog>;
}
