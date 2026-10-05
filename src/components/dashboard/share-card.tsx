// After posting: an anonymous card to share the story, in two looks. "Receipt" is a thermal till
// slip (rounds, days waited, pay, replies, a "Time lost" total, barcode and torn edge); "Classic" is
// the brand card with the Flag Score. The company name is hidden unless you switch it on, and the
// author is never on it. Drawn in the browser (html-to-image); nothing is uploaded. The story page's
// link preview uses the same receipt, drawn on the server (backend/src/og.ts).
import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Copy, Download, Eye, EyeOff, Linkedin, Loader2, Share2, Twitter } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ShareCardData = {
  storyId: string | null; headline: string; wait: string | null; score: number | null; company: string; foundingRank?: number | null;
  // For the receipt. All optional: a line is left off when it isn't known.
  outcome?: string | null; stage?: string | null; days?: number | null; salary?: { min: number; max: number } | null;
};

const tone = (s: number) => (s >= 70 ? "#22C55E" : s >= 40 ? "#F59E0B" : "#EF4444");
const word = (s: number) => (s >= 70 ? "Green flag" : s >= 40 ? "Mixed signals" : "Red flag");

// Interview rounds sat through, by the furthest stage reached.
export const ROUNDS: Record<string, number> = { application: 0, screening: 1, technical: 2, final: 3, offer: 3 };
// What came back at the end: silence counts as zero replies.
export const FINAL_REPLY: Record<string, string> = { ghosted: "0", ghost_job: "0", rejected: "1 (no)", offer: "1 (yes)", offer_revoked: "1, then taken back" };
const INK = "#141110", PAPER = "#FFFDF7";

// Bar widths from the link itself, so each story has its own barcode (decorative, not scannable).
function bars(text: string) {
  let h = 2166136261;
  return Array.from({ length: 44 }, (_, i) => { h = Math.imul(h ^ text.charCodeAt(i % text.length), 16777619); return 1 + ((h >>> 0) % 3); });
}

function Receipt({ data, showCompany, host, link }: { data: ShareCardData; showCompany: boolean; host: string; link: string }) {
  const rows: [string, string][] = [
    ...(data.stage ? [["Rounds", String(ROUNDS[data.stage] ?? 0)] as [string, string]] : []),
    ...(data.days != null ? [["Days waited", String(data.days)] as [string, string]] : []),
    ...(data.salary ? [["Pay offered", `₹${data.salary.min} to ${data.salary.max} LPA`] as [string, string]] : []),
    ...(data.outcome && FINAL_REPLY[data.outcome] ? [["Replies received", FINAL_REPLY[data.outcome]!] as [string, string]] : []),
  ];
  const lost = data.days != null ? `${data.days} ${data.days === 1 ? "day" : "days"}` : data.wait ?? "Untold";
  const mono = "'JetBrains Mono', 'Courier New', ui-monospace, monospace";
  const teeth = (flip: boolean) => ({ background: `linear-gradient(${flip ? 135 : -45}deg, transparent 6px, ${PAPER} 0) 0 0 / 12px 12px repeat-x, linear-gradient(${flip ? -135 : 45}deg, transparent 6px, ${PAPER} 0) 0 0 / 12px 12px repeat-x` });
  const no = (data.storyId ?? "000000000000000").replace(/(\d{4})(?=\d)/g, "$1 ");
  const date = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  return <div style={{ fontFamily: mono, color: INK }} className="mx-auto w-full max-w-[19rem] drop-shadow-[5px_5px_0_#141110] sm:max-w-[20rem]">
    {/* Torn top edge, then the paper, then a torn bottom edge: a slip straight off the till. */}
    <div aria-hidden="true" className="h-3 w-full" style={teeth(true)} />
    <div style={{ background: `linear-gradient(180deg, ${PAPER} 0%, #FBF7EC 100%)` }} className="px-5 pb-3 pt-3 text-[13px]">
      <div className="flex flex-col items-center text-center">
        <img src="/ghosted-mark.png" alt="" className="size-8 object-contain" crossOrigin="anonymous" />
        <p className="mt-1 text-lg font-bold" style={{ fontFamily: "'Space Grotesk', Inter, sans-serif" }}>Ghosted.</p>
        <p className="text-[11px] tracking-wide">HIRING RECEIPT</p>
      </div>
      <div className="mt-2 flex justify-between text-[10px] opacity-70"><span>No. {no}</span><span>{date}</span></div>
      <p className="mt-2 border-y border-dashed border-[#141110] py-1.5 text-center text-[11px] font-bold">{showCompany && data.company ? data.company : "Company: hidden"}</p>
      <p className="mt-3 text-[13px] font-bold leading-snug">{data.headline}</p>
      <div className="mt-3 space-y-1">{rows.map(([k, v]) => <div key={k} className="flex items-baseline gap-1"><span>{k}</span><span className="min-w-4 flex-1 translate-y-[-3px] border-b border-dotted border-[#14111066]" /><span className="font-bold tabular-nums">{v}</span></div>)}</div>
      <div className="mt-3 flex items-baseline justify-between border-t-2 border-[#141110] pt-2 text-base font-bold"><span>Time lost</span><span>{lost}</span></div>
      {data.score != null && <p className="mt-1 text-right text-[11px]">Flag Score {data.score} ({word(data.score).toLowerCase()})</p>}
      <p className="mt-3 text-center text-[11px]">No refunds. No feedback. No reply.</p>
      <div className="mt-3 flex h-10 items-stretch justify-center gap-[2px]" aria-hidden="true">{bars(link).map((w, i) => <span key={i} style={{ width: w, background: i % 2 ? "transparent" : INK }} />)}</div>
      <p className="mt-1 text-center text-[11px] font-bold tracking-wider">{host}</p>
    </div>
    <div aria-hidden="true" className="h-3 w-full" style={{ ...teeth(false), backgroundColor: "transparent" }} />
  </div>;
}

function Classic({ data, showCompany, host }: { data: ShareCardData; showCompany: boolean; host: string }) {
  return <div style={{ background: "#FAF7F2", color: INK, fontFamily: "'Space Grotesk', Inter, sans-serif" }} className="rounded-2xl border-2 border-[#141110] p-5 text-left shadow-[6px_6px_0_#141110]">
    <div className="flex items-center gap-2 text-lg font-bold"><img src="/ghosted-mark.png" alt="" className="size-8 object-contain" crossOrigin="anonymous" />Ghosted.</div>
    <p className="mt-4 text-[11px] font-bold uppercase tracking-wide" style={{ color: "#6D28D9" }}>{showCompany ? data.company : "A real hiring story"}</p>
    <p className="mt-1 text-2xl font-bold leading-tight">{data.headline}</p>
    <div className="mt-4 flex items-end justify-between gap-3">
      <div className="text-sm">{data.wait ? <><span className="block text-xs opacity-70">Waited</span><b>{data.wait}</b></> : <span className="opacity-70">Shared anonymously</span>}</div>
      {data.score != null && <div className="text-right"><span className="block text-4xl font-bold leading-none" style={{ color: tone(data.score) }}>{data.score}</span><span className="text-xs font-bold" style={{ color: tone(data.score) }}>{word(data.score)}</span></div>}
    </div>
    {data.foundingRank && <p className="mt-3 inline-block rounded-full border-2 px-2 py-0.5 text-[10px] font-bold uppercase" style={{ borderColor: "#6D28D9", color: "#6D28D9" }}>Founding contributor #{data.foundingRank}</p>}
    <p className="mt-4 border-t-2 border-dashed pt-3 text-xs font-semibold" style={{ borderColor: "#14111033" }}>Read it on {host}</p>
  </div>;
}

// `showCompany`/`onShowCompany` let the share popup keep the card and the LinkedIn post in step;
// `social: false` drops the LinkedIn/X links when the popup has its own LinkedIn composer.
export function ShareCard({ data, showCompany: shown, onShowCompany, social = true, onRenderer }: { data: ShareCardData; showCompany?: boolean; onShowCompany?: (v: boolean) => void; social?: boolean; onRenderer?: (draw: () => Promise<Blob>) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [look, setLook] = useState<"receipt" | "classic">("receipt");
  const [ownShow, setOwnShow] = useState(false);
  const showCompany = shown ?? ownShow;
  const setShowCompany = (f: (v: boolean) => boolean) => { const v = f(showCompany); setOwnShow(v); onShowCompany?.(v); };
  const [busy, setBusy] = useState<"" | "share" | "download">("");
  const host = window.location.host;
  const link = data.storyId ? `${window.location.origin}/s/${data.storyId}` : window.location.origin;
  const file = look === "receipt" ? "ghosted-receipt.png" : "ghosted-story.png";

  // Always drawn in the light palette, so the image looks the same in any theme. The receipt keeps a
  // transparent surround so its torn edge shows.
  const render = async () => toPng(ref.current!, { pixelRatio: 2, cacheBust: true, ...(look === "classic" && { backgroundColor: "#FAF7F2" }) });

  const download = async () => {
    setBusy("download");
    try { const a = document.createElement("a"); a.href = await render(); a.download = file; a.click(); }
    catch { toast.error("Couldn't make the image. Try again."); } finally { setBusy(""); }
  };
  const share = async () => {
    setBusy("share");
    try {
      const blob = await (await fetch(await render())).blob();
      const f = new File([blob], file, { type: "image/png" });
      const payload = { title: "My hiring story on Ghosted", text: `${data.headline} #GhostedReceipts`, url: link };
      if (navigator.canShare?.({ files: [f] })) await navigator.share({ ...payload, files: [f] });
      else if (navigator.share) await navigator.share(payload);
      else { await navigator.clipboard.writeText(link); toast.success("Link copied."); }
    } catch (e) { if ((e as Error).name !== "AbortError") toast.error("Couldn't share. Try Download instead."); }
    finally { setBusy(""); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(link); toast.success("Link copied."); } catch { toast.error("Couldn't copy the link."); } };

  // Hands the popup a way to draw this card, so its LinkedIn button can attach the image.
  useEffect(() => { onRenderer?.(async () => (await fetch(await render())).blob()); });

  return <div className="w-full max-w-sm">
    <div className="mb-3 grid grid-cols-2 rounded-lg border-2 border-foreground bg-muted p-1 text-sm font-bold" role="group" aria-label="Card style">
      {(["receipt", "classic"] as const).map((l) => <button key={l} type="button" aria-pressed={look === l} onClick={() => setLook(l)} className={cn("min-h-9 rounded-md px-3 transition-colors", look === l ? "bg-primary text-primary-foreground" : "hover:bg-background")}>{l === "receipt" ? "Receipt" : "Classic"}</button>)}
    </div>
    {/* The receipt sits on a soft dotted "counter" so its torn edges read on any background. */}
    <div className={cn(look === "receipt" && "no-scrollbar overflow-hidden rounded-xl border-2 border-dashed border-foreground/15 py-4 sm:py-5")}
      style={look === "receipt" ? { backgroundImage: "radial-gradient(color-mix(in oklch, var(--foreground) 12%, transparent) 1px, transparent 1px)", backgroundSize: "14px 14px" } : undefined}>
      <div ref={ref} className={look === "receipt" ? "px-3 pb-2 pt-1" : ""}>
        {look === "receipt" ? <Receipt data={data} showCompany={showCompany} host={host} link={link} /> : <Classic data={data} showCompany={showCompany} host={host} />}
      </div>
    </div>
    <button type="button" onClick={() => setShowCompany((v) => !v)} aria-pressed={showCompany} className={cn("mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border-2 border-foreground px-3 text-sm font-bold sm:w-auto", showCompany ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>
      {showCompany ? <EyeOff className="size-4" /> : <Eye className="size-4" />}{showCompany ? "Hide company name" : "Show company name"}
    </button>
    {social && <>
      {/* A gentle nudge: the link's preview card shows the story (never who wrote it). */}
      <p className="mt-4 text-sm font-semibold">Posting this to LinkedIn helps the next candidate. <span className="text-primary">#GhostedReceipts</span></p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button className="min-h-11" variant="outline" asChild><a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`} target="_blank" rel="noopener noreferrer"><Linkedin />LinkedIn</a></Button>
        <Button className="min-h-11" variant="outline" asChild><a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`${data.headline}. Shared anonymously on Ghosted.`)}&url=${encodeURIComponent(link)}&hashtags=GhostedReceipts`} target="_blank" rel="noopener noreferrer"><Twitter />Post on X</a></Button>
      </div>
    </>}
    <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-center [&>*:nth-child(3)]:col-span-2">
      <Button className="min-h-11" onClick={() => void share()} disabled={!!busy}>{busy === "share" ? <Loader2 className="animate-spin" /> : <Share2 />}Share</Button>
      <Button className="min-h-11" variant="outline" onClick={() => void download()} disabled={!!busy}>{busy === "download" ? <Loader2 className="animate-spin" /> : <Download />}Download PNG</Button>
      {data.storyId && <Button className="min-h-11" variant="outline" onClick={() => void copy()}><Copy />Copy link</Button>}
    </div>
  </div>;
}
