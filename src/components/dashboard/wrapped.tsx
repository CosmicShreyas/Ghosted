// Ghosted Wrapped: your own month or year in the job hunt, from your Waiting Room. Worked out in the
// browser from the list you already load (/v1/me/applications), so it's only ever yours. Unlocks
// at 5 applications. The share card hides company names unless you switch them on.
import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toPng } from "html-to-image";
import { ChevronLeft, ChevronRight, Download, Eye, EyeOff, Gift, Loader2, Lock, Share2 } from "lucide-react";
import { toast } from "sonner";
import { daysSince, isoDay, useApplications, type Application } from "@/lib/applications";
import { useTone, voice } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { card } from "./widgets";

const UNLOCK = 5;
const REPLIED = new Set(["rejected", "offer", "offer_revoked"]);
type Mode = "month" | "year";

// The wait on one application: from the last time you heard anything until it closed, or today.
const waitOf = (a: Application) => a.closedAt ? Math.max(0, daysSince(a.waitingSince, new Date(a.closedAt))) : daysSince(a.waitingSince);
const replied = (a: Application) => a.stage !== "application" || (a.outcome != null && REPLIED.has(a.outcome));

function recap(list: Application[], from: string, to: string) {
  const apps = list.filter((a) => a.appliedOn >= from && a.appliedOn < to);
  const silent = apps.filter((a) => !replied(a));
  const longest = apps.reduce<Application | null>((m, a) => (!m || waitOf(a) > waitOf(m) ? a : m), null);
  return {
    applications: apps.length,
    silenceDays: silent.reduce((n, a) => n + waitOf(a), 0),
    longest: longest ? { days: waitOf(longest), company: longest.company.name } : null,
    replies: apps.filter(replied).length,
    stories: apps.filter((a) => a.storyPublicId).length,
  };
}

function bounds(mode: Mode, offset: number) {
  const now = new Date();
  const start = mode === "month" ? new Date(now.getFullYear(), now.getMonth() + offset, 1) : new Date(now.getFullYear() + offset, 0, 1);
  const end = mode === "month" ? new Date(start.getFullYear(), start.getMonth() + 1, 1) : new Date(start.getFullYear() + 1, 0, 1);
  const label = mode === "month" ? start.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : String(start.getFullYear());
  return { from: isoDay(start), to: isoDay(end), label, earliest: start };
}

export function GhostedWrapped() {
  const { list, loading } = useApplications();
  const tone = useTone();
  const [mode, setMode] = useState<Mode>("month");
  const [offset, setOffset] = useState(0);
  const [showCompany, setShowCompany] = useState(false);
  const [busy, setBusy] = useState<"" | "share" | "download">("");
  const ref = useRef<HTMLDivElement>(null);
  const b = bounds(mode, offset);
  const r = useMemo(() => recap(list, b.from, b.to), [list, b.from, b.to]);
  const oldest = list.reduce<string | null>((m, a) => (!m || a.appliedOn < m ? a.appliedOn : m), null);
  const canGoBack = !!oldest && oldest < b.from;

  if (loading) return null;
  if (list.length < UNLOCK) return <section className={cn(card, "flex flex-wrap items-center gap-4 p-5")}>
    <span className="grid size-11 shrink-0 place-items-center rounded-lg border-2 border-foreground bg-muted"><Lock className="size-5" /></span>
    <div className="min-w-0 flex-1 basis-56">
      <h3 className="font-display text-lg font-bold">Ghosted Wrapped</h3>
      <p className="text-sm text-muted-foreground">{voice(tone, `Your month in silence, served as a receipt. Track ${UNLOCK - list.length} more ${UNLOCK - list.length === 1 ? "application" : "applications"} in the Waiting Room to unlock it.`, `A private monthly and yearly recap of your applications. Add ${UNLOCK - list.length} more in the Waiting Room to unlock it.`)}</p>
      <div className="mt-2 h-2 max-w-xs overflow-hidden rounded-full border border-foreground bg-muted"><div className="h-full bg-primary" style={{ width: `${(list.length / UNLOCK) * 100}%` }} /></div>
    </div>
  </section>;

  const switchMode = (m: Mode) => { setMode(m); setOffset(0); };
  const render = () => toPng(ref.current!, { pixelRatio: 2, cacheBust: true, backgroundColor: "#FAF7F2" });
  const fileName = `ghosted-wrapped-${b.from.slice(0, mode === "month" ? 7 : 4)}.png`;
  const download = async () => {
    setBusy("download");
    try { const a = document.createElement("a"); a.href = await render(); a.download = fileName; a.click(); }
    catch { toast.error("Couldn't make the image. Try again."); } finally { setBusy(""); }
  };
  const share = async () => {
    setBusy("share");
    try {
      const file = new File([await (await fetch(await render())).blob()], fileName, { type: "image/png" });
      const payload = { title: `My Ghosted Wrapped, ${b.label}`, text: "My job hunt, in receipts. #GhostedReceipts", url: window.location.origin };
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ ...payload, files: [file] });
      else if (navigator.share) await navigator.share(payload);
      else await download();
    } catch (e) { if ((e as Error).name !== "AbortError") toast.error("Couldn't share. Try Download instead."); }
    finally { setBusy(""); }
  };

  const verdictLine = r.applications === 0 ? voice(tone, "Nothing tracked here. A quiet one, for once.", "No applications tracked in this period.")
    : r.replies === 0 ? voice(tone, "Not one reply. The silence was loud.", "No replies yet in this period.")
    : voice(tone, `${r.replies} of ${r.applications} wrote back. The rest are still typing, apparently.`, `${r.replies} of ${r.applications} applications got a reply.`);
  const rows: [string, string][] = [
    ["Applications", r.applications.toLocaleString("en-IN")],
    ["Days of silence", r.silenceDays.toLocaleString("en-IN")],
    ["Longest wait", r.longest ? `${r.longest.days} ${r.longest.days === 1 ? "day" : "days"}` : "–"],
    ["Replies received", r.replies.toLocaleString("en-IN")],
    ["Stories shared", r.stories.toLocaleString("en-IN")],
  ];

  return <section className={cn(card, "p-5 sm:p-6")} aria-label="Ghosted Wrapped">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h3 className="flex items-center gap-2 font-display text-xl font-bold"><Gift className="size-5 text-primary" />Ghosted Wrapped</h3>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="size-3" />From your Waiting Room. Only you can see this.</p></div>
      <div className="grid grid-cols-2 rounded-lg border-2 border-foreground bg-muted p-1 text-xs font-bold" role="group" aria-label="Recap period">
        {(["month", "year"] as const).map((m) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => switchMode(m)} className={cn("rounded-md px-3 py-1.5 transition-colors", mode === m ? "bg-primary text-primary-foreground" : "hover:bg-background")}>{m === "month" ? "Monthly" : "Yearly"}</button>)}
      </div>
    </div>

    <div className="mt-5 grid items-start gap-6 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      {/* The card itself, always in the light palette so the image is the same in any theme. */}
      <div className="mx-auto w-full max-w-[22rem]">
        <div className="mb-2 flex items-center justify-between">
          <Button size="icon" variant="ghost" aria-label={`Previous ${mode}`} disabled={!canGoBack} onClick={() => setOffset((o) => o - 1)}><ChevronLeft /></Button>
          <p className="text-sm font-bold">{b.label}</p>
          <Button size="icon" variant="ghost" aria-label={`Next ${mode}`} disabled={offset >= 0} onClick={() => setOffset((o) => o + 1)}><ChevronRight /></Button>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={`${mode}-${offset}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <div ref={ref} style={{ background: "#FAF7F2", color: "#141110", fontFamily: "'Space Grotesk', Inter, sans-serif" }} className="rounded-2xl border-2 border-[#141110] p-5 shadow-[6px_6px_0_#141110]">
              <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-lg font-bold"><img src="/ghosted-mark.png" alt="" className="size-7 object-contain" crossOrigin="anonymous" />Ghosted.</span>
                <span className="rounded-full border-2 border-[#141110] px-2 py-0.5 text-[10px] font-bold" style={{ background: "#FACC15" }}>Wrapped</span></div>
              <p className="mt-4 text-xs font-bold" style={{ color: "#6D28D9" }}>{mode === "month" ? "My month in the job hunt" : "My year in the job hunt"}</p>
              <p className="text-3xl font-bold leading-tight">{b.label}</p>
              <dl className="mt-4 divide-y-2 divide-dashed divide-[#14111022] border-y-2 border-[#141110]">
                {rows.map(([k, v]) => <div key={k} className="flex items-baseline justify-between gap-3 py-2"><dt className="text-sm">{k}</dt><dd className="text-xl font-bold tabular-nums">{v}</dd></div>)}
              </dl>
              {r.longest && <p className="mt-3 text-xs" style={{ color: "#141110B3" }}>Longest wait at <b style={{ color: "#141110" }}>{showCompany ? r.longest.company : "a company that shall remain nameless"}</b></p>}
              <p className="mt-2 text-sm font-semibold" style={{ color: r.replies === 0 && r.applications > 0 ? "#DC2626" : "#141110" }}>{verdictLine}</p>
              <p className="mt-4 border-t-2 border-dashed pt-3 text-xs font-semibold" style={{ borderColor: "#14111033" }}>Track yours on {window.location.host}</p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{voice(tone, "Counted from the applications you added in this period. Silence means no reply of any kind, measured from the last time they spoke to you.", "Based on applications you added in this period. Days of silence count from the last reply until the application closed, or today.")}</p>
        <button type="button" onClick={() => setShowCompany((v) => !v)} aria-pressed={showCompany} disabled={!r.longest} className={cn("inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-foreground px-3 text-sm font-bold disabled:opacity-50", showCompany ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>
          {showCompany ? <EyeOff className="size-4" /> : <Eye className="size-4" />}{showCompany ? "Hide company name" : "Show company name"}
        </button>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button className="min-h-11" onClick={() => void share()} disabled={!!busy || r.applications === 0}>{busy === "share" ? <Loader2 className="animate-spin" /> : <Share2 />}Share</Button>
          <Button className="min-h-11" variant="outline" onClick={() => void download()} disabled={!!busy || r.applications === 0}>{busy === "download" ? <Loader2 className="animate-spin" /> : <Download />}Download PNG</Button>
        </div>
      </div>
    </div>
  </section>;
}
