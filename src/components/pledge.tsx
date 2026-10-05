// Reply pledges: a company's public promise that candidates hear back within 7, 14 or 30 days, and a
// badge worked out from candidate stories posted since, never from the company. Withdrawn pledges
// say so instead of disappearing. Never purchasable. Rules: backend/src/lib/pledge.ts.
import { useState } from "react";
import { Hand, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ApiRequestError, apiEnabled } from "@/lib/api";
import { usePledge } from "@/lib/company-voice";
import type { Pledge } from "@/lib/stories";
import { useTone, voice } from "@/lib/session";
import { cn } from "@/lib/utils";

const LABEL: Record<Pledge["badge"], string> = { made: "Pledge made", holding: "Pledge holding", mixed: "Pledge mixed", slipping: "Pledge slipping", withdrawn: "Pledge withdrawn" };
const TONE: Record<Pledge["badge"], string> = {
  made: "border-foreground bg-card", holding: "border-flag-green bg-flag-green/15 text-flag-green", mixed: "border-flag-amber bg-flag-amber/20",
  slipping: "border-flag-red bg-flag-red/10 text-flag-red", withdrawn: "border-foreground/30 bg-muted text-muted-foreground line-through decoration-1",
};

// The small chip (company pages and search results).
export function PledgeChip({ pledge, className }: { pledge: Pledge | null | undefined; className?: string }) {
  if (!pledge) return null;
  const based = `Replies within ${pledge.days} days. Based on ${pledge.stories} candidate ${pledge.stories === 1 ? "story" : "stories"}, not verified by the company.`;
  return <span title={based} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border-2 px-2 py-0.5 text-[11px] font-bold", TONE[pledge.badge], className)}>
    <Hand className="size-3" />{LABEL[pledge.badge]}{pledge.badge !== "withdrawn" && ` · ${pledge.days}d`}
  </span>;
}

// The company page panel: the badge with its honest explanation, and for reps, make or withdraw.
export function PledgePanel({ slug, name }: { slug: string; name: string }) {
  const tone = useTone();
  const { data, make, withdraw } = usePledge(slug);
  const [days, setDays] = useState<7 | 14 | 30>(14);
  const [confirm, setConfirm] = useState<"make" | "withdraw" | null>(null);
  const [busy, setBusy] = useState(false);
  if (!apiEnabled || !data) return null;
  const p = data.pledge;
  if (!p && !data.viewerIsRep) return null;
  const run = async () => {
    setBusy(true);
    try {
      if (confirm === "make") { await make(days); toast.success(`Pledge made: candidates hear back within ${days} days.`); }
      else { await withdraw(); toast.success("Pledge withdrawn. It shows as withdrawn on your page."); }
      setConfirm(null);
    } catch (e) { toast.error(e instanceof ApiRequestError ? e.message : "Couldn't save that. Try again."); }
    finally { setBusy(false); }
  };
  const live = p && !p.withdrawnAt;
  return <section aria-label="Reply pledge" className="rounded-xl border-2 border-foreground bg-card p-4 shadow-hard-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold"><Hand className="size-5 text-primary" />Reply pledge</h2>
      {p && <PledgeChip pledge={p} />}
    </div>
    {p ? <>
      <p className="mt-2 text-sm">{p.withdrawnAt ? `${name} pledged to reply within ${p.days} days, then withdrew it.` : `${name} pledges that candidates hear back within ${p.days} days.`}</p>
      <p className="mt-1 text-xs text-muted-foreground">Based on {p.stories} candidate {p.stories === 1 ? "story" : "stories"} posted since {new Date(p.madeAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}{p.stories ? `, ${p.kept} heard back in time` : ""}. Not verified by the company. {p.badge === "made" && !p.withdrawnAt ? "The badge updates once 5 stories have come in." : ""}</p>
    </> : <p className="mt-2 text-sm text-muted-foreground">{voice(tone, "Put a number on it. Pledge how fast candidates hear back, and let their stories keep score.", "Pledge how quickly candidates will hear back. Candidates' stories decide whether it's holding.")}</p>}
    {data.viewerIsRep && <div className="mt-3 border-t-2 border-dashed border-foreground/15 pt-3">
      {live ? <Button size="sm" variant="outline" onClick={() => setConfirm("withdraw")}>Withdraw the pledge</Button>
        : <div className="flex flex-wrap items-center gap-2">
            <div className="grid grid-cols-3 rounded-lg border-2 border-foreground bg-muted p-1 text-xs font-bold" role="group" aria-label="Reply within">{([7, 14, 30] as const).map((d) => <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)} className={cn("rounded-md px-3 py-1.5", days === d ? "bg-primary text-primary-foreground" : "hover:bg-background")}>{d} days</button>)}</div>
            <Button size="sm" onClick={() => setConfirm("make")}><Hand />Make the pledge</Button>
          </div>}
      <p className="mt-2 text-[11px] text-muted-foreground">Free, public, and judged only by candidate stories. Withdrawing shows "Pledge withdrawn"; it never quietly disappears.</p>
    </div>}
    <AlertDialog open={!!confirm} onOpenChange={(v) => { if (!v && !busy) setConfirm(null); }}>
      <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-xl border-2 border-foreground shadow-hard">
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle className="font-display text-xl">{confirm === "make" ? `Pledge replies within ${days} days?` : "Withdraw the pledge?"}</AlertDialogTitle>
          <AlertDialogDescription>{confirm === "make" ? "It appears on your company page and in search. Candidates' stories decide whether it's holding or slipping, and you can't edit it, only withdraw it." : "Your page will show \"Pledge withdrawn\" until you make a new one. Candidates will see that you withdrew it."}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); void run(); }} disabled={busy}>{busy && <Loader2 className="animate-spin" />}{confirm === "make" ? "Make the pledge" : "Withdraw it"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}
