import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { ArrowRight, BadgeCheck, Ban, BarChart3, Check, EyeOff, Lock, Megaphone, MessageSquareReply, Search, ShieldCheck, Sparkles, UserPlus } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { CompanyMark } from "@/components/ghosted";
import { RepVerifyDialog } from "@/components/company-voice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiEnabled } from "@/lib/api";
import { fetchHr, type Bucket } from "@/lib/company-voice";
import { pageHead } from "@/lib/meta";
import { useMe, useTone, voice } from "@/lib/session";
import { OUTCOME_LABEL, useCompanyIndex } from "@/lib/stories";
import { cn } from "@/lib/utils";

// /for-hr: the front door for companies. Public, no login. What HR gets (free, forever), what it can
// never do, how candidates stay anonymous, and "Verify as {company}" (the existing rep flow).
// ?company=slug adds that company's request count and stage / outcome counts (never story text);
// &story=<id> is the link an author sent, pointing at their story.
export const Route = createFileRoute("/for-hr")({
  validateSearch: (s: Record<string, unknown>): { company?: string; story?: string } => ({
    ...(typeof s["company"] === "string" && /^[a-z0-9-]{2,60}$/.test(s["company"]) && { company: s["company"] }),
    ...(typeof s["story"] === "string" && /^\d{15}$/.test(s["story"]) && { story: s["story"] }),
  }),
  head: () => pageHead({ title: "Ghosted for HR | Answer your candidates, free", description: "Candidates are already sharing how your hiring went. Verify with a work email to reply, show what you've changed and see aggregate insights. Free forever. You can never edit, hide or remove a story.", path: "/for-hr" }),
  component: ForHrPage,
});

const STAGE: Record<string, string> = { application: "Application", screening: "Screening", technical: "Technical", final: "Final round", offer: "Offer stage" };

function Bars({ title, items, label }: { title: string; items: Bucket[]; label: (k: string) => string }) {
  if (!items.length) return null;
  const max = Math.max(...items.map((i) => i.count));
  return <div>
    <p className="text-xs font-bold uppercase text-muted-foreground">{title}</p>
    <ul className="mt-2 space-y-2">{items.map((b) => <li key={b.key}>
      <div className="flex justify-between text-sm"><span>{label(b.key)}</span><span className="font-bold tabular-nums">{b.count}</span></div>
      <div className="mt-1 h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(b.count / max) * 100}%` }} /></div>
    </li>)}</ul>
  </div>;
}

function CompanyBlock({ slug, story, onVerify }: { slug: string; story?: string | undefined; onVerify: () => void }) {
  const tone = useTone();
  const { index } = useCompanyIndex();
  const q = useQuery({ queryKey: ["hr", slug], queryFn: () => fetchHr(slug), enabled: apiEnabled, retry: false });
  const co = index.get(slug);
  if (q.isPending && apiEnabled) return <div className="skeleton h-64 rounded-2xl" />;
  if (!q.data) return <p className="rounded-xl border-2 border-dashed border-foreground/30 p-5 text-sm text-muted-foreground">We couldn't find that company on Ghosted.</p>;
  const d = q.data;
  return <div className="rounded-2xl border-2 border-foreground bg-card p-5 shadow-hard sm:p-7">
    <div className="flex flex-wrap items-center gap-3">
      {co && <CompanyMark company={co} />}
      <div className="min-w-0 flex-1"><p className="text-sm font-bold text-primary">On Ghosted right now</p><h2 className="font-display text-3xl font-bold leading-tight">{d.company.name}</h2></div>
    </div>
    <dl className="mt-5 grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border-2 border-foreground bg-accent p-4"><dt className="flex items-center gap-1.5 text-xs font-bold"><Megaphone className="size-3.5" />Candidates asking you to respond</dt><dd className="mt-1 font-display text-4xl font-bold tabular-nums">{d.requests ?? "Fewer than 3"}</dd></div>
      <div className="rounded-xl border-2 border-foreground/15 p-4"><dt className="text-xs font-bold text-muted-foreground">Candidate stories about you</dt><dd className="mt-1 font-display text-4xl font-bold tabular-nums">{d.stories}</dd></div>
    </dl>
    {(d.stages.length > 0 || d.outcomes.length > 0) ? <div className="mt-5 grid gap-5 sm:grid-cols-2">
      <Bars title="Where their stories reached" items={d.stages} label={(k) => STAGE[k] ?? k} />
      <Bars title="How they ended" items={d.outcomes} label={(k) => OUTCOME_LABEL[k] ?? k} />
    </div> : <p className="mt-4 text-xs text-muted-foreground">Breakdowns appear once there are at least 5 stories, and only groups of 3 or more are shown, so no single candidate stands out.</p>}
    {story && <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed border-foreground/30 p-4">
      <p className="min-w-0 flex-1 basis-56 text-sm"><b>A candidate pointed you to a specific story.</b> You'll never see who wrote it. Verify to reply to it officially.</p>
      <Button variant="outline" asChild><Link to="/s/$id" params={{ id: story }}>Read the story</Link></Button>
    </div>}
    <div className="mt-6 flex flex-wrap gap-3">
      <Button size="lg" className="min-h-12" onClick={onVerify}><BadgeCheck />Verify as {d.company.name}</Button>
      <Button size="lg" variant="outline" className="min-h-12" asChild><Link to="/c/$slug" params={{ slug }}>See the company page</Link></Button>
    </div>
    <p className="mt-3 text-xs text-muted-foreground">{voice(tone, "Takes about a minute with a work email on your company's domain. No sales call, no invoice, ever.", "Verification takes about a minute with a work email on your company's domain. It's free.")}</p>
  </div>;
}

function FindCompany() {
  const { list } = useCompanyIndex();
  const [q, setQ] = useState("");
  const hits = useMemo(() => (q.trim().length < 2 ? [] : list.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6)), [q, list]);
  return <div className="rounded-2xl border-2 border-foreground bg-card p-5 shadow-hard sm:p-7">
    <p className="text-sm font-bold text-primary">Find your company</p>
    <div className="relative mt-3"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Company name" className="h-11 border-2 border-foreground pl-9" aria-label="Company name" /></div>
    {hits.length > 0 && <ul className="mt-3 space-y-1.5">{hits.map((c) => <li key={c.id}><Link to="/for-hr" search={{ company: c.id }} className="flex items-center gap-3 rounded-lg border-2 border-foreground/15 p-2 hover:border-foreground"><CompanyMark company={c} size="sm" /><span className="min-w-0 flex-1 truncate font-semibold">{c.name}</span><ArrowRight className="size-4" /></Link></li>)}</ul>}
    {q.trim().length >= 2 && !hits.length && <p className="mt-3 text-sm text-muted-foreground">Not listed yet. Anyone can list a real company from the Companies page.</p>}
  </div>;
}

function ForHrPage() {
  const { company, story } = Route.useSearch();
  const { signedIn } = useMe();
  const tone = useTone();
  const { index } = useCompanyIndex();
  const [verifying, setVerifying] = useState(false);
  const name = company ? index.get(company)?.name ?? "your company" : "your company";
  const verify = () => setVerifying(true);

  return <div className="min-h-screen overflow-hidden"><SiteHeader /><main>
    <section className="border-b-2 border-foreground">
      <div className="mx-auto grid max-w-6xl items-start gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-accent px-3 py-1 text-sm font-bold"><BadgeCheck className="size-4" />For HR and hiring teams</p>
          <h1 className="text-5xl font-bold leading-[1.02] sm:text-6xl">Your candidates are already talking.<br /><span className="text-primary">Answer them, free.</span></h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">{voice(tone, "Ghosted is where candidates in India share how hiring actually went. You can't buy your way out of a story, but you can reply to it, fix what it's about, and show the next candidate you did.", "Candidates share their hiring experiences on Ghosted. Verified companies can reply, show what they changed, and see aggregate insights, all free.")}</p>
          {!company && <div className="mt-7"><FindCompany /></div>}
        </div>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 200, damping: 20 }}>
          {company ? <CompanyBlock slug={company} story={story} onVerify={verify} /> : <div className="rounded-2xl border-2 border-foreground bg-accent p-6 shadow-hard">
            <p className="font-display text-2xl font-bold">Free, forever. That's the whole pricing page.</p>
            <p className="mt-2 text-sm text-muted-foreground">No paid tiers, no "premium response", no sponsored placement. Paying would be the fastest way to lose candidates' trust, and that trust is the only reason any of this is worth reading.</p>
          </div>}
        </motion.div>
      </div>
    </section>

    {/* What HR gets, and what it can never do: side by side, on purpose. */}
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border-2 border-foreground bg-card p-6 shadow-hard-sm">
          <h2 className="flex items-center gap-2 font-display text-2xl font-bold"><Check className="size-6 text-flag-green" />What you get</h2>
          <ul className="mt-4 space-y-3">{[
            [MessageSquareReply, "One official reply per story", "Plus one on your company page. Clearly labelled as from a verified company representative."],
            [Check, "Acknowledge in one tap", "Heard, looking into it, fixed. The candidate sees it move on their story's progress."],
            [Sparkles, "You said, we did", "Up to 4 public notes a month on what you changed, linked to the stories behind them."],
            [BarChart3, "Company Pulse", "Private aggregates: median days to first reply, outcome mix, where candidates go quiet, your Flag Score trend. A one-page summary to share with hiring managers."],
            [Megaphone, "Who's asking", "How many candidates asked you to respond, once it's at least 3."],
          ].map(([I, t, d]) => { const Icon = I as typeof Check; return <li key={t as string} className="flex gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-foreground bg-accent"><Icon className="size-4" /></span><span><span className="block font-bold">{t as string}</span><span className="block text-sm text-muted-foreground">{d as string}</span></span></li>; })}</ul>
        </div>
        <div className="rounded-2xl border-2 border-flag-red bg-card p-6 shadow-hard-sm">
          <h2 className="flex items-center gap-2 font-display text-2xl font-bold"><Ban className="size-6 text-flag-red" />What you can never do</h2>
          <ul className="mt-4 space-y-2.5 text-sm">{[
            "Edit, delete, hide or reorder any story, chitchat or score",
            "Edit or delete your own replies, steps or change notes once posted",
            "Pay for anything: placement, removal, a badge or a better score",
            "See who wrote a story, or open the profile of anyone who wrote about your company",
            "Post a candidate story about your own company",
            "Report your company's stories to get them taken down (corrections go through our public request form, like anyone's)",
          ].map((t) => <li key={t} className="flex items-start gap-2"><Ban className="mt-0.5 size-4 shrink-0 text-flag-red" />{t}</li>)}</ul>
          <p className="mt-4 text-xs text-muted-foreground">Only Ghosted's moderators remove anything, under the published Community Rules.</p>
        </div>
      </div>
    </section>

    <section className="border-y-2 border-foreground bg-secondary py-14">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="flex items-center gap-2 text-4xl font-bold"><EyeOff className="size-8" />How candidates stay anonymous</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">{[
          [Lock, "Locked for reps, not just hidden", "Once you're verified, anyone with a story about your company shows as \"A candidate\" to you, everywhere, and their profile answers as if it doesn't exist. Enforced on our servers. It stays that way even if your verification is revoked."],
          [ShieldCheck, "Counts, not people", "Every number you see is an aggregate. Metrics need at least 5 stories, and any group smaller than 3 is hidden, so no single candidate can be picked out."],
          [BadgeCheck, "Only your domain is kept", "We verify you with a code to your work email and keep only the domain, never the address."],
        ].map(([I, t, d]) => { const Icon = I as typeof Lock; return <div key={t as string} className="rounded-xl border-2 border-foreground bg-card p-5 shadow-hard-sm"><Icon className="size-6 text-primary" /><h3 className="mt-3 font-display text-lg font-bold">{t as string}</h3><p className="mt-1 text-sm text-muted-foreground">{d as string}</p></div>; })}</div>
      </div>
    </section>

    <section className="mx-auto max-w-6xl px-4 py-14 text-center sm:px-6">
      <h2 className="text-4xl font-bold">{voice(tone, "Reply like you mean it.", "Ready to respond?")}</h2>
      <p className="mx-auto mt-2 max-w-xl text-muted-foreground">Verify with a work email on {name}'s domain. You'll need a free Ghosted account first.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {company
          ? signedIn ? <Button size="lg" className="min-h-12" onClick={verify}><BadgeCheck />Verify as {name}</Button> : <Button size="lg" className="min-h-12" asChild><Link to="/auth"><UserPlus />Create a free account to verify</Link></Button>
          : <Button size="lg" className="min-h-12" asChild><a href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Find your company first</a></Button>}
      </div>
    </section>
    {company && <RepVerifyDialog open={verifying && signedIn} onOpenChange={setVerifying} slug={company} name={name} />}
    {company && verifying && !signedIn && <SignInFirst onClose={() => setVerifying(false)} />}
  </main><SiteFooter /></div>;
}

// Verifying needs an account (the rep is tied to it). Signed out: one clear next step.
function SignInFirst({ onClose }: { onClose: () => void }) {
  return <div role="dialog" aria-label="Create an account first" className="fixed inset-x-3 bottom-4 z-50 mx-auto max-w-md rounded-xl border-2 border-foreground bg-card p-4 shadow-hard">
    <p className="font-display text-lg font-bold">First, a free account</p>
    <p className="mt-1 text-sm text-muted-foreground">Your verification is tied to a Ghosted account. Create one (or log in), then come back here.</p>
    <div className={cn("mt-3 grid grid-cols-2 gap-2")}>
      <Button variant="outline" onClick={onClose}>Not now</Button>
      <Button asChild><Link to="/auth"><UserPlus />Continue</Link></Button>
    </div>
  </div>;
}
