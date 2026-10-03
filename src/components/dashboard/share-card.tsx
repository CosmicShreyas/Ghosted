// After posting: an anonymous card to share the story. It shows how it ended, the wait, the story's
// Flag Score, the ghost mark and the site address. The company name is hidden unless you switch it
// on, and the author is never on it. Drawn in the browser (html-to-image); nothing is uploaded.
import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Copy, Download, Eye, EyeOff, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ShareCardData = { storyId: string | null; headline: string; wait: string | null; score: number | null; company: string; foundingRank?: number | null };

const tone = (s: number) => (s >= 70 ? "#22C55E" : s >= 40 ? "#F59E0B" : "#EF4444");
const word = (s: number) => (s >= 70 ? "Green flag" : s >= 40 ? "Mixed signals" : "Red flag");

export function ShareCard({ data }: { data: ShareCardData }) {
  const ref = useRef<HTMLDivElement>(null);
  const [showCompany, setShowCompany] = useState(false);
  const [busy, setBusy] = useState<"" | "share" | "download">("");
  const host = window.location.host;
  const link = data.storyId ? `${window.location.origin}/s/${data.storyId}` : window.location.origin;

  // Always drawn in the light palette, so the image looks the same in any theme.
  const render = async () => toPng(ref.current!, { pixelRatio: 2, cacheBust: true, backgroundColor: "#FAF7F2" });

  const download = async () => {
    setBusy("download");
    try { const a = document.createElement("a"); a.href = await render(); a.download = "ghosted-story.png"; a.click(); }
    catch { toast.error("Couldn't make the image. Try again."); } finally { setBusy(""); }
  };
  const share = async () => {
    setBusy("share");
    try {
      const blob = await (await fetch(await render())).blob();
      const file = new File([blob], "ghosted-story.png", { type: "image/png" });
      const payload = { title: "My hiring story on Ghosted", text: data.headline, url: link };
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ ...payload, files: [file] });
      else if (navigator.share) await navigator.share(payload);
      else { await navigator.clipboard.writeText(link); toast.success("Link copied."); }
    } catch (e) { if ((e as Error).name !== "AbortError") toast.error("Couldn't share. Try Download instead."); }
    finally { setBusy(""); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(link); toast.success("Link copied."); } catch { toast.error("Couldn't copy the link."); } };

  return <div className="w-full max-w-sm">
    <div ref={ref} style={{ background: "#FAF7F2", color: "#141110", fontFamily: "'Space Grotesk', Inter, sans-serif" }} className="rounded-2xl border-2 border-[#141110] p-5 text-left shadow-[6px_6px_0_#141110]">
      <div className="flex items-center gap-2 text-lg font-bold"><img src="/ghosted-mark.png" alt="" className="size-8 object-contain" crossOrigin="anonymous" />Ghosted.</div>
      <p className="mt-4 text-[11px] font-bold uppercase tracking-wide" style={{ color: "#6D28D9" }}>{showCompany ? data.company : "A real hiring story"}</p>
      <p className="mt-1 text-2xl font-bold leading-tight">{data.headline}</p>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="text-sm">{data.wait ? <><span className="block text-xs opacity-70">Waited</span><b>{data.wait}</b></> : <span className="opacity-70">Shared anonymously</span>}</div>
        {data.score != null && <div className="text-right"><span className="block text-4xl font-bold leading-none" style={{ color: tone(data.score) }}>{data.score}</span><span className="text-xs font-bold" style={{ color: tone(data.score) }}>{word(data.score)}</span></div>}
      </div>
      {data.foundingRank && <p className="mt-3 inline-block rounded-full border-2 px-2 py-0.5 text-[10px] font-bold uppercase" style={{ borderColor: "#6D28D9", color: "#6D28D9" }}>Founding contributor #{data.foundingRank}</p>}
      <p className="mt-4 border-t-2 border-dashed pt-3 text-xs font-semibold" style={{ borderColor: "#14111033" }}>Read it on {host}</p>
    </div>
    <button type="button" onClick={() => setShowCompany((v) => !v)} aria-pressed={showCompany} className={cn("mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-foreground px-3 text-sm font-bold", showCompany ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>
      {showCompany ? <EyeOff className="size-4" /> : <Eye className="size-4" />}{showCompany ? "Hide company name" : "Show company name"}
    </button>
    <div className="mt-3 flex flex-wrap justify-center gap-2">
      <Button className="min-h-11" onClick={() => void share()} disabled={!!busy}>{busy === "share" ? <Loader2 className="animate-spin" /> : <Share2 />}Share</Button>
      <Button className="min-h-11" variant="outline" onClick={() => void download()} disabled={!!busy}>{busy === "download" ? <Loader2 className="animate-spin" /> : <Download />}Download PNG</Button>
      {data.storyId && <Button className="min-h-11" variant="outline" onClick={() => void copy()}><Copy />Copy link</Button>}
    </div>
  </div>;
}
