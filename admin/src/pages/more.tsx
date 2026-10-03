// Companies, donations, Goofy's word lists, the audit log and your account.
import { useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, BookText, Building2, Check, Eye, IndianRupee, KeyRound, Loader2, LogOut, Plus, ScrollText, Search, ShieldCheck, Undo2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiRequestError } from "@/lib/api";
import { adminApi, SITE_URL, type AdminMe } from "../api";
import { ago, card, Chip, Empty, inr, PageHead, Segmented, Stat, useConfirm } from "../ui";
import { cn } from "@/lib/utils";
import { AddCompanies } from "./add-companies";
import { DonationsSkeleton, RuledListSkeleton } from "../page-skeletons";

const fail = (e: unknown) => toast.error(e instanceof ApiRequestError ? e.message : "Couldn't do that.");

// ---------- companies ----------

type Company = { slug: string; name: string; domain: string | null; website: string | null; logo_url: string | null; industry: string | null; size: string | null; hq_city: string | null; status: "listed" | "hidden"; created_at: string; about: string | null };
export function CompaniesPage() {
  const { ask, confirmation } = useConfirm();
  const qc = useQueryClient();
  const [status, setStatus] = useState<"all" | "listed" | "hidden">("all");
  const [q, setQ] = useState("");
  const query = useQuery({ queryKey: ["admin", "companies", status, q], queryFn: () => adminApi<{ items: Company[] }>(`/companies?status=${status}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`) });
  const toggle = async (c: Company) => {
    try { await adminApi(`/companies/${c.slug}`, { method: "PATCH", body: { status: c.status === "listed" ? "hidden" : "listed" } }); toast.success(c.status === "listed" ? `${c.name} hidden.` : `${c.name} listed again.`); void qc.invalidateQueries({ queryKey: ["admin", "companies"] }); }
    catch (e) { fail(e); }
  };
  return <>
    <PageHead eyebrow="Catalogue" title="Companies" copy="Every listing, newest first. Hiding one removes it (and its page) from the site; its stories stay in the database." action={<div className="flex flex-wrap items-center gap-2"><Segmented label="Status" value={status} onChange={setStatus} options={[{ id: "all", label: "All" }, { id: "listed", label: "Listed" }, { id: "hidden", label: "Hidden" }]} /><AddCompanies /></div>} />
    <label className="mb-4 flex h-11 items-center gap-2 rounded-lg border-2 border-foreground bg-card px-3"><Search className="size-4 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
    {query.isPending ? <RuledListSkeleton rows={4} logo /> : !query.data?.items.length ? <Empty icon={Building2} title="No companies" />
      : <ul className={cn(card, "divide-y-2 divide-foreground/10")}>{query.data.items.map((c) => <li key={c.slug} className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
        <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg border-2 border-foreground bg-white">{c.logo_url ? <img src={c.logo_url} alt="" className="size-[70%] object-contain" referrerPolicy="no-referrer" /> : <Building2 className="size-4 text-black" />}</span>
        <div className="min-w-0 flex-1"><p className="truncate font-bold">{c.name} {c.status === "hidden" && <Chip tone="bg-flag-red/15 text-flag-red">hidden</Chip>}</p><p className="truncate text-xs text-muted-foreground">{[c.domain, c.industry?.replace(/_/g, " "), c.hq_city, ago(c.created_at)].filter(Boolean).join(" · ")}</p></div>
        <span className="ml-13 flex basis-full items-center justify-end gap-3 sm:ml-0 sm:basis-auto"><a href={`${SITE_URL}/c/${c.slug}`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-muted-foreground hover:text-foreground">Open</a>
        <Button size="sm" variant={c.status === "listed" ? "outline" : "default"} onClick={() => c.status === "listed" ? void ask({ title: `Hide ${c.name}?`, copy: "Its company page will disappear from the public site. Existing stories stay in the database.", confirm: "Hide company", danger: true }).then((ok) => ok && toggle(c)) : void toggle(c)}>{c.status === "listed" ? <><Ban />Hide</> : <><Undo2 />List again</>}</Button></span>
      </li>)}</ul>}
    {confirmation}</>;
}

// ---------- donations ----------

type Donation = { publicId: string; amount: number; status: "created" | "paid" | "failed"; message: string | null; show_name: boolean; razorpay_order_id: string; razorpay_payment_id: string | null; created_at: string; paid_at: string | null; donor: { handle: string } };
export function DonationsPage() {
  const q = useQuery({ queryKey: ["admin", "donations"], queryFn: () => adminApi<{ items: Donation[] }>("/donations") });
  const paid = (q.data?.items ?? []).filter((d) => d.status === "paid");
  const total = paid.reduce((s, d) => s + d.amount, 0);
  return <>
    <PageHead eyebrow="Money" title="Donations" copy="Through Razorpay. Refunds and payouts happen in the Razorpay dashboard; this is the record." />
    {q.isPending ? <DonationsSkeleton /> : <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Raised" value={inr(total)} icon={IndianRupee} tone="text-flag-green" />
        <Stat label="Donations" value={paid.length} icon={Check} />
        <Stat label="Average" value={paid.length ? inr(total / paid.length) : "–"} icon={IndianRupee} />
        <Stat label="Abandoned" value={(q.data?.items ?? []).filter((d) => d.status !== "paid").length} icon={Ban} note="Orders opened, not paid" />
      </div>
      {!q.data?.items.length ? <Empty icon={IndianRupee} title="No donations yet" /> : <><div className={cn(card, "hidden overflow-x-auto sm:block")}><table className="w-full min-w-[640px] text-sm">
        <thead><tr className="border-b-2 border-foreground text-left text-xs uppercase text-muted-foreground"><th className="p-3">When</th><th className="p-3">Who</th><th className="p-3 text-right">Amount</th><th className="p-3">Status</th><th className="p-3">Note</th><th className="p-3">Payment</th></tr></thead>
        <tbody className="divide-y-2 divide-foreground/10">{q.data.items.map((d) => <tr key={d.publicId}>
          <td className="whitespace-nowrap p-3">{ago(d.paid_at ?? d.created_at)}</td>
          <td className="p-3">{d.donor.handle}{d.show_name && <Chip tone="bg-accent">on wall</Chip>}</td>
          <td className="p-3 text-right font-bold tabular-nums">{inr(d.amount)}</td>
          <td className="p-3"><Chip tone={d.status === "paid" ? "bg-flag-green/20 text-flag-green" : d.status === "failed" ? "bg-flag-red/15 text-flag-red" : "bg-muted"}>{d.status}</Chip></td>
          <td className="max-w-56 truncate p-3 text-muted-foreground">{d.message}</td>
          <td className="p-3 font-mono text-[11px] text-muted-foreground">{d.razorpay_payment_id ?? d.razorpay_order_id}</td>
        </tr>)}</tbody></table></div><ul className="space-y-2 sm:hidden">{q.data.items.map((d) => <li key={d.publicId} className={cn(card, "p-3")}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold">{d.donor.handle}</p><p className="text-xs text-muted-foreground">{ago(d.paid_at ?? d.created_at)}</p></div><p className="font-display text-xl font-bold tabular-nums">{inr(d.amount)}</p></div><div className="mt-2 flex flex-wrap items-center gap-1.5"><Chip tone={d.status === "paid" ? "bg-flag-green/20 text-flag-green" : d.status === "failed" ? "bg-flag-red/15 text-flag-red" : "bg-muted"}>{d.status}</Chip>{d.show_name && <Chip tone="bg-accent">on wall</Chip>}</div>{d.message && <p className="mt-2 text-sm text-muted-foreground">{d.message}</p>}<p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">{d.razorpay_payment_id ?? d.razorpay_order_id}</p></li>)}</ul></>}
    </div>}
  </>;
}

// ---------- word lists ----------

type Term = { term: string; tier: "slur" | "severe" | "profanity" | "watch"; source: string; weight: number; status: "active" | "retired"; evidence: Record<string, unknown> | null; updated_at: string };
const TIER_TONE: Record<string, string> = { slur: "bg-flag-red text-primary-foreground", severe: "bg-flag-red/15 text-flag-red", profanity: "bg-flag-amber/30", watch: "bg-primary/15 text-primary" };
export function TermsPage() {
  const { ask, confirmation } = useConfirm();
  const qc = useQueryClient();
  const [source, setSource] = useState<"learned" | "variant" | "all">("learned");
  const [status, setStatus] = useState<"active" | "retired">("active");
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [tier, setTier] = useState<Term["tier"]>("watch");
  const query = useQuery({ queryKey: ["admin", "terms", source, status, q], queryFn: () => adminApi<{ items: Term[] }>(`/terms?source=${source}&status=${status}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`) });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["admin", "terms"] });
  const patch = async (t: Term, body: Record<string, unknown>, ok: string) => { try { await adminApi(`/terms/${encodeURIComponent(t.term)}`, { method: "PATCH", body }); toast.success(ok); refresh(); } catch (e) { fail(e); } };
  const add = async () => { if (term.trim().length < 2) return; try { await adminApi("/terms", { method: "POST", body: { term: term.trim(), tier } }); toast.success(`“${term.trim()}” added.`); setTerm(""); refresh(); } catch (e) { fail(e); } };
  return <>
    <PageHead eyebrow="Goofy" title="Word lists" copy="What Goofy learned from the community, plus anything you add. Open lists refresh themselves daily. “Allow” means the word is fine here and can never be flagged again." />
    <div className={cn(card, "mb-4 flex flex-wrap items-end gap-2 p-4")}>
      <label className="min-w-48 basis-full sm:flex-1 sm:basis-auto"><span className="mb-1.5 block text-sm font-bold">Add a word or phrase</span><Input value={term} onChange={(e) => setTerm(e.target.value.slice(0, 60))} placeholder="e.g. a new disguised spelling" className="h-10 rounded-lg border-2 border-foreground bg-background" /></label>
      <div className="min-w-0 flex-1 sm:w-40 sm:flex-none"><span className="mb-1.5 block text-sm font-bold">Tier</span><Select value={tier} onValueChange={(v) => setTier(v as Term["tier"])}><SelectTrigger className="h-10"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="watch">Watch (hold)</SelectItem><SelectItem value="profanity">Profanity</SelectItem><SelectItem value="severe">Severe</SelectItem><SelectItem value="slur">Slur (block)</SelectItem></SelectContent></Select></div>
      <Button className="mt-6" onClick={() => void add()}><Plus />Add</Button>
    </div>
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Segmented label="Source" value={source} onChange={setSource} options={[{ id: "learned", label: "Learned" }, { id: "variant", label: "Spellings" }, { id: "all", label: "All" }]} />
      <Segmented label="Status" value={status} onChange={setStatus} options={[{ id: "active", label: "Active" }, { id: "retired", label: "Retired" }]} />
      <label className="flex h-9 min-w-40 flex-1 items-center gap-2 rounded-lg border-2 border-foreground bg-card px-3"><Search className="size-4 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
    </div>
    {query.isPending ? <RuledListSkeleton rows={5} /> : !query.data?.items.length ? <Empty icon={BookText} title="No words here" copy="Goofy hasn't learned anything new yet." />
      : <ul className={cn(card, "divide-y-2 divide-foreground/10")}>{query.data.items.map((t) => <li key={t.term} className="flex flex-wrap items-center gap-2 p-3">
        <code className="rounded bg-muted px-2 py-0.5 font-mono text-sm font-bold">{t.term}</code>
        <Chip tone={TIER_TONE[t.tier]}>{t.tier}</Chip><span className="text-xs text-muted-foreground">{t.source}{typeof t.evidence?.["z"] === "number" ? ` · z ${t.evidence["z"]}` : ""}{typeof t.evidence?.["of"] === "string" ? ` · spelling of “${t.evidence["of"]}”` : ""} · {ago(t.updated_at)}</span>
        <span className="flex basis-full justify-end gap-1.5 sm:ml-auto sm:basis-auto">
          {t.status === "active" ? <Button size="sm" variant="outline" onClick={() => void patch(t, { status: "retired" }, "Retired.")}>Retire</Button> : <Button size="sm" variant="outline" onClick={() => void patch(t, { status: "active" }, "Active again.")}>Activate</Button>}
          <Button size="sm" variant="outline" onClick={() => void ask({ title: `Always allow “${t.term}”?`, copy: "Goofy will retire this term and place it on the allow-list so it cannot be flagged again.", confirm: "Always allow" }).then((ok) => ok && patch(t, { allow: true }, `“${t.term}” is allowed from now on.`))}><Check />Allow</Button>
        </span>
      </li>)}</ul>}
    {confirmation}</>;
}

// ---------- audit log ----------

// Lives in its own file (pages, filters, readable details).
export { AuditPage } from "./audit";
