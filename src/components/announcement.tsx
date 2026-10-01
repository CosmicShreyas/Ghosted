// The strip across the top of every page: the team's announcement, or a read-only notice. Both are
// set from the admin panel (Platform). Dismissing an announcement hides that exact text for good.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Info, Lock, PartyPopper, TriangleAlert, X } from "lucide-react";
import { API_URL, platformApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const KEY = "ghosted.announcement.dismissed";
const TONE = { info: { icon: Info, cls: "bg-avatar-sky" }, warn: { icon: TriangleAlert, cls: "bg-accent" }, good: { icon: PartyPopper, cls: "bg-avatar-mint" } } as const;
const readDismissed = () => { try { return localStorage.getItem(KEY); } catch { return null; } };

export function AnnouncementBar() {
  const q = useQuery({ queryKey: ["platform"], queryFn: platformApi.get, enabled: !!API_URL, staleTime: 60_000, refetchInterval: 5 * 60_000, retry: false });
  const [dismissed, setDismissed] = useState(readDismissed);
  const p = q.data;
  const a = p?.announcement && p.announcement.text !== dismissed ? p.announcement : null;
  const show = p?.readOnly || a;
  const T = a ? TONE[a.tone] : null;
  return <AnimatePresence initial={false}>{show && <motion.div key="bar" initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
    {/* Centred: the dashboard's fixed sidebar covers the strip's left edge, never the message. */}
    <div role="status" className={cn("relative border-b-2 border-foreground px-12 py-2.5 text-black", p?.readOnly ? "bg-flag-red text-white" : T?.cls)}>
      <p className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-center text-sm font-semibold">
        {p?.readOnly ? <><Lock className="size-4 shrink-0" />{p.readOnlyMessage}</>
          : a && T && <>
            <span className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-black bg-white"><T.icon className="size-3.5" /></span>
            <span>{a.text}</span>
            {a.link && <a href={a.link} className="inline-flex items-center rounded-full border-2 border-black bg-white px-2.5 py-0.5 text-xs font-bold shadow-[2px_2px_0_#000] transition-transform hover:-translate-y-px" {...(a.link.startsWith("http") && { target: "_blank", rel: "noopener noreferrer" })}>Learn more</a>}
          </>}
      </p>
      {a && !p?.readOnly && <button type="button" aria-label="Dismiss" onClick={() => { try { localStorage.setItem(KEY, a.text); } catch { /* storage blocked */ } setDismissed(a.text); }} className="absolute right-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md hover:bg-black/10"><X className="size-4" /></button>}
    </div>
  </motion.div>}</AnimatePresence>;
}
