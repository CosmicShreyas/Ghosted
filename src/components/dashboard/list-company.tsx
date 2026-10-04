// "List a company": anyone signed in can add a company, but only a real one. The website comes
// first and is checked by the server (reachable, the company's own domain, not already listed),
// which also fetches the company's icon. The rest of the form opens once the website passes.
// Every rule here is enforced again by the API (backend/src/routes/companies.ts).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, Bell, Building2, CheckCircle2, ExternalLink, Globe, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { CompanyMark } from "@/components/ghosted";
import { HumanCheck, useHumanCheck } from "@/components/human-check";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiRequestError, apiEnabled, askToJoin } from "@/lib/api";
import { liveNudge } from "@/lib/live";
import { companyFromApi, type CompanyDto } from "@/lib/stories";
import { cn } from "@/lib/utils";
import { useMe, useTone, voice } from "@/lib/session";
import type { Company } from "@/mock/data";
import { INDUSTRY_LABEL } from "./global-widgets";
import { popup, popupBody } from "./ui-kit";

type Site = { homepage: string; domain: string; title: string | null; siteName: string | null; description: string | null; iconUrl: string | null; readable?: boolean };
// What the server found about the company (its own site + Wikidata), to fill the form in.
type Facts = { name: string | null; about: string | null; aboutSource: "website" | "wikipedia" | null; industry: string | null; size: string | null; hqCity: string | null; founded: number | null; careersUrl: string | null; filled: string[]; sources: ("website" | "wikidata" | "wikipedia")[] };
type FillKey = "name" | "about" | "industry" | "size" | "hqCity" | "founded" | "careersUrl";
// Listings left (server counts companies that actually went live, per rolling day and week).
type Quota = { remaining: number; dayLeft: number; weekLeft: number; limits: { day: number; week: number }; resetsAt: string | null; message: string | null };
const SOURCE_NAME = { website: "the company's website", wikidata: "Wikidata", wikipedia: "Wikipedia" } as const;
type Check = { state: "idle" } | { state: "checking" } | { state: "error"; message: string } | { state: "exists"; company: CompanyDto; site?: Site } | { state: "ok"; site: Site };

const SIZES = ["1-10", "11-50", "51-200", "201-1000", "1001-5000", "5000+"];
const YEAR = new Date().getFullYear();

// ---------- the same rules the API applies, for instant feedback ----------

const LINKISH = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|in|io|co|net|org|ai|app)\b)/i;
const CONTACT = /([\w.+-]+@[\w-]+\.[\w.]+|(\+?\d[\d\s-]{8,}\d))/;
const lettersShare = (s: string) => (s.match(/\p{L}/gu)?.length ?? 0) / Math.max(1, s.replace(/\s/g, "").length);
const looksLikeDomain = (s: string) => /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/i.test(s.trim());

function nameError(s: string) {
  const v = s.trim();
  if (v.length < 2) return "Use the company's full name";
  if (v.length > 80) return "Keep the name under 80 characters";
  if (!/\p{L}/u.test(v) || lettersShare(v) < 0.6 || /(.)\1{3,}/i.test(v)) return "That doesn't look like a company name";
  if (LINKISH.test(v) || CONTACT.test(v)) return "Just the name, without links or contact details";
  if (v.length > 6 && v === v.toUpperCase()) return "Write the name in normal case, not ALL CAPS";
  return null;
}
function aboutError(s: string) {
  const v = s.trim();
  if (v.length < 80) return `Write at least 80 characters (${80 - v.length} to go)`;
  if (v.length > 800) return "Keep it under 800 characters";
  if (v.split(/\s+/).filter((w) => w.length > 1).length < 12) return "Use at least a couple of full sentences";
  if (LINKISH.test(v)) return "No links here (the website has its own field)";
  if (CONTACT.test(v)) return "No email addresses or phone numbers, please";
  if (lettersShare(v) < 0.7 || /(.)\1{5,}/.test(v) || new Set(v.toLowerCase().split(/\s+/)).size < 8) return "Describe what the company actually does";
  if ((v.match(/\p{Lu}/gu)?.length ?? 0) / Math.max(1, v.match(/\p{L}/gu)?.length ?? 1) >= 0.5) return "Please don't write in ALL CAPS";
  return null;
}
const cityError = (s: string) => (s.trim().length < 2 ? "Where is it headquartered?" : !/^[\p{L} .'-]+$/u.test(s.trim()) ? "Just the city name" : null);
const foundedError = (s: string) => (!s ? null : !/^\d{4}$/.test(s) || Number(s) < 1800 ? "Use a year like 2015" : Number(s) > YEAR ? "That's in the future" : null);
const careersError = (s: string, domain?: string) => {
  if (!s.trim()) return null;
  try {
    const u = new URL(s.trim());
    if (u.protocol !== "https:") return "Use an https:// link";
    const host = u.hostname.replace(/^www\./, "");
    if (domain && host !== domain && !host.endsWith(`.${domain}`)) return "Must be on the company's own website";
    return null;
  } catch { return "Use a full link, like https://acme.com/careers"; }
};

// Best guess at the company's name from its site ("Zoho | Cloud Software…" → "Zoho").
const guessName = (site: Site) => (site.siteName ?? site.title ?? "").split(/\s[|–—:·-]\s|\s\|\s?/)[0]!.trim().slice(0, 80);

function Field({ label, hint, error, children, id }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; id: string }) {
  return <div className="min-w-0">
    <label htmlFor={id} className="text-sm font-bold">{label}</label>
    <div className="mt-1.5">{children}</div>
    <AnimatePresence initial={false}>{error
      ? <motion.p key="e" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-1 flex items-center gap-1 text-xs font-semibold text-flag-red"><AlertCircle className="size-3.5 shrink-0" />{error}</motion.p>
      : hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}</AnimatePresence>
  </div>;
}

const blank = { website: "", name: "", about: "", industry: "", size: "", hqCity: "", founded: "", careersUrl: "", confirm: false };

// A draft kept while a signed-out visitor joins; the form reopens with it afterwards
// (PendingCompanyListing below, mounted on the dashboard).
const PENDING_KEY = "ghosted.pendingCompany";
type Draft = typeof blank;
const readPending = (): Draft | null => { try { const d = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "null") as Draft | null; return d && typeof d.website === "string" ? { ...blank, ...d, confirm: false } : null; } catch { return null; } };
const clearPending = () => { try { localStorage.removeItem(PENDING_KEY); } catch { /* storage blocked */ } };

// `requestName`: opened from an empty search ("Not listed yet? Request it"), shown in the title.
// `initial`: a saved draft to start from.
export function ListCompanyDialog({ open, onOpenChange, onListed, requestName, initial }: { open: boolean; onOpenChange: (v: boolean) => void; onListed?: (c: Company) => void; requestName?: string; initial?: Draft | null }) {
  const qc = useQueryClient();
  const { signedOut } = useMe();
  const shield = useHumanCheck(open && !signedOut); // signed out, the final step is joining instead
  const [f, setF] = useState(blank);
  const [requested, setRequested] = useState(false);
  const [tooNew, setTooNew] = useState<string | null>(null);
  // A restored draft counts as typed by the person, so auto-fill never overwrites it.
  useEffect(() => {
    if (!open || !initial) return;
    setF(initial);
    for (const [k, v] of Object.entries(initial)) if (k !== "website" && v) edited.current.add(k);
  }, [open, initial]);
  const [check, setCheck] = useState<Check>({ state: "idle" });
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [serverErrors, setServerErrors] = useState<Partial<Record<keyof typeof blank, string>>>({});
  const [busy, setBusy] = useState(false);
  const tone = useTone();
  // Fields the person has typed in themselves are never overwritten by auto-fill.
  const edited = useRef<Set<string>>(new Set());
  const [autofilled, setAutofilled] = useState<{ keys: Set<FillKey>; facts: Facts } | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const set = (k: keyof typeof blank) => (v: string | boolean) => { setF((s) => ({ ...s, [k]: v })); setServerErrors((e) => { const n = { ...e }; delete n[k]; return n; }); };
  const edit = (k: keyof typeof blank) => (v: string | boolean) => { edited.current.add(k); setAutofilled((a) => a && { ...a, keys: new Set([...a.keys].filter((x) => x !== k)) }); set(k)(v); };

  // Fill every field the person hasn't touched with what the server found.
  const applyFacts = (facts: Facts, site: Site) => {
    const found: Record<FillKey, string | undefined> = {
      name: facts.name ?? guessName(site) ?? undefined,
      about: facts.about ?? undefined,
      industry: facts.industry ?? undefined,
      size: facts.size ?? undefined,
      hqCity: facts.hqCity ?? undefined,
      founded: facts.founded ? String(facts.founded) : undefined,
      careersUrl: facts.careersUrl ?? undefined,
    };
    const keys = new Set<FillKey>();
    setF((s) => {
      const next = { ...s };
      for (const [k, v] of Object.entries(found) as [FillKey, string | undefined][]) {
        if (v && !edited.current.has(k)) { next[k] = v; keys.add(k); }
      }
      return next;
    });
    setAutofilled({ keys, facts });
  };
  const touch = (k: string) => setTouched((t) => new Set(t).add(k));

  // Check the website shortly after typing stops.
  useEffect(() => {
    const w = f.website.trim();
    if (!w) return setCheck({ state: "idle" });
    if (!looksLikeDomain(w)) return setCheck({ state: "error", message: "Enter the company's website, like acme.com" });
    setCheck({ state: "checking" });
    let stale = false;
    const t = window.setTimeout(async () => {
      if (!apiEnabled) {
        // Preview: no server to check with, so accept any domain and use a public icon service.
        const domain = w.replace(/^https?:\/\//, "").split("/")[0]!.replace(/^www\./, "").toLowerCase();
        const demoSite = { homepage: `https://${domain}/`, domain, title: null, siteName: null, description: null, iconUrl: `https://icons.duckduckgo.com/ip3/${domain}.ico` };
        if (!stale) { setCheck({ state: "ok", site: demoSite }); applyFacts({ name: domain.split(".")[0]!.replace(/^./, (c) => c.toUpperCase()), about: null, aboutSource: null, industry: null, size: null, hqCity: null, founded: null, careersUrl: null, filled: ["name"], sources: [] }, demoSite); }
        return;
      }
      try {
        const r = await api<{ site: Site; existing: CompanyDto | null; facts?: Facts; quota?: Quota }>(`/v1/companies/preview?website=${encodeURIComponent(w)}`, { timeoutMs: 25_000 });
        if (stale) return;
        if (r.quota) setQuota(r.quota);
        setCheck(r.existing ? { state: "exists", company: r.existing, site: r.site } : { state: "ok", site: r.site });
        if (!r.existing) applyFacts(r.facts ?? { name: null, about: null, aboutSource: null, industry: null, size: null, hqCity: null, founded: null, careersUrl: null, filled: [], sources: [] }, r.site);
      } catch (err) {
        if (!stale) setCheck({ state: "error", message: err instanceof ApiRequestError ? err.message : "We couldn't check that website. Try again." });
      }
    }, 700);
    return () => { stale = true; window.clearTimeout(t); };
  }, [f.website]);

  const site = check.state === "ok" ? check.site : null;
  const errors = useMemo(() => ({
    name: serverErrors.name ?? nameError(f.name),
    about: serverErrors.about ?? aboutError(f.about),
    industry: serverErrors.industry ?? (f.industry ? null : "Pick an industry"),
    size: serverErrors.size ?? (f.size ? null : "Pick a size"),
    hqCity: serverErrors.hqCity ?? cityError(f.hqCity),
    founded: serverErrors.founded ?? foundedError(f.founded),
    careersUrl: serverErrors.careersUrl ?? careersError(f.careersUrl, site?.domain),
    confirm: f.confirm ? null : "Please confirm the details are accurate",
  }), [f, serverErrors, site?.domain]);
  const show = (k: keyof typeof errors) => (touched.has(k) || touched.has("submit") ? errors[k] : null);
  const valid = !!site && Object.values(errors).every((e) => !e);

  const reset = () => { setF(blank); setCheck({ state: "idle" }); setTouched(new Set()); setServerErrors({}); edited.current = new Set(); setAutofilled(null); setQuota(null); setRequested(false); setTooNew(null); };
  const limitReached = quota?.remaining === 0;
  // Can't list it right now (limit reached or a brand-new account): ask for it instead.
  const blocked = limitReached || !!tooNew;

  // How much auto-fill managed, in the person's tone.
  const fillNote = (() => {
    if (!autofilled || !site) return null;
    const n = autofilled.keys.size;
    const from = autofilled.facts.sources.map((s) => SOURCE_NAME[s]).filter((v, i, a) => a.indexOf(v) === i).join(" and ");
    if (n >= 3) return { tone: "ok" as const, text: voice(tone, `Did the homework for you: filled ${n} fields from ${from}. Give them a once-over, the internet isn't always right.`, `We filled ${n} fields using ${from}. Please check them before listing.`) };
    if (n >= 1) return { tone: "partial" as const, text: voice(tone, "Found a few crumbs, but this company keeps its cards close. Fill in the rest, we'll wait.", "We found a few details. Please fill in the remaining fields.") };
    return { tone: "none" as const, text: voice(tone, "This website plays hard to get and told us nothing. Looks like you'll have to spill the details yourself.", "We couldn't find any details about this company automatically. Please fill in the fields below.") };
  })();
  // "Auto-filled" marker for a field whose value came from auto-fill and hasn't been changed.
  const auto = (k: FillKey) => autofilled?.keys.has(k) ? <span className="ml-1.5 inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-1.5 py-px align-middle text-[10px] font-bold uppercase text-primary"><Wand2 className="size-2.5" />Auto-filled</span> : null;
  const close = (v: boolean) => { onOpenChange(v); if (!v) reset(); };

  // Signed out: everything up to here works; listing needs an account. The draft waits for them.
  const joinToList = () => {
    try { localStorage.setItem(PENDING_KEY, JSON.stringify({ ...f, confirm: false })); } catch { /* storage blocked */ }
    close(false);
    askToJoin();
  };

  const request = async () => {
    if (!site) return;
    setBusy(true);
    try {
      const r = await api<{ requested: boolean; existing?: CompanyDto }>("/v1/companies/requests", { method: "POST", body: { website: site.homepage, ...(f.name.trim() && { name: f.name.trim() }) } });
      if (r.existing) { setCheck({ state: "exists", company: r.existing, site }); return; }
      setRequested(true);
      toast.success(voice(tone, `Requested. We'll ping you the second ${f.name.trim() || site.domain} shows up.`, `Requested. We'll notify you when ${f.name.trim() || site.domain} is listed.`));
    } catch (err) { toast.error(err instanceof ApiRequestError ? err.message : "Couldn't save the request. Try again."); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    touch("submit");
    if (!valid || !site) return void toast.error("A few things need fixing first.");
    if (signedOut) return joinToList();
    if (!apiEnabled) { toast.success(`${f.name} listed. (Preview mode: it isn't saved.)`); return close(false); }
    setBusy(true);
    let escalated = false;
    try {
      const r = await api<{ company: CompanyDto }>("/v1/companies", { method: "POST", body: {
        name: f.name.trim(), website: site.homepage, about: f.about.trim(), industry: f.industry, size: f.size, hqCity: f.hqCity.trim(),
        ...(f.founded && { founded: Number(f.founded) }), ...(f.careersUrl.trim() && { careersUrl: f.careersUrl.trim() }),
        confirm: true, captchaToken: shield.getToken(),
      } });
      toast.success(`${r.company.name} is listed. Thanks for keeping it real.`);
      void qc.invalidateQueries({ queryKey: ["companies"] });
      liveNudge();
      onListed?.(companyFromApi(r.company));
      close(false);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.code === "captcha_escalate") { escalated = true; shield.escalate(); }
        if (err.code === "listing_limit") setQuota((q) => ({ ...(q ?? { dayLeft: 0, weekLeft: 0, limits: { day: 3, week: 10 }, resetsAt: null }), remaining: 0, message: err.message }));
        if (err.code === "account_too_new") setTooNew(err.message);
        const fields = (err.fields ?? {}) as Partial<Record<keyof typeof blank, string>>;
        setServerErrors(fields);
        if (fields.website) setCheck({ state: "error", message: fields.website });
        toast.error(err.message);
      } else toast.error("Couldn't list the company right now. Try again.");
    } finally { if (!escalated) shield.reset(); setBusy(false); }
  };


  return <Dialog open={open} onOpenChange={close}>
    <DialogContent className={cn(popup, "max-w-2xl")}>
      <div className={popupBody} data-lenis-prevent>
        <DialogHeader className="pr-8 text-left">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg border-2 border-foreground bg-primary text-primary-foreground sm:size-12"><Building2 className="size-5" /></span>
            <div className="min-w-0"><DialogTitle className="font-display text-xl sm:text-2xl">{requestName ? `Request “${requestName}”` : "List a company"}</DialogTitle><DialogDescription>{requestName ? "Not listed yet. Add its website and we'll fill in what we can. Real companies only." : "Real companies only. We check the website before anything goes live."}</DialogDescription></div>
          </div>
        </DialogHeader>

        <div className="mt-6 space-y-5">
          {/* Step 1: the website, checked live. */}
          <Field id="lc-website" label={<>Company website <span className="text-flag-red">*</span></>} hint="The company's own homepage, like acme.com. Not a profile or page on another site.">
            <div className="relative">
              <Globe className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="lc-website" autoFocus inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={f.website} onChange={(e) => set("website")(e.target.value)} placeholder="acme.com" maxLength={200} className="border-2 border-foreground pl-9 pr-10" aria-invalid={check.state === "error"} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2">{check.state === "checking" ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : check.state === "ok" ? <CheckCircle2 className="size-4 text-flag-green" /> : check.state === "error" || check.state === "exists" ? <AlertCircle className="size-4 text-flag-red" /> : null}</span>
            </div>
          </Field>

          <AnimatePresence mode="wait" initial={false}>
            {check.state === "checking" && <motion.p key="checking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="-mt-2 text-sm text-muted-foreground">Checking the website and fetching its icon…</motion.p>}
            {check.state === "error" && <motion.p key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="-mt-2 flex items-start gap-1.5 rounded-lg border-2 border-flag-red bg-flag-red/10 p-3 text-sm font-semibold text-flag-red"><AlertCircle className="mt-0.5 size-4 shrink-0" />{check.message}</motion.p>}
            {check.state === "exists" && <motion.div key="exists" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="-mt-2 flex items-center gap-3 rounded-lg border-2 border-foreground bg-accent p-3">
              <CompanyMark company={companyFromApi(check.company)} size="sm" />
              <p className="min-w-0 flex-1 text-sm"><strong>{check.company.name}</strong> is already listed with this website. Share your story there instead.</p>
              {onListed && <Button size="sm" variant="outline" onClick={() => { onListed(companyFromApi(check.company)); close(false); }}>Open</Button>}
            </motion.div>}
            {site && <motion.div key="ok" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="-mt-2 flex items-center gap-3 rounded-lg border-2 border-flag-green bg-flag-green/10 p-3">
              <CompanyMark company={{ name: f.name || site.domain, initial: (f.name || site.domain).charAt(0).toUpperCase(), color: "bg-logo-violet", logoUrl: site.iconUrl }} size="md" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-bold"><CheckCircle2 className="size-4 shrink-0 text-flag-green" />Website checked</p>
                <a href={site.homepage} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-full items-center gap-1 truncate text-xs font-semibold text-primary hover:underline">{site.domain}<ExternalLink className="size-3 shrink-0" /></a>
                {site.title && <p className="truncate text-xs text-muted-foreground">{site.title}</p>}
              </div>
            </motion.div>}
          </AnimatePresence>

          {/* At the listing limit: say so up front (with when it frees up), before any typing. */}
          {blocked && <div className="-mt-2 rounded-lg border-2 border-flag-red bg-flag-red/10 p-3 text-sm font-semibold">
            <p className="flex items-start gap-2"><AlertCircle className="mt-0.5 size-4 shrink-0 text-flag-red" />{tooNew ?? (quota?.message ? voice(tone, `${quota.message} Even we have to pace ourselves.`, quota.message) : "")}</p>
            {/* Can't list it yourself right now: request it, and hear when anyone lists it. */}
            {site && (requested
              ? <p className="mt-2 flex items-center gap-1.5 text-flag-green"><CheckCircle2 className="size-4" />Requested. You'll get a notification when it's listed.</p>
              : <Button size="sm" variant="outline" className="mt-2 min-h-10 bg-card" disabled={busy} onClick={() => void request()}><Bell />Request it instead</Button>)}
          </div>}

          {/* How much auto-fill found, in the person's tone (sassy or calm). */}
          {fillNote && <motion.p key={fillNote.text} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={cn("-mt-2 flex items-start gap-2 rounded-lg border-2 p-3 text-sm font-semibold", fillNote.tone === "ok" ? "border-primary bg-primary/10 text-foreground" : "border-flag-amber bg-flag-amber/15 text-foreground")}>
            {fillNote.tone === "ok" ? <Wand2 className="mt-0.5 size-4 shrink-0 text-primary" /> : <AlertCircle className="mt-0.5 size-4 shrink-0 text-flag-amber" />}{fillNote.text}
          </motion.p>}

          {/* Step 2: details, once the website passes. */}
          <fieldset disabled={!site} className={cn("space-y-5 transition-opacity", !site && "pointer-events-none opacity-40")}>
            <legend className="sr-only">Company details</legend>
            <Field id="lc-name" label={<>Company name <span className="text-flag-red">*</span>{auto("name")}</>} hint="As it appears on its website. It has to match the site." error={show("name")}>
              <Input id="lc-name" value={f.name} onChange={(e) => edit("name")(e.target.value)} onBlur={() => touch("name")} maxLength={80} placeholder="Acme Technologies" className="border-2 border-foreground" aria-invalid={!!show("name")} />
            </Field>

            <Field id="lc-about" label={<>What does the company do? <span className="text-flag-red">*</span>{auto("about")}</>} error={show("about")}
              hint={<span className="flex items-center justify-between gap-2"><span>{autofilled?.keys.has("about") && autofilled.facts.aboutSource === "wikipedia" ? "Started from Wikipedia. Trim or reword it so it's in your own words." : "In your own words: product, customers, what it's known for. 80–800 characters."}</span><span className="shrink-0 tabular-nums">{f.about.trim().length}/800</span></span>}>
              <Textarea id="lc-about" value={f.about} onChange={(e) => edit("about")(e.target.value)} onBlur={() => touch("about")} maxLength={800} rows={4} placeholder="Acme builds payroll software for small businesses in India. Its main product handles salaries, compliance and payslips, and it has offices in Pune and Bengaluru." className="border-2 border-foreground" aria-invalid={!!show("about")} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="lc-industry" label={<>Industry <span className="text-flag-red">*</span>{auto("industry")}</>} error={show("industry")}>
                <Select value={f.industry} onValueChange={(v) => { edit("industry")(v); touch("industry"); }}>
                  <SelectTrigger id="lc-industry" aria-invalid={!!show("industry")}><SelectValue placeholder="Choose industry" /></SelectTrigger>
                  <SelectContent>{Object.entries(INDUSTRY_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field id="lc-size" label={<>Company size <span className="text-flag-red">*</span>{auto("size")}</>} error={show("size")}>
                <Select value={f.size} onValueChange={(v) => { edit("size")(v); touch("size"); }}>
                  <SelectTrigger id="lc-size" aria-invalid={!!show("size")}><SelectValue placeholder="Number of employees" /></SelectTrigger>
                  <SelectContent>{SIZES.map((s) => <SelectItem key={s} value={s}>{s} people</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field id="lc-city" label={<>Headquarters city <span className="text-flag-red">*</span>{auto("hqCity")}</>} error={show("hqCity")}>
                <Input id="lc-city" value={f.hqCity} onChange={(e) => edit("hqCity")(e.target.value)} onBlur={() => touch("hqCity")} maxLength={60} placeholder="Bengaluru" className="border-2 border-foreground" aria-invalid={!!show("hqCity")} />
              </Field>
              <Field id="lc-founded" label={<>Founded <span className="font-normal text-muted-foreground">(optional)</span>{auto("founded")}</>} error={show("founded")}>
                <Input id="lc-founded" inputMode="numeric" value={f.founded} onChange={(e) => edit("founded")(e.target.value.replace(/\D/g, "").slice(0, 4))} onBlur={() => touch("founded")} placeholder="2015" className="border-2 border-foreground" aria-invalid={!!show("founded")} />
              </Field>
            </div>

            <Field id="lc-careers" label={<>Careers page <span className="font-normal text-muted-foreground">(optional)</span>{auto("careersUrl")}</>} hint="Must be on the same website." error={show("careersUrl")}>
              <Input id="lc-careers" inputMode="url" autoCapitalize="none" value={f.careersUrl} onChange={(e) => edit("careersUrl")(e.target.value)} onBlur={() => touch("careersUrl")} maxLength={300} placeholder={site ? `https://${site.domain}/careers` : "https://acme.com/careers"} className="border-2 border-foreground" aria-invalid={!!show("careersUrl")} />
            </Field>

            {/* Step 3: confirm, prove you're human, list. */}
            {/* Same checkbox as the sign-up terms. */}
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <Checkbox checked={f.confirm} onCheckedChange={(v) => { set("confirm")(v === true); touch("confirm"); }} className="mt-0.5 border-2 border-foreground" aria-required="true" />
              <span>I confirm this is a real company, the website is its own, and the details are accurate. Fake or misleading listings are removed and can get accounts suspended.</span>
            </label>
            {!signedOut && <HumanCheck shield={shield} />}
          </fieldset>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">{signedOut ? "Listing needs a free account. Your details are kept while you join." : quota && !limitReached
              ? <>You can list <strong className="text-foreground">{quota.remaining} more</strong> {quota.remaining === 1 ? "company" : "companies"} today ({quota.weekLeft} left this week).</>
              : `Up to ${quota?.limits.day ?? 3} listings a day and ${quota?.limits.week ?? 10} a week.`} Listings can be reported and are reviewed by moderators.</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
              {signedOut
                ? <Button disabled={!valid} onClick={() => void submit()}><Building2 />Join free to list it</Button>
                : <Button disabled={!site || !f.confirm || busy || blocked || (apiEnabled && shield.status !== "done")} onClick={() => void submit()}>{busy ? <Loader2 className="animate-spin" /> : !f.confirm || blocked ? null : <Building2 />}{busy ? "Listing…" : blocked ? "Can't list right now" : site && !f.confirm ? "Tick the box above to continue" : "List company"}</Button>}
            </div>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}

// After someone joins from "Request it", their company draft reopens here (mounted on the dashboard).
export function PendingCompanyListing({ onListed }: { onListed?: (c: Company) => void }) {
  const { signedIn } = useMe();
  const [draft, setDraft] = useState<Draft | null>(null);
  useEffect(() => { if (signedIn) { const d = readPending(); if (d) { clearPending(); setDraft(d); } } }, [signedIn]);
  return <ListCompanyDialog open={!!draft} onOpenChange={(v) => { if (!v) setDraft(null); }} initial={draft} {...(onListed && { onListed })} />;
}
