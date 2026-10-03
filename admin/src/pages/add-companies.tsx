// Listing companies by hand from the admin panel: one at a time with a form, or many at once by
// pasting lines or a CSV (name, domain, industry, size, city, founded). Companies already on Ghosted
// (same website or name) are skipped and reported, never duplicated.
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, Check, FileUp, Loader2, Plus, Rows3, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiRequestError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { adminApi } from "../api";
import { field, Modal, Segmented } from "../ui";

const INDUSTRIES = ["software", "it_services", "fintech", "ecommerce", "edtech", "healthtech", "media", "consulting", "manufacturing", "bfsi", "telecom", "gaming", "logistics", "other"] as const;
const SIZES = ["1-10", "11-50", "51-200", "201-1000", "1001-5000", "5000+"] as const;
type Row = { name: string; domain?: string | undefined; industry?: string | undefined; size?: string | undefined; hqCity?: string | undefined; founded?: number | undefined; about?: string | undefined };
type Result = { name: string; status: "listed" | "skipped"; slug?: string; reason?: string };

// One company per line: "Name, domain, industry, size, city, founded". Only the name is required.
// A header line (starting with "name") is ignored; quoted CSV values are supported.
function parse(text: string): { rows: Row[]; errors: string[] } {
  const rows: Row[] = [], errors: string[] = [];
  const cells = (line: string) => (line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? []).map((c) => c.replace(/,$/, "").trim().replace(/^"|"$/g, "").replace(/""/g, '"')).filter((_, i, a) => i < a.length - 1 || a[i] !== "");
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || (i === 0 && /^name\b/i.test(line))) return;
    const [name = "", domain, industry, size, city, founded] = cells(line);
    if (name.length < 2) { errors.push(`Line ${i + 1}: needs a company name`); return; }
    const ind = industry?.toLowerCase().replace(/[\s-]+/g, "_");
    rows.push({
      name, ...(domain && { domain }),
      ...(ind && (INDUSTRIES as readonly string[]).includes(ind) && { industry: ind }),
      ...(size && (SIZES as readonly string[]).includes(size) && { size }),
      ...(city && city.length >= 2 && { hqCity: city }),
      ...(founded && /^\d{4}$/.test(founded) && { founded: Number(founded) }),
    });
  });
  return { rows, errors };
}

function Results({ results }: { results: Result[] }) {
  return <ul className="max-h-64 divide-y-2 divide-foreground/5 overflow-y-auto rounded-lg border-2 border-foreground/15" data-lenis-prevent>{results.map((r, i) => <li key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
    {r.status === "listed" ? <Check className="size-4 shrink-0 text-flag-green" /> : <X className="size-4 shrink-0 text-muted-foreground" />}
    <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
    <span className={cn("shrink-0 text-xs", r.status === "listed" ? "text-flag-green" : "text-muted-foreground")}>{r.status === "listed" ? "Listed" : r.reason}</span>
  </li>)}</ul>;
}

export function AddCompanies() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"one" | "bulk">("one");
  const [one, setOne] = useState<Row>({ name: "" });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const parsed = useMemo(() => parse(text), [text]);
  const done = () => void qc.invalidateQueries({ queryKey: ["admin", "companies"] });
  const fail = (e: unknown) => toast.error(e instanceof ApiRequestError ? (e.fields ? Object.values(e.fields)[0] ?? e.message : e.message) : "Couldn't save that.");

  const addOne = async () => {
    setBusy(true);
    try {
      const r = await adminApi<Result>("/companies", { method: "POST", body: { ...one, name: one.name.trim() } });
      toast.success(`${r.name} is listed.`); setOne({ name: "" }); done();
    } catch (e) { if (e instanceof ApiRequestError && e.status === 409) toast.error(e.message); else fail(e); }
    finally { setBusy(false); }
  };
  const addMany = async () => {
    setBusy(true);
    try {
      const r = await adminApi<{ listed: number; skipped: number; results: Result[] }>("/companies/bulk", { method: "POST", body: { companies: parsed.rows } });
      setResults(r.results); toast.success(`${r.listed} listed, ${r.skipped} skipped.`); done();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const readFile = async (f: File | undefined) => { if (f) setText(await f.text()); };

  return <>
    <Button onClick={() => { setOpen(true); setResults(null); }}><Plus />Add companies</Button>
    <Modal open={open} onClose={() => setOpen(false)} size="lg" title="Add companies" subtitle="List one company, or many at once. Anything already on Ghosted is skipped."
      footer={mode === "one"
        ? <Button disabled={busy || one.name.trim().length < 2} onClick={() => void addOne()}>{busy ? <Loader2 className="animate-spin" /> : <Building2 />}List company</Button>
        : <Button disabled={busy || !parsed.rows.length || parsed.rows.length > 500} onClick={() => void addMany()}>{busy ? <Loader2 className="animate-spin" /> : <Rows3 />}List {parsed.rows.length || ""} {parsed.rows.length === 1 ? "company" : "companies"}</Button>}>
      <Segmented label="Mode" value={mode} onChange={(m) => { setMode(m); setResults(null); }} options={[{ id: "one", label: "One company" }, { id: "bulk", label: "Bulk" }]} />
      {mode === "one" ? <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className="mb-1 block text-sm font-bold">Name</span><Input value={one.name} onChange={(e) => setOne({ ...one, name: e.target.value })} className={field} maxLength={80} autoFocus /></label>
        <label><span className="mb-1 block text-sm font-bold">Website <span className="font-normal text-muted-foreground">(for the logo)</span></span><Input value={one.domain ?? ""} onChange={(e) => setOne({ ...one, domain: e.target.value || undefined })} placeholder="example.com" className={field} /></label>
        <label><span className="mb-1 block text-sm font-bold">City</span><Input value={one.hqCity ?? ""} onChange={(e) => setOne({ ...one, hqCity: e.target.value || undefined })} placeholder="Bengaluru" className={field} /></label>
        <label><span className="mb-1 block text-sm font-bold">Industry</span><select value={one.industry ?? ""} onChange={(e) => setOne({ ...one, industry: e.target.value || undefined })} className={cn(field, "w-full px-3")}><option value="">Not set</option>{INDUSTRIES.map((i) => <option key={i} value={i}>{i.replace(/_/g, " ")}</option>)}</select></label>
        <label><span className="mb-1 block text-sm font-bold">Size</span><select value={one.size ?? ""} onChange={(e) => setOne({ ...one, size: e.target.value || undefined })} className={cn(field, "w-full px-3")}><option value="">Not set</option>{SIZES.map((s) => <option key={s} value={s}>{s} people</option>)}</select></label>
        <label><span className="mb-1 block text-sm font-bold">Founded</span><Input inputMode="numeric" value={one.founded ?? ""} onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 4); setOne({ ...one, founded: v.length === 4 ? Number(v) : undefined }); }} placeholder="2004" className={field} /></label>
        <label className="sm:col-span-2"><span className="mb-1 block text-sm font-bold">About <span className="font-normal text-muted-foreground">(optional, 80 to 800 characters)</span></span><Textarea value={one.about ?? ""} onChange={(e) => setOne({ ...one, about: e.target.value || undefined })} maxLength={800} className="min-h-20 rounded-lg border-2 border-foreground bg-background" /></label>
      </div> : <div className="mt-5 space-y-3">
        <p className="text-sm text-muted-foreground">One company per line: <code className="rounded bg-muted px-1.5 font-mono text-xs">Name, domain, industry, size, city, founded</code>. Only the name is required. A header line is ignored, and CSV files work too.</p>
        <Textarea value={text} onChange={(e) => { setText(e.target.value); setResults(null); }} placeholder={"Accenture, accenture.com, consulting, 5000+, Bengaluru, 1989\nRazorpay, razorpay.com, fintech, 1001-5000, Bengaluru, 2014\nZepto"} className="min-h-44 rounded-lg border-2 border-foreground bg-background font-mono text-sm" />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border-2 border-foreground px-3 py-1.5 font-bold hover:bg-muted"><FileUp className="size-4" />Load a CSV<input type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={(e) => void readFile(e.target.files?.[0])} /></label>
          <span className="text-muted-foreground">{parsed.rows.length} ready{parsed.rows.length > 500 && " (500 at most per batch)"}{parsed.errors.length > 0 && `, ${parsed.errors.length} with problems`}</span>
        </div>
        {parsed.errors.length > 0 && <ul className="rounded-lg border-2 border-flag-red bg-flag-red/5 p-3 text-xs text-flag-red">{parsed.errors.slice(0, 5).map((e) => <li key={e}>{e}</li>)}</ul>}
        {results && <Results results={results} />}
      </div>}
    </Modal>
  </>;
}
