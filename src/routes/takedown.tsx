import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FileWarning, Loader2, Search } from "lucide-react";
import { LegalPage, docHead } from "@/components/legal-page";
import { ContentRequestDialog } from "@/components/company-voice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiRequestError, apiEnabled } from "@/lib/api";
import { requestStatus, type RequestStatus } from "@/lib/company-voice";
import { takedownDoc } from "@/content/legal";

// The takedown process for companies and anyone else: the steps, timelines and outcomes, the form,
// and a status check by reference and email. Rules: backend/src/takedown.ts.
export const Route = createFileRoute("/takedown")({
  head: () => docHead(takedownDoc, "How to ask Ghosted to correct or remove content: who can ask, what we act on, the steps and timelines, possible outcomes, and how to check or appeal a decision.", "/takedown"),
  component: TakedownPage,
});

const STATUS: Record<RequestStatus["status"], string> = { open: "Received, waiting to be acknowledged", acknowledged: "Under review by a moderator", resolved: "Decided", declined: "Decided: declined" };
const OUTCOME: Record<string, string> = { no_action: "No action: the content stays up", author_corrected: "Corrected by the author", redacted: "Part of the content was redacted", removed: "The content was removed", other: "Resolved another way" };
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null);

function FileRequest() {
  const [open, setOpen] = useState(false);
  return <div className="mt-5 rounded-xl border-2 border-foreground bg-accent p-4">
    <p className="font-bold">Ready to send one?</p>
    <p className="text-sm text-muted-foreground">It takes a few minutes. You'll get a reference number straight away.</p>
    <Button className="mt-3" onClick={() => setOpen(true)}><FileWarning />File a takedown request</Button>
    <ContentRequestDialog open={open} onOpenChange={setOpen} />
  </div>;
}

function StatusCheck() {
  const [ref, setRef] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RequestStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const check = async () => {
    setBusy(true); setError(null); setResult(null);
    try { setResult(await requestStatus(ref.trim(), email)); }
    catch (e) { setError(e instanceof ApiRequestError && e.status === 404 ? "No request matches that reference and email." : "Couldn't check right now. Try again."); }
    finally { setBusy(false); }
  };
  if (!apiEnabled) return null;
  return <form className="mt-5 rounded-xl border-2 border-foreground bg-background p-4" onSubmit={(e) => { e.preventDefault(); if (/^\d{15}$/.test(ref.trim()) && email.includes("@")) void check(); }}>
    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className="block text-sm font-bold">Reference<Input value={ref} onChange={(e) => setRef(e.target.value.replace(/\D/g, "").slice(0, 15))} inputMode="numeric" placeholder="15 digits" className="mt-1 h-11 border-2 border-foreground font-normal tabular-nums" /></label>
      <label className="block text-sm font-bold">Email you used<Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="mt-1 h-11 border-2 border-foreground font-normal" /></label>
      <Button type="submit" className="h-11" disabled={busy || ref.trim().length !== 15 || !email.includes("@")}>{busy ? <Loader2 className="animate-spin" /> : <Search />}Check</Button>
    </div>
    {error && <p role="alert" className="mt-3 text-sm font-semibold text-flag-red">{error}</p>}
    {result && <div className="mt-4 rounded-lg border-2 border-foreground/15 p-3 text-sm">
      <p className="font-bold">{STATUS[result.status]}</p>
      <p className="mt-1 text-muted-foreground">{result.kind === "removal" ? "Removal" : "Correction"} request · received {day(result.createdAt)}{result.acknowledgedAt ? ` · acknowledged ${day(result.acknowledgedAt)}` : ""}{result.resolvedAt ? ` · decided ${day(result.resolvedAt)}` : ""}</p>
      {result.outcome && <p className="mt-2 font-semibold">{OUTCOME[result.outcome] ?? result.outcome}</p>}
      {result.resolution && <p className="mt-1">{result.resolution}</p>}
    </div>}
  </form>;
}

function TakedownPage() {
  return <LegalPage doc={takedownDoc} insertAfter={{ include: <FileRequest />, status: <StatusCheck /> }} />;
}
