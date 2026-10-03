// Listing companies from the admin panel, the same way as on the main site: paste a website link and
// everything (name, logo, about, industry, size, city, founded, careers page) is fetched from the
// company's own site and Wikidata. One link, or a whole list: links are fetched in batches, shown
// as an editable preview, then added together. Companies already on Ghosted are flagged and skipped.
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Building2, Check, Globe, Link2, Loader2, Plus, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiRequestError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { adminApi } from "../api";
import { field, Modal, Segmented } from "../ui";

type Draft = { name: string; domain: string; website: string; logoUrl?: string; about?: string; industry?: string; size?: string; hqCity?: string; founded?: number; careersUrl?: string };
type Fetched = { input: string; ok: true; existing: { name: string; slug: string } | null; draft: Draft } | { input: string; ok: false; error: string };
type Item = Fetched & { include: boolean; result?: { status: "listed" | "skipped"; reason?: string | undefined } };
const BATCH = 5;

const clean = (d: Draft) => Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined && v !== null && v !== ""));
const links = (text: string) => [...new Set(text.split(/[\s,;]+/).map((s) => s.trim()).filter((s) => /[a-z0-9-]+\.[a-z]{2,}/i.test(s)))];

function Logo({ d }: { d: Draft }) {
  const [broken, setBroken] = useState(false);
  return <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border-2 border-foreground bg-white">
    {d.logoUrl && !broken ? <img src={d.logoUrl} alt="" className="size-[70%] object-contain" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : <span className="font-display text-lg font-bold text-black">{d.name.charAt(0)}</span>}
  </span>;
}

function PreviewCard({ item, onChange, single = false }: { item: Item; onChange: (i: Item) => void; single?: boolean }) {
  if (!item.ok) return <div className="flex items-start gap-3 rounded-xl border-2 border-flag-red/40 bg-flag-red/5 p-3 text-sm">
    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-flag-red" /><span className="min-w-0"><span className="block break-all font-semibold">{item.input}</span><span className="text-muted-foreground">{item.error}</span></span>
  </div>;
  const d = item.draft;
  const set = (patch: Partial<Draft>) => onChange({ ...item, draft: { ...d, ...patch } });
  const facts = [d.industry?.replace(/_/g, " "), d.size && `${d.size} people`, d.hqCity, d.founded && `since ${d.founded}`].filter(Boolean).join(" · ");
  return <div className={cn("rounded-xl border-2 p-3 transition-colors", item.existing ? "border-foreground/15 opacity-70" : item.include ? "border-foreground bg-card" : "border-foreground/15")}>
    <div className="flex items-start gap-3">
      {!single && !item.existing && <input type="checkbox" checked={item.include} onChange={(e) => onChange({ ...item, include: e.target.checked })} aria-label={`Add ${d.name}`} className="mt-4 size-4 shrink-0 accent-[var(--color-primary)]" />}
      <Logo d={d} />
      <div className="min-w-0 flex-1">
        <Input value={d.name} onChange={(e) => set({ name: e.target.value })} aria-label="Company name" maxLength={80} className="h-9 border-2 border-foreground/20 font-bold" disabled={!!item.existing} />
        <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground"><Globe className="size-3" />{d.domain}{facts && ` · ${facts}`}</p>
      </div>
      {item.result ? <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-bold", item.result.status === "listed" ? "bg-flag-green text-primary-foreground" : "bg-muted")}>{item.result.status === "listed" ? "Added" : item.result.reason ?? "Skipped"}</span>
        : item.existing && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-bold">Already listed</span>}
    </div>
    {single && d.about && <p className="mt-3 line-clamp-4 text-sm text-muted-foreground">{d.about}</p>}
  </div>;
}

async function fetchAll(list: string[], onProgress: (done: number, items: Item[]) => void) {
  const out: Item[] = [];
  for (let i = 0; i < list.length; i += BATCH) {
    const r = await adminApi<{ items: Fetched[] }>("/companies/fetch", { method: "POST", body: { websites: list.slice(i, i + BATCH) } });
    out.push(...r.items.map((it) => ({ ...it, include: it.ok && !it.existing })));
    onProgress(Math.min(list.length, i + BATCH), [...out]);
  }
  return out;
}

export function AddCompanies() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"one" | "bulk">("one");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const pasted = useMemo(() => links(text), [text]);
  const chosen = items.filter((i) => i.ok && i.include && !i.existing && !i.result);
  const reset = () => { setItems([]); setProgress(null); };
  const fail = (e: unknown) => toast.error(e instanceof ApiRequestError ? e.message : "Something went wrong. Try again.");

  const fetchLinks = async (list: string[]) => {
    if (!list.length) return;
    setBusy(true); setItems([]); setProgress({ done: 0, total: list.length });
    try { await fetchAll(list, (done, got) => { setProgress({ done, total: list.length }); setItems(got); }); }
    catch (e) { fail(e); } finally { setBusy(false); }
  };

  const add = async () => {
    if (!chosen.length) return;
    setBusy(true);
    try {
      if (mode === "one") {
        const it = chosen[0]!; if (!it.ok) return;
        const r = await adminApi<{ name: string; status: "listed" | "skipped"; reason?: string }>("/companies", { method: "POST", body: clean(it.draft) });
        toast.success(`${r.name} is listed.`); setUrl(""); reset();
      } else {
        const r = await adminApi<{ listed: number; skipped: number; results: { name: string; status: "listed" | "skipped"; reason?: string }[] }>("/companies/bulk", { method: "POST", body: { companies: chosen.map((i) => (i.ok ? clean(i.draft) : {})) } });
        // Match results back to the preview rows, in order.
        let k = 0;
        setItems((all) => all.map((i) => (i.ok && i.include && !i.existing && !i.result ? { ...i, result: r.results[k++] ?? { status: "skipped" as const } } : i)));
        toast.success(`${r.listed} added${r.skipped ? `, ${r.skipped} skipped` : ""}.`);
      }
      void qc.invalidateQueries({ queryKey: ["admin", "companies"] });
    } catch (e) { if (e instanceof ApiRequestError && e.status === 409) toast.error(e.message); else fail(e); }
    finally { setBusy(false); }
  };

  const footer = items.length > 0 && chosen.length > 0
    ? <><Button variant="ghost" onClick={reset}><RotateCcw />Start over</Button><span className="ml-auto" /><Button disabled={busy} onClick={() => void add()}>{busy ? <Loader2 className="animate-spin" /> : <Check />}{mode === "one" ? "Add company" : `Add ${chosen.length} ${chosen.length === 1 ? "company" : "companies"}`}</Button></>
    : mode === "one"
      ? <Button disabled={busy || url.trim().length < 4} onClick={() => void fetchLinks([url.trim()])}>{busy ? <Loader2 className="animate-spin" /> : <Sparkles />}Fetch details</Button>
      : <Button disabled={busy || !pasted.length || pasted.length > 200} onClick={() => void fetchLinks(pasted)}>{busy ? <Loader2 className="animate-spin" /> : <Sparkles />}Fetch {pasted.length || ""} {pasted.length === 1 ? "website" : "websites"}</Button>;

  return <>
    <Button onClick={() => { setOpen(true); reset(); }}><Plus />Add companies</Button>
    <Modal open={open} onClose={() => setOpen(false)} size="lg" title="Add companies" subtitle="Paste a website and everything is fetched from the company's own site, like listing on Ghosted." footer={footer}>
      <Segmented label="Mode" value={mode} onChange={(m) => { setMode(m); reset(); }} options={[{ id: "one", label: "One company" }, { id: "bulk", label: "Many at once" }]} />

      {mode === "one" ? <form className="mt-5" onSubmit={(e) => { e.preventDefault(); void fetchLinks([url.trim()]); }}>
        <label className="block"><span className="mb-1 block text-sm font-bold">Company website</span>
          <span className="flex items-center gap-2 rounded-lg border-2 border-foreground bg-background px-3"><Link2 className="size-4 text-muted-foreground" /><input value={url} onChange={(e) => { setUrl(e.target.value); reset(); }} placeholder="razorpay.com" autoFocus className="h-11 min-w-0 flex-1 bg-transparent outline-none" /></span></label>
        <p className="mt-1.5 text-xs text-muted-foreground">The company's own domain. Name, logo, about, industry, size, city and founding year are filled in for you.</p>
      </form> : <div className="mt-5">
        <label className="block"><span className="mb-1 block text-sm font-bold">Company websites</span>
          <Textarea value={text} onChange={(e) => { setText(e.target.value); reset(); }} placeholder={"razorpay.com\nfreshworks.com\nhttps://www.zoho.com\nzepto.com"} className="min-h-40 rounded-lg border-2 border-foreground bg-background font-mono text-sm" /></label>
        <p className="mt-1.5 text-xs text-muted-foreground">One per line (commas or spaces work too). {pasted.length ? `${pasted.length} found${pasted.length > 200 ? ", 200 at most at a time" : ""}.` : "Fetched 5 at a time."}</p>
      </div>}

      <AnimatePresence>{progress && <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-5">
        {busy && progress.done < progress.total && <div className="mb-3">
          <p className="flex items-center gap-2 text-sm font-semibold"><Loader2 className="size-4 animate-spin" />Fetching {progress.done} of {progress.total}…</p>
          <div className="mt-1.5 h-2 rounded-full border-2 border-foreground bg-muted"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
        </div>}
        {items.length > 0 && <>
          {mode === "bulk" && <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-bold">Preview</span>
            <span className="text-muted-foreground">{items.filter((i) => i.ok && !i.existing).length} new · {items.filter((i) => i.ok && i.existing).length} already listed · {items.filter((i) => !i.ok).length} couldn't be read</span>
          </div>}
          <div className="max-h-[22rem] space-y-2 overflow-y-auto pr-1" data-lenis-prevent>{items.map((it, i) => <PreviewCard key={`${it.input}-${i}`} single={mode === "one"} item={it} onChange={(n) => setItems((all) => all.map((x, j) => (j === i ? n : x)))} />)}</div>
          {!busy && items.every((i) => !i.ok || i.existing || i.result) && <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Building2 className="size-4" />{items.some((i) => i.result?.status === "listed") ? "Done. The new companies are live on Ghosted." : "Nothing new to add from these."}</p>}
        </>}
      </motion.div>}</AnimatePresence>
    </Modal>
  </>;
}
