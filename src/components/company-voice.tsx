// Ask candidates (company Q&A), the Right of Reply, and the removal / correction request form.
// Rules and limits are enforced by the API (backend/src/routes/company-voice.ts); this is the UI.
import { useState } from "react";
import { BadgeCheck, CheckCircle2, Clock, FileWarning, Loader2, MailCheck, MessageCircleQuestion, Pencil, Pin, PinOff, ShieldCheck, Trash2, UserRound, Users } from "lucide-react";
import { CodeInput } from "@/components/code-input";
import { toast } from "sonner";
import { Markdown } from "@/components/markdown";
import { HumanCheck, useHumanCheck } from "@/components/human-check";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Composer } from "@/components/dashboard/chitchats";
import { card, popup, popupBody } from "@/components/dashboard/ui-kit";
import { ApiRequestError, apiEnabled, askToJoin } from "@/lib/api";
import { repsApi, sendContentRequest, useQuestions, useRepReplies, type Question, type RepReply, type Relationship, type RequestKind } from "@/lib/company-voice";
import { speak } from "@/lib/goofy";
import { useMe, useTone, voice } from "@/lib/session";
import { timeAgo } from "@/lib/stories";
import { cn } from "@/lib/utils";

const errText = (e: unknown, fallback: string) => (e instanceof ApiRequestError ? e.message : fallback);

// ---------- Ask candidates ----------

function QuestionItem({ q, canAnswer, name, hooks }: { q: Question; canAnswer: boolean; name: string; hooks: ReturnType<typeof useQuestions> }) {
  const tone = useTone();
  const [answering, setAnswering] = useState(false);
  const pin = async (answerId: string | null) => { try { await hooks.pin(q.publicId, answerId); toast.success(answerId ? "Pinned as the best answer." : "Unpinned."); } catch (e) { toast.error(errText(e, "Couldn't pin that.")); } };
  return <li className={cn(card, "p-4")}>
    <div className="flex items-start gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-foreground bg-accent"><MessageCircleQuestion className="size-4" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground"><b className="text-foreground">{q.mine ? "You asked" : "A member asked"}</b> · {timeAgo(q.createdAt)}</p>
        <Markdown text={q.body} className="mt-1 font-semibold" />
      </div>
      {q.mine && <button type="button" aria-label="Delete your question" onClick={() => void hooks.removeQuestion(q.publicId).catch(() => toast.error("Couldn't delete it."))} className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-flag-red"><Trash2 className="size-4" /></button>}
    </div>
    {q.answers.length > 0 && <ul className="mt-3 space-y-2.5 border-l-2 border-foreground/15 pl-4 sm:ml-12">{q.answers.map((a) => <li key={a.publicId} className={cn("rounded-lg p-3", a.best ? "border-2 border-flag-green bg-flag-green/10" : "bg-muted/50")}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {a.best && <span className="inline-flex items-center gap-1 rounded-full bg-flag-green px-2 py-0.5 font-bold text-primary-foreground"><Pin className="size-3" />Best answer</span>}
        <span className="inline-flex items-center gap-1 font-bold text-foreground">{a.basis === "story" ? <><UserRound className="size-3" />Shared a story about {name}</> : <><Users className="size-3" />Follows {name}</>}</span>
        <span>{a.mine ? "You" : "Anonymous"} · {timeAgo(a.createdAt)}</span>
      </p>
      <Markdown text={a.body} className="mt-1 text-[15px]" />
      <div className="mt-1.5 flex flex-wrap gap-1">
        {q.mine && <button type="button" onClick={() => void pin(a.best ? null : a.publicId)} className="inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 text-xs font-bold hover:bg-card">{a.best ? <><PinOff className="size-3.5" />Unpin</> : <><Pin className="size-3.5" />Pin as best</>}</button>}
        {a.mine && <button type="button" onClick={() => void hooks.removeAnswer(a.publicId).catch(() => toast.error("Couldn't delete it."))} className="inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 text-xs font-bold text-muted-foreground hover:bg-card hover:text-flag-red"><Trash2 className="size-3.5" />Delete</button>}
      </div>
    </li>)}</ul>}
    <div className="mt-3 sm:ml-12">
      {canAnswer
        ? answering ? <Composer compact autoFocus label="Answer" max={1000} placeholder={voice(tone, "What actually happened when you went through it? No names of individuals.", "Share what you know from your experience. Please don't name individuals.")} onCancel={() => setAnswering(false)} onPost={(b) => hooks.answer(q.publicId, b)} />
          : <Button size="sm" variant="outline" onClick={() => setAnswering(true)}>Answer anonymously</Button>
        : q.answers.length === 0 && <p className="text-xs text-muted-foreground">No answers yet. People who shared a story about {name}, or follow it, were told about this question.</p>}
    </div>
  </li>;
}

export function AskCandidates({ slug, name }: { slug: string; name: string }) {
  const tone = useTone();
  const { signedOut } = useMe();
  const hooks = useQuestions(slug);
  const d = hooks.data;
  // The latest three, then everything on request (it sits above the stories on the company page).
  const [all, setAll] = useState(false);
  const shown = d ? (all ? d.questions : d.questions.slice(0, 3)) : [];
  return <section aria-labelledby="ask-heading" className="space-y-4">
    <div>
      <h2 id="ask-heading" className="flex items-center gap-2 text-2xl font-bold"><MessageCircleQuestion className="size-6 text-primary" />Ask candidates</h2>
      <p className="mt-1 text-sm text-muted-foreground">{voice(tone, `Got an interview at ${name}? Ask people who've been through it. Everyone stays anonymous, you included.`, `Questions about ${name}'s hiring, answered anonymously by people who went through it or follow the company.`)}</p>
    </div>
    {!apiEnabled ? <p className="rounded-xl border-2 border-dashed border-foreground/30 p-5 text-sm text-muted-foreground">Questions appear on the live site.</p>
      : signedOut ? <div className="rounded-xl border-2 border-dashed border-foreground/30 p-5 text-sm"><p className="font-bold">Have a question about {name}?</p><p className="mt-1 text-muted-foreground">Join free to ask. Your question shows as "A member", never your name.</p><Button size="sm" className="mt-3" onClick={askToJoin}>Join to ask</Button></div>
      : d?.canAsk && (d.questionsLeftToday > 0
        ? <div><Composer label="Ask" max={500} placeholder={voice(tone, `e.g. How many rounds did ${name} do for backend roles, and did they reply after the final?`, `e.g. How long did ${name} take to reply after the final round?`)} onPost={hooks.ask} />
            <p className="mt-1.5 text-xs text-muted-foreground">Shown as "A member". {d.questionsLeftToday} of 3 questions left today.</p></div>
        : <p className="rounded-xl border-2 border-dashed border-foreground/30 p-4 text-sm text-muted-foreground">You've asked 3 questions today, the daily limit. Read the answers below, or ask again tomorrow.</p>)}
    {hooks.loading ? <div className="space-y-3" aria-busy="true">{[0, 1].map((i) => <div key={i} className="skeleton h-28 rounded-xl" />)}</div>
      : d && d.questions.length > 0 ? <>
          <ul className="space-y-3">{shown.map((q) => <QuestionItem key={q.publicId} q={q} canAnswer={d.canAnswer} name={name} hooks={hooks} />)}</ul>
          {d.questions.length > 3 && <Button variant="outline" size="sm" onClick={() => setAll((v) => !v)}>{all ? "Show fewer questions" : `Show all ${d.questions.length} questions`}</Button>}
        </>
      : d && <p className="text-sm text-muted-foreground">{voice(tone, "No questions yet. Be the brave one.", "No questions yet.")}</p>}
    {d && !d.canAnswer && !signedOut && d.questions.length > 0 && <p className="text-xs text-muted-foreground">Answers come from people who shared a story about {name} or follow it. Follow {name} to answer.</p>}
  </section>;
}

// ---------- Right of Reply ----------

// An official reply: always clearly labelled, in its own colour, so nobody mistakes it for a candidate.
export function RepReplyCard({ reply, companyName }: { reply: RepReply; companyName: string }) {
  return <aside aria-label={`Official reply from ${companyName}`} className="rounded-xl border-2 border-sky-700 bg-sky-50 p-4 dark:border-sky-400 dark:bg-sky-950/40">
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-700 px-2 py-0.5 font-bold text-white dark:bg-sky-400 dark:text-sky-950"><BadgeCheck className="size-3.5" />Official reply from {companyName}</span>
      <span className="text-muted-foreground">Verified company representative · {timeAgo(reply.createdAt)}</span>
    </p>
    <Markdown text={reply.body} className="mt-2 text-[15px]" />
    <p className="mt-2 text-[11px] text-muted-foreground">Companies get one free reply per story. They can't edit, hide or remove anything on Ghosted.</p>
  </aside>;
}

// The reply slot: the company's reply if there is one; for a verified rep with none yet, the
// one-time composer.
export function RepReplySlot({ slug, companyName, storyPublicId }: { slug: string; companyName: string; storyPublicId?: string }) {
  const r = useRepReplies(slug);
  const [writing, setWriting] = useState(false);
  const reply = storyPublicId ? r.forStory(storyPublicId) : r.onPage;
  if (reply) return <RepReplyCard reply={reply} companyName={companyName} />;
  if (!r.data?.viewerIsRep) return null;
  return <div className="rounded-xl border-2 border-dashed border-sky-700 p-4 dark:border-sky-400">
    <p className="flex items-center gap-2 text-sm font-bold"><BadgeCheck className="size-4 text-sky-700 dark:text-sky-400" />You're a verified representative of {companyName}</p>
    <p className="mt-1 text-xs text-muted-foreground">You can post one official reply {storyPublicId ? "to this story" : "on the company page"}. It's checked like every post, and <b className="text-foreground">it can't be edited or deleted</b> once it's up. Be factual and don't identify anyone.</p>
    {writing ? <div className="mt-3"><Composer compact autoFocus label="Post official reply" max={1500} placeholder="What should candidates know? Facts, context, or what you're changing." onCancel={() => setWriting(false)} onPost={(b) => r.post(b, storyPublicId)} /></div>
      : <Button size="sm" variant="outline" className="mt-3" onClick={() => setWriting(true)}>Write {companyName}'s reply</Button>}
  </div>;
}

export function RepVerifyDialog({ open, onOpenChange, slug, name }: { open: boolean; onOpenChange: (v: boolean) => void; slug: string; name: string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code" | "done">("email");
  const [busy, setBusy] = useState(false);
  const close = (v: boolean) => { onOpenChange(v); if (!v) { setStep("email"); setCode(""); } };
  const start = async () => {
    setBusy(true);
    try { const r = await repsApi.start(slug, email.trim()); setStep(r.alreadyVerified ? "done" : "code"); }
    catch (e) { toast.error(errText(e, "Couldn't send the code.")); } finally { setBusy(false); }
  };
  const verify = async (value = code) => {
    setBusy(true);
    try { await repsApi.verify(slug, email.trim(), value.trim()); setStep("done"); }
    catch (e) { toast.error(errText(e, "That code didn't work.")); setCode(""); } finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={close}>
    <DialogContent className={cn(popup, "max-w-lg")}>
      <div className={popupBody} data-lenis-prevent>
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="flex items-start gap-2 font-display text-xl leading-tight sm:text-2xl"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-sky-700 sm:size-6 dark:text-sky-400" />Right of Reply</DialogTitle>
          <DialogDescription>Work at {name}? Reply to stories about it, free.</DialogDescription>
        </DialogHeader>
        <ul className="mt-4 space-y-1.5 text-sm">
          {["One clearly labelled reply per story, and one on the company page.", "Every reply is checked like any other post.", "No editing or deleting a reply, no hiding, ranking or removing stories. Not for any price.", "We keep only your email's domain, never the address."].map((t) => <li key={t} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-flag-green" />{t}</li>)}
        </ul>
        {step === "email" && <form className="mt-5 space-y-2" onSubmit={(e) => { e.preventDefault(); void start(); }}>
          <label className="text-sm font-bold" htmlFor="rep-email">Your work email at {name}</label>
          <Input id="rep-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="h-11 border-2 border-foreground" required />
          <p className="text-xs text-muted-foreground">It must be on {name}'s own website domain. Personal addresses can't be verified.</p>
          <Button type="submit" className="w-full" disabled={busy || !email.includes("@")}>{busy && <Loader2 className="animate-spin" />}Send code</Button>
        </form>}
        {/* The same code step as sign-in: who it went to (with Change), the 6 boxes, auto-verify on the 6th digit. */}
        {step === "code" && <form className="mt-5 space-y-4" onSubmit={(e) => { e.preventDefault(); void verify(); }}>
          <div className="flex items-center gap-3 rounded-lg border-2 border-foreground bg-card p-3">
            <MailCheck className="size-5 shrink-0 text-primary" />
            <p className="min-w-0 flex-1 truncate text-sm">Code sent to <strong>{email}</strong></p>
            <button type="button" onClick={() => { setStep("email"); setCode(""); }} className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-primary hover:underline"><Pencil className="size-3" />Change</button>
          </div>
          <CodeInput value={code} onChange={setCode} onComplete={(v) => { if (!busy) void verify(v); }} />
          <p className="text-xs text-muted-foreground">No email? Check spam, or <button type="button" disabled={busy} onClick={() => void start()} className="font-bold text-primary hover:underline disabled:text-muted-foreground">send a new code</button>.</p>
          <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>{busy && <Loader2 className="animate-spin" />}Verify</Button>
        </form>}
        {step === "done" && <div className="mt-5 rounded-lg border-2 border-flag-green bg-flag-green/10 p-4 text-sm">
          <p className="flex items-center gap-2 font-bold"><CheckCircle2 className="size-4 text-flag-green" />You're verified for {name}.</p>
          <p className="mt-1 text-muted-foreground">You'll see a reply box under each story about {name}, and one on its page.</p>
          <Button className="mt-3" size="sm" onClick={() => close(false)}>Done</Button>
        </div>}
      </div>
    </DialogContent>
  </Dialog>;
}

// ---------- Removal and factual-error requests ----------

const RELATIONSHIPS: { id: Relationship; label: string }[] = [
  { id: "subject", label: "It's about me" }, { id: "company", label: "I'm the company" }, { id: "author", label: "I wrote it" }, { id: "other", label: "Something else" },
];

export function ContentRequestDialog({ open, onOpenChange, targetUrl = "" }: { open: boolean; onOpenChange: (v: boolean) => void; targetUrl?: string }) {
  const { signedOut } = useMe();
  const shield = useHumanCheck();
  const [kind, setKind] = useState<RequestKind>("factual_error");
  const [url, setUrl] = useState(targetUrl);
  const [email, setEmail] = useState("");
  const [rel, setRel] = useState<Relationship>("subject");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const close = (v: boolean) => { onOpenChange(v); if (!v) { setDone(null); setDetails(""); } };
  const valid = /^https?:\/\//.test(url.trim()) && email.includes("@") && details.trim().length >= 20 && (!signedOut || shield.status === "done");
  const submit = async () => {
    if (!apiEnabled) { setDone("PREVIEW"); return; }
    setBusy(true);
    try { const r = await sendContentRequest({ kind, targetUrl: url.trim(), email: email.trim(), relationship: rel, details: details.trim(), ...(signedOut && { captchaToken: shield.getToken() }) }); setDone(r.reference); }
    catch (e) { if (e instanceof ApiRequestError && e.message.startsWith("Goofy: ")) speak(e.message, "error"); else toast.error(errText(e, "Couldn't send the request.")); shield.reset(); }
    finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={close}>
    <DialogContent className={cn(popup, "max-w-lg")}>
      <div className={popupBody} data-lenis-prevent>
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="flex items-start gap-2 font-display text-xl leading-tight sm:text-2xl"><FileWarning className="mt-0.5 size-5 shrink-0 text-primary sm:size-6" /><span className="min-w-0">Request a removal or correction</span></DialogTitle>
          <DialogDescription className="text-sm">A moderator reviews every request. Honest experiences aren't removed just for being negative.</DialogDescription>
        </DialogHeader>
        {/* The response-time promise, up front. */}
        <p className="mt-4 flex items-start gap-2 rounded-lg border-2 border-foreground bg-accent p-3 text-sm font-semibold"><Clock className="mt-0.5 size-4 shrink-0" /><span>Acknowledged within <b>24 hours</b>, decided within <b>15 days</b>.</span></p>
        {done ? <div className="mt-5 rounded-lg border-2 border-flag-green bg-flag-green/10 p-4 text-sm">
            <p className="flex items-center gap-2 font-bold"><CheckCircle2 className="size-4 text-flag-green" />Request received.</p>
            <p className="mt-1">{done === "PREVIEW" ? "Preview mode: requests aren't sent here." : <>Your reference is <b className="tabular-nums">{done}</b>. We'll email {email} within 24 hours to acknowledge it.</>}</p>
            <Button className="mt-3" size="sm" onClick={() => close(false)}>Done</Button>
          </div>
          : <form className="mt-5 space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) void submit(); }}>
            {/* Stacked on narrow phones, side by side from 400px: labels never wrap inside a button. */}
            <div role="radiogroup" aria-label="What do you need?" className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
              {([["factual_error", "Fix a factual error"], ["removal", "Remove content"]] as const).map(([id, label]) => <button key={id} type="button" role="radio" aria-checked={kind === id} onClick={() => setKind(id)}
                className={cn("min-h-11 whitespace-nowrap rounded-lg border-2 border-foreground px-3 text-sm font-bold transition-colors", kind === id ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>{label}</button>)}
            </div>
            <label className="block text-sm font-bold">Link to the story, chitchat or page<Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" inputMode="url" className="mt-1 h-11 border-2 border-foreground font-normal" required /></label>
            <div><p className="text-sm font-bold">Your connection to it</p>
              {/* An even 2-column grid on phones (no ragged wrapping), one row on wider screens. */}
              <div className="mt-1.5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">{RELATIONSHIPS.map((r) => <button key={r.id} type="button" aria-pressed={rel === r.id} onClick={() => setRel(r.id)} className={cn("min-h-10 rounded-full border-2 border-foreground px-3 text-xs font-bold leading-tight", rel === r.id ? "bg-foreground text-background" : "bg-card hover:bg-muted")}>{r.label}</button>)}</div>
            </div>
            <label className="block text-sm font-bold">{kind === "factual_error" ? "What's wrong, and what's correct?" : "Why should it come down?"}
              <Textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={3000} rows={4} placeholder={kind === "factual_error" ? "Quote the part that's wrong and explain what actually happened. Evidence helps." : "Which rule or law it breaks, for example it names a private person or shares confidential information."} className="mt-1 border-2 border-foreground font-normal" required />
              <span className="mt-1 block text-xs font-normal text-muted-foreground">{details.trim().length < 20 ? `At least 20 characters (${20 - details.trim().length} to go)` : `${details.length}/3000`}</span>
            </label>
            <label className="block text-sm font-bold">Email for our reply<Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="mt-1 h-11 border-2 border-foreground font-normal" required /></label>
            <p className="text-xs text-muted-foreground">Used only to reply about this request. We don't tell the author who asked.</p>
            {signedOut && <HumanCheck shield={shield} />}
            <Button type="submit" className="w-full" disabled={!valid || busy}>{busy && <Loader2 className="animate-spin" />}Send request</Button>
          </form>}
      </div>
    </DialogContent>
  </Dialog>;
}
