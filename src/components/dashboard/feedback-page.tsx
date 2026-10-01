// The /feedback page: tell us something (bug, feature, feedback), see what happened to it, build
// with us (open source), and back us (donations through Razorpay).
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight, Bug, Check, CircleDot, Code2, Copy, ExternalLink, GitFork, Github, Heart, HeartHandshake, Lightbulb, Loader2, Lock, MessageSquareHeart, Monitor, Send,
  Server, ShieldCheck, Sparkles, Star, Users, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ghosted";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SlidingPill, usePill } from "@/components/sliding-pill";
import { ApiRequestError, apiEnabled } from "@/lib/api";
import { entity } from "@/content/legal";
import { deviceInfo, donate, submitFeedback, useDonations, useMyFeedback, useRefreshFeedback, type FeedbackKind, type MyItem } from "@/lib/feedback";
import { GOOFY_AVATAR, speak } from "@/lib/goofy";
import { displayName, useMe, useTone, voice } from "@/lib/session";
import { cn } from "@/lib/utils";
import { card } from "./ui-kit";
import { ThankYouWall } from "./thank-you-wall";
import { Link } from "@tanstack/react-router";

type FormKind = Exclude<FeedbackKind, "pulse">;
const KINDS: { id: FormKind; label: string; icon: LucideIcon; blurb: string }[] = [
  { id: "bug", label: "Report a bug", icon: Bug, blurb: "Something broke or looks wrong" },
  { id: "feature", label: "Suggest a feature", icon: Lightbulb, blurb: "An idea that would help candidates" },
  { id: "feedback", label: "Share feedback", icon: MessageSquareHeart, blurb: "What you love, or what grates" },
];
const AREAS: [string, string][] = [["feed", "Home feed"], ["stories", "Stories and sharing"], ["chitchats", "Chitchats"], ["companies", "Companies"], ["waiting_room", "Waiting Room"], ["insights", "Insights"], ["search", "Search"], ["profile", "Profiles"], ["settings", "Settings"], ["sign_in", "Signing in"], ["goofy", "Goofy (AutoMod)"], ["other", "Somewhere else"]];
const SEVERITY: { id: "minor" | "annoying" | "blocking"; label: string; blurb: string }[] = [
  { id: "minor", label: "Minor", blurb: "Looks off, still works" }, { id: "annoying", label: "Annoying", blurb: "Gets in the way" }, { id: "blocking", label: "Blocking", blurb: "Can't do what I came for" },
];
const IMPORTANCE = ["Nice to have", "I'd use it every week", "I'd tell friends about it"];
const STATUS: Record<MyItem["status"], [string, string]> = {
  new: ["Received", "bg-muted"], seen: ["Read by the team", "bg-accent"], planned: ["Planned", "bg-primary text-primary-foreground"], in_progress: ["In progress", "bg-primary text-primary-foreground"],
  done: ["Done", "bg-flag-green text-primary-foreground"], wont_do: ["Not for now", "bg-muted"],
};
const label = "mb-1.5 block text-sm font-bold";
const field = "rounded-lg border-2 border-foreground bg-background";

function SectionHead({ id, eyebrow, title, copy }: { id: string; eyebrow: string; title: string; copy?: string }) {
  return <div id={id} className="scroll-mt-24"><p className="text-xs font-bold uppercase text-primary">{eyebrow}</p><h2 className="mt-1 text-2xl font-bold sm:text-3xl">{title}</h2>{copy && <p className="mt-1 max-w-2xl text-muted-foreground">{copy}</p>}</div>;
}

// ---------- hero ----------

export function FeedbackHero() {
  const tone = useTone();
  const paths: { href: string; icon: LucideIcon; title: string; copy: string; tint: string }[] = [
    { href: "#tell", icon: MessageSquareHeart, title: "Tell us something", copy: "Bugs, ideas, rants. Every one is read.", tint: "bg-accent" },
    { href: "#build", icon: Code2, title: "Build with us", copy: "Ghosted is open source. Pick an issue.", tint: "bg-card" },
    { href: "#back", icon: Heart, title: "Back the mission", copy: "Keep it free, ad-free and independent.", tint: "bg-primary text-primary-foreground" },
  ];
  return <section className={cn(card, "relative overflow-hidden p-6 sm:p-8")}>
    <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full border-2 border-dashed border-primary/30 hero-orbit" />
    <p className="text-xs font-bold uppercase text-primary">Make Ghosted better</p>
    <h1 className="mt-2 max-w-3xl font-display text-4xl font-bold leading-tight sm:text-5xl">{voice(tone, "Ghosted is built by the people who got ghosted.", "Ghosted is shaped by the people who use it.")}</h1>
    <p className="mt-3 max-w-2xl text-lg text-muted-foreground">Tell us what's broken, what's missing and what you love. Help build it. Or chip in so it stays free for every candidate.</p>
    <div className="mt-6 grid gap-3 md:grid-cols-3">{paths.map((p, i) => <motion.a key={p.href} href={p.href} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i }}
      className={cn("card-lift group flex items-start gap-3 rounded-xl border-2 border-foreground p-4 shadow-hard-sm", p.tint)}>
      <span className="grid size-10 shrink-0 place-items-center rounded-lg border-2 border-foreground bg-background text-foreground"><p.icon className="size-5" /></span>
      <span className="min-w-0"><span className="flex items-center gap-1 font-bold">{p.title}<ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></span><span className="mt-0.5 block text-sm opacity-80">{p.copy}</span></span>
    </motion.a>)}</div>
  </section>;
}

// ---------- tell us ----------

export function FeedbackForm({ initialKind = "feedback" }: { initialKind?: FormKind }) {
  const tone = useTone();
  const refresh = useRefreshFeedback();
  const [kind, setKind] = useState<FormKind>(initialKind);
  useEffect(() => setKind(initialKind), [initialKind]);
  const pill = usePill(kind);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [area, setArea] = useState("");
  const [severity, setSeverity] = useState<"minor" | "annoying" | "blocking">("annoying");
  const [steps, setSteps] = useState("");
  const [importance, setImportance] = useState(IMPORTANCE[1]!);
  const [rating, setRating] = useState(0);
  const [withDevice, setWithDevice] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<FormKind | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const reset = () => { setTitle(""); setBody(""); setSteps(""); setRating(0); setErrors({}); };
  const submit = async () => {
    const e: Record<string, string> = {};
    if (kind !== "feedback" && title.trim().length < 3) e["title"] = "Give it a short title";
    if (body.trim().length < 10) e["body"] = "Tell us a little more (at least 10 characters)";
    if (kind === "feedback" && !rating) e["rating"] = "Pick a rating";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await submitFeedback({
        kind, title: kind === "feedback" ? (title.trim() || `Feedback: ${rating}/5`) : title.trim(),
        body: kind === "feature" ? `${body.trim()}\n\nImportance: ${importance}` : body.trim(),
        ...(area && { area }), ...(kind === "bug" && { severity, ...(steps.trim() && { steps: steps.trim() }), ...(withDevice && { device: deviceInfo() }) }),
        ...(kind === "feedback" && { rating }),
      });
      setSent(kind); reset(); refresh();
    } catch (err) {
      if (err instanceof ApiRequestError && err.message.startsWith("Goofy: ")) speak(err.message, "error");
      else toast.error(err instanceof ApiRequestError ? (err.fields ? Object.values(err.fields)[0] ?? err.message : err.message) : "Couldn't send that. Try again.");
    } finally { setBusy(false); }
  };

  return <section id="tell" className="scroll-mt-24 space-y-4">
    <SectionHead id="tell-head" eyebrow="Tell us something" title="Bugs, ideas and honest opinions" copy="Every submission is read by a human on the team. You'll see its status below, and our reply if we have one." />
    <div className={cn(card, "overflow-hidden")}>
      {/* Which kind: three cards with one sliding highlight. */}
      <div ref={pill.ref} role="tablist" aria-label="What would you like to send?" className="relative grid gap-2 border-b-2 border-foreground p-3 sm:grid-cols-3">
        <SlidingPill pill={pill} className="rounded-lg border-2 border-foreground bg-primary shadow-hard-sm" />
        {KINDS.map((k) => <button key={k.id} data-pill={k.id} type="button" role="tab" aria-selected={kind === k.id} onClick={() => { setKind(k.id); setSent(null); setErrors({}); }}
          className={cn("relative flex items-center gap-3 rounded-lg border-2 border-transparent p-3 text-left transition-colors", kind === k.id ? "text-primary-foreground" : "hover:bg-muted")}>
          <k.icon className="size-5 shrink-0" /><span className="min-w-0"><span className="block font-bold">{k.label}</span><span className="block truncate text-xs opacity-80">{k.blurb}</span></span>
        </button>)}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {sent ? <motion.div key="sent" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="grid place-items-center px-6 py-12 text-center">
          <img src={GOOFY_AVATAR} alt="" className="size-16 rounded-full border-2 border-foreground object-cover" />
          <p className="mt-4 font-display text-2xl font-bold">{sent === "bug" ? voice(tone, "Bug logged. It's on borrowed time.", "Thanks, your bug report is in.") : sent === "feature" ? voice(tone, "Idea received. We like where your head's at.", "Thanks, your idea is in.") : voice(tone, "Noted, and genuinely appreciated.", "Thank you for your feedback.")}</p>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">It's in “Your submissions” below. When the team picks it up, its status changes there.</p>
          <Button className="mt-5" variant="outline" onClick={() => setSent(null)}>Send another</Button>
        </motion.div> : <motion.div key={kind} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }} className="space-y-4 p-4 sm:p-6">
          {kind === "feedback" && <div>
            <span className={label}>How's Ghosted treating you?</span>
            <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Rating">{[1, 2, 3, 4, 5].map((n) => <motion.button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} of 5`} whileTap={{ scale: 0.85 }} onClick={() => setRating(n)} className="p-1">
              <Star className={cn("size-8 transition-colors", n <= rating ? "fill-flag-amber text-foreground" : "text-muted-foreground")} strokeWidth={n <= rating ? 1.5 : 2} />
            </motion.button>)}<span className="ml-2 text-sm font-semibold text-muted-foreground">{["", "Rough", "Meh", "Okay", "Good", "Love it"][rating]}</span></div>
            {errors["rating"] && <p className="mt-1 text-xs font-semibold text-flag-red">{errors["rating"]}</p>}
          </div>}

          <div className={cn("grid gap-4", kind !== "feedback" && "sm:grid-cols-[1fr_14rem]")}>
            {kind !== "feedback" && <label className="block"><span className={label}>{kind === "bug" ? "What went wrong?" : "Your idea, in a line"}</span>
              <Input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 120))} placeholder={kind === "bug" ? "The share button does nothing on my phone" : "Let me compare two companies side by side"} className={cn(field, "h-11")} aria-invalid={!!errors["title"]} />
              {errors["title"] && <span className="mt-1 block text-xs font-semibold text-flag-red">{errors["title"]}</span>}
            </label>}
            <div><span className={label}>Where? <span className="font-normal text-muted-foreground">(optional)</span></span>
              <Select value={area} onValueChange={setArea}><SelectTrigger aria-label="Part of the app"><SelectValue placeholder="Any part of Ghosted" /></SelectTrigger>
                <SelectContent>{AREAS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>

          {kind === "bug" && <div><span className={label}>How bad is it?</span>
            <div className="grid gap-2 sm:grid-cols-3">{SEVERITY.map((s) => <button key={s.id} type="button" aria-pressed={severity === s.id} onClick={() => setSeverity(s.id)}
              className={cn("rounded-lg border-2 px-3 py-2 text-left transition-colors", severity === s.id ? "border-foreground bg-accent" : "border-foreground/20 hover:border-foreground")}>
              <span className="flex items-center gap-1.5 text-sm font-bold">{severity === s.id && <Check className="size-4" />}{s.label}</span><span className="text-xs text-muted-foreground">{s.blurb}</span>
            </button>)}</div>
          </div>}

          <label className="block"><span className={label}>{kind === "bug" ? "What happened, and what did you expect?" : kind === "feature" ? "What problem would it solve for you?" : "Tell us more"}</span>
            <Textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, 4000))} rows={5} className={field} aria-invalid={!!errors["body"]}
              placeholder={kind === "bug" ? "I tapped Share, nothing happened. I expected the share sheet to open." : kind === "feature" ? "Before interviews I flip between two company pages to compare them…" : "The Waiting Room is great, but I wish…"} />
            <span className="mt-1 flex justify-between text-xs"><span className="font-semibold text-flag-red">{errors["body"]}</span><span className="text-muted-foreground">{body.length}/4000</span></span>
          </label>

          {kind === "bug" && <label className="block"><span className={label}>Steps to reproduce <span className="font-normal text-muted-foreground">(optional, but gold)</span></span>
            <Textarea value={steps} onChange={(e) => setSteps(e.target.value.slice(0, 2000))} rows={3} className={field} placeholder={"1. Open a story\n2. Tap Share\n3. Nothing happens"} />
          </label>}

          {kind === "feature" && <div><span className={label}>How much would it matter to you?</span>
            <div className="flex flex-wrap gap-2">{IMPORTANCE.map((i) => <button key={i} type="button" aria-pressed={importance === i} onClick={() => setImportance(i)}
              className={cn("rounded-full border-2 px-3 py-1.5 text-xs font-bold transition-colors", importance === i ? "border-foreground bg-primary text-primary-foreground" : "border-foreground/25 hover:border-foreground")}>{i}</button>)}</div>
          </div>}

          {kind === "bug" && <label className="flex cursor-pointer items-start gap-3 rounded-lg border-2 border-foreground/15 p-3">
            <input type="checkbox" checked={withDevice} onChange={(e) => setWithDevice(e.target.checked)} className="mt-0.5 size-4 accent-[var(--primary)]" />
            <span className="text-sm"><span className="flex items-center gap-1.5 font-bold"><Monitor className="size-4" />Include my device details</span><span className="text-muted-foreground">Browser, screen size, theme and this page. Never your IP or anything that identifies you.</span></span>
          </label>}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-foreground/10 pt-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="size-3.5" />Only the Ghosted team sees this.</p>
            <Button onClick={() => void submit()} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Send />}{kind === "bug" ? "Send bug report" : kind === "feature" ? "Send idea" : "Send feedback"}</Button>
          </div>
        </motion.div>}
      </AnimatePresence>
    </div>
  </section>;
}

export function MySubmissions() {
  const { items, loading } = useMyFeedback();
  if (loading) return <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>;
  if (!items.length) return null;
  const KIND_ICON: Record<string, LucideIcon> = { bug: Bug, feature: Lightbulb, feedback: MessageSquareHeart };
  return <section className="space-y-3">
    <h3 className="font-display text-xl font-bold">Your submissions</h3>
    <ul className={cn(card, "divide-y-2 divide-foreground/10 overflow-hidden")}>{items.map((it) => {
      const Icon = KIND_ICON[it.kind] ?? CircleDot;
      const [st, tone] = STATUS[it.status];
      return <li key={it.publicId} className="p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border-2 border-foreground bg-card"><Icon className="size-4" /></span>
          <div className="min-w-0 flex-1"><p className="truncate font-semibold">{it.title ?? "Feedback"}</p><p className="text-xs text-muted-foreground">{new Date(it.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}{it.area && ` · ${AREAS.find(([v]) => v === it.area)?.[1] ?? it.area}`}</p></div>
          <span className={cn("shrink-0 rounded-full border-2 border-foreground px-2 py-0.5 text-[11px] font-bold", tone)}>{st}</span>
        </div>
        {it.reply && <p className="mt-3 rounded-lg bg-muted p-3 text-sm"><span className="font-bold">The team: </span>{it.reply}</p>}
      </li>;
    })}</ul>
  </section>;
}

// ---------- build with us ----------

function CopyLine({ cmd }: { cmd: string }) {
  const [done, setDone] = useState(false);
  return <div className="flex items-center gap-2 rounded-lg bg-[#1b1424] px-3 py-2 font-mono text-xs text-[#f6efe0]">
    <span className="select-none text-[#9b6bff]">$</span><code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap">{cmd}</code>
    <button type="button" onClick={() => { void navigator.clipboard?.writeText(cmd).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }} aria-label="Copy command" className="shrink-0 opacity-70 hover:opacity-100">{done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}</button>
  </div>;
}

export function BuildWithUs() {
  const repo = entity.github.replace(/\/$/, "");
  const links: { href: string; icon: LucideIcon; label: string; copy: string }[] = [
    { href: `${repo}/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22`, icon: Sparkles, label: "Good first issues", copy: "Small, well-scoped tasks to start with" },
    { href: `${repo}/issues/new`, icon: Bug, label: "Open an issue", copy: "Bugs and ideas, in public" },
    { href: `${repo}/fork`, icon: GitFork, label: "Fork the repo", copy: "Send a pull request" },
    { href: repo, icon: Star, label: "Star it on GitHub", copy: "Helps other people find it" },
  ];
  return <section id="build" className="scroll-mt-24 space-y-4">
    <SectionHead id="build-head" eyebrow="Build with us" title="Ghosted is open source" copy="Every line is public, so anyone can check how identities are protected, and anyone can make it better. Developers, designers and writers are all welcome." />
    <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
      <div className={cn(card, "p-5")}>
        <a href={repo} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg border-2 border-foreground bg-foreground p-3 text-background transition-transform hover:-translate-y-0.5">
          <Github className="size-7 shrink-0" /><span className="min-w-0"><span className="block font-bold">{repo.replace("https://github.com/", "")}</span><span className="block text-xs opacity-70">View the code, the issues and the roadmap</span></span><ExternalLink className="ml-auto size-4 shrink-0" />
        </a>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">{links.map((l) => <li key={l.label}><a href={l.href} target="_blank" rel="noopener noreferrer" className="flex h-full items-start gap-2.5 rounded-lg border-2 border-foreground/15 p-3 transition-colors hover:border-foreground hover:bg-muted">
          <l.icon className="mt-0.5 size-4 shrink-0 text-primary" /><span><span className="block text-sm font-bold">{l.label}</span><span className="block text-xs text-muted-foreground">{l.copy}</span></span>
        </a></li>)}</ul>
        <div className="mt-4 flex flex-wrap gap-1.5">{["TypeScript", "React", "TanStack Router", "Tailwind", "Motion", "Hono", "Supabase", "Vercel"].map((t) => <span key={t} className="rounded-full border-2 border-foreground/15 px-2 py-0.5 text-[11px] font-bold">{t}</span>)}</div>
      </div>
      <div className={cn(card, "space-y-3 p-5")}>
        <h3 className="flex items-center gap-2 font-bold"><Server className="size-4" />Run it on your machine</h3>
        <p className="text-sm text-muted-foreground">The site runs on sample data without any setup. The API needs a free Supabase project (see backend/README.md).</p>
        <CopyLine cmd={`git clone ${repo}.git && cd Ghosted`} />
        <CopyLine cmd="npm install && npm run dev" />
        <CopyLine cmd="cd backend && npm install && npm run dev" />
        <p className="text-xs text-muted-foreground">Please don't include anyone's personal data in issues or pull requests, including your own.</p>
      </div>
    </div>
  </section>;
}

// ---------- back the mission ----------

const PRESETS = [99, 299, 499, 999, 2499];
export function BackUs() {
  const { me } = useMe();
  const tone = useTone();
  const { summary } = useDonations();
  const [amount, setAmount] = useState(299);
  const [custom, setCustom] = useState("");
  const [message, setMessage] = useState("");
  const [showName, setShowName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [thanked, setThanked] = useState<number | null>(null);
  const [wallOpen, setWallOpen] = useState(false);
  const recent = summary?.wall.slice(3, 5) ?? [];
  const value = custom ? Number(custom) : amount;
  const valid = Number.isInteger(value) && value >= 10 && value <= 100000;
  const pay = async () => {
    if (!valid) return;
    setBusy(true);
    try { if ((await donate({ amount: value, message: message.trim(), showName, name: displayName(me) })) === "paid") setThanked(value); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Couldn't start the payment."); }
    finally { setBusy(false); }
  };
  const uses: [LucideIcon, string][] = [[Server, "Servers, database and email, so stories stay up"], [ShieldCheck, "Moderation and Goofy, so it stays safe"], [HeartHandshake, "Staying free, ad-free and not owned by employers"]];

  return <section id="back" className="scroll-mt-24 space-y-4">
    <SectionHead id="back-head" eyebrow="Back the mission" title="Keep Ghosted free and independent" copy="No ads, no employer dashboards, no paid score changes. That only works if candidates keep it running. Anything helps." />
    <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
      <div className={cn(card, "flex flex-col overflow-hidden")}>
        <AnimatePresence mode="wait" initial={false}>
          {thanked ? <motion.div key="thanks" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="grid place-items-center px-6 py-12 text-center">
            <motion.span initial={{ scale: 0.4 }} animate={{ scale: [0.4, 1.15, 1] }} transition={{ duration: 0.6 }} className="grid size-16 place-items-center rounded-full border-2 border-foreground bg-flag-red text-primary-foreground"><Heart className="size-8 fill-current" /></motion.span>
            <p className="mt-4 font-display text-2xl font-bold">{voice(tone, `₹${thanked.toLocaleString("en-IN")}. You absolute legend.`, `Thank you for your ₹${thanked.toLocaleString("en-IN")} donation.`)}</p>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">Your receipt is on its way from Razorpay. This keeps the receipts coming for every candidate after you.</p>
            <Button className="mt-5" variant="outline" onClick={() => setThanked(null)}>Done</Button>
          </motion.div> : <motion.div key="form" className="flex flex-1 flex-col space-y-4 p-5 sm:p-6">
            <div><span className={label}>Pick an amount</span>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{PRESETS.map((p) => { const on = !custom && amount === p; return <motion.button key={p} type="button" whileTap={{ scale: 0.95 }} onClick={() => { setAmount(p); setCustom(""); }} aria-pressed={on}
                className={cn("rounded-lg border-2 py-3 font-display text-lg font-bold tabular-nums transition-colors", on ? "border-foreground bg-primary text-primary-foreground shadow-hard-sm" : "border-foreground/20 hover:border-foreground")}>₹{p.toLocaleString("en-IN")}</motion.button>; })}</div>
              <label className="mt-2 flex h-11 items-center gap-2 rounded-lg border-2 border-foreground bg-background px-3">
                <span className="font-bold text-muted-foreground">₹</span>
                <input inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Or your own amount" aria-label="Custom amount" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
              </label>
              {custom && !valid && <p className="mt-1 text-xs font-semibold text-flag-red">Between ₹10 and ₹1,00,000, please.</p>}
            </div>
            <label className="block"><span className={label}>A note <span className="font-normal text-muted-foreground">(optional)</span></span>
              <Input value={message} onChange={(e) => setMessage(e.target.value.slice(0, 280))} placeholder="For everyone still waiting on a reply" className={cn(field, "h-11")} />
            </label>
            <label className="flex cursor-pointer items-center gap-3 text-sm">
              <input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} className="size-4 accent-[var(--primary)]" />
              <span>Show <span className="font-bold">{displayName(me)}</span> on the thank-you wall <span className="text-muted-foreground">(otherwise you stay anonymous)</span></span>
            </label>
            <Button size="lg" className="w-full" onClick={() => void pay()} disabled={!valid || busy || (apiEnabled && summary?.enabled === false)}>
              {busy ? <Loader2 className="animate-spin" /> : <Heart />}{apiEnabled && summary?.enabled === false ? "Donations open soon" : `Donate ₹${valid ? value.toLocaleString("en-IN") : "…"}`}
            </Button>
            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground"><Lock className="size-3.5" />Paid securely through Razorpay: UPI, cards, netbanking and wallets. We never see your card.</p>
            {/* Fills the card's bottom: the two supporters just after the three on the right. */}
            {recent.length > 0 && <div className="mt-auto border-t-2 border-dashed border-foreground/15 pt-4">
              <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">Recently chipped in</p>
              <div className="grid gap-2 sm:grid-cols-2">{recent.map((w, i) => <motion.div key={w.author.publicId} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.06 }}>
                <Link to="/u/$id" params={{ id: w.author.publicId }} className="group flex items-center gap-2.5 rounded-lg border-2 border-foreground/15 p-2.5 transition-colors hover:border-foreground hover:bg-muted">
                  <Avatar seed={w.author.avatarSeed} pastel={w.author.pastel} size="sm" label={w.author.name} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold group-hover:text-primary">{w.author.name}</span><span className="block truncate text-xs text-muted-foreground">{w.message ? `“${w.message}”` : "Backed Ghosted"}</span></span>
                  <Heart className="size-4 shrink-0 fill-flag-red text-flag-red" />
                </Link>
              </motion.div>)}</div>
            </div>}
          </motion.div>}
        </AnimatePresence>
      </div>
      <div className="flex flex-col gap-4">
        <div className={cn(card, "p-5")}>
          <h3 className="font-bold">Where it goes</h3>
          <ul className="mt-3 space-y-2.5">{uses.map(([Icon, t]) => <li key={t} className="flex items-start gap-2.5 text-sm"><span className="grid size-7 shrink-0 place-items-center rounded-md border-2 border-foreground bg-accent"><Icon className="size-3.5" /></span><span className="pt-0.5">{t}</span></li>)}</ul>
        </div>
        {/* The newest three on the wall, and the door to the whole thing. Fills the column. */}
        <div className={cn(card, "flex flex-1 flex-col p-5")}>
          <div className="flex items-start justify-between gap-2">
            <div><h3 className="flex items-center gap-2 font-bold"><Heart className="size-4 fill-flag-red text-flag-red" />Thank-you wall</h3>
              <p className="text-xs text-muted-foreground">{summary?.supporters ? `${summary.supporters.toLocaleString("en-IN")} ${summary.supporters === 1 ? "person has" : "people have"} chipped in so far` : "Be the first name here"}</p></div>
            {summary?.wall.length ? <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">Latest</span> : null}
          </div>
          {summary?.wall.length ? <ul className="mt-3 space-y-1">{summary.wall.slice(0, 3).map((w, i) => <motion.li key={w.author.publicId} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}>
            <Link to="/u/$id" params={{ id: w.author.publicId }} className="group -mx-2 flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted">
              <Avatar seed={w.author.avatarSeed} pastel={w.author.pastel} size="sm" label={w.author.name} />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold group-hover:text-primary">{w.author.name}</span><span className="line-clamp-1 block text-xs text-muted-foreground">{w.message ? `“${w.message}”` : "Backed Ghosted"}</span></span>
            </Link>
          </motion.li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">{voice(tone, "This wall is emptier than a recruiter's inbox after the final round.", "Supporters who choose to show their name appear here.")}</p>}
          <div className="mt-auto space-y-3 pt-4">
            {summary?.mine.length ? <p className="border-t-2 border-dashed border-foreground/15 pt-3 text-xs text-muted-foreground">You've supported Ghosted {summary.mine.length} {summary.mine.length === 1 ? "time" : "times"}. Thank you.</p> : null}
            <Button variant="outline" className="w-full" onClick={() => setWallOpen(true)}><Users />See the whole wall<ArrowRight /></Button>
          </div>
        </div>
      </div>
    </div>
    <ThankYouWall open={wallOpen} onOpenChange={setWallOpen} />
  </section>;
}

export function FeedbackSections({ initialKind }: { initialKind?: FormKind }): ReactNode {
  return <div className="space-y-10">
    <FeedbackHero />
    <FeedbackForm {...(initialKind && { initialKind })} />
    <MySubmissions />
    <BuildWithUs />
    <BackUs />
  </div>;
}
