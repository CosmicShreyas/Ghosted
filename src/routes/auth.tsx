import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Check, Dices, KeyRound, Loader2, Lock, MailCheck, Pencil, RefreshCw, ShieldCheck } from "lucide-react";
import { AuthShowcase } from "@/components/auth-showcase";
import { Avatar } from "@/components/ghosted";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PasswordStrength } from "@/components/password-strength";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "sonner";
import { ApiRequestError, apiEnabled, authApi, type MfaMethod } from "@/lib/api";
import { handleFromSeed, randomHandle } from "@/lib/handles";
import { safeReturnTo, useAccountActions, useAuthGuard } from "@/lib/session";
import { clearRef, pendingRef } from "@/lib/invite";
import { Preloader } from "@/components/preloader";
import { HumanCheck, useHumanCheck } from "@/components/human-check";
import { ThemeToggle } from "@/components/theme-picker";
import { useResolvedTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { users } from "@/mock/data";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Join Ghosted | Stay anonymous" },
      { name: "description", content: "Log in or create your anonymous Ghosted profile." },
      { property: "og:title", content: "Join Ghosted | Stay anonymous" },
      { property: "og:description", content: "Log in or create your anonymous Ghosted profile." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      // Sign-in pages aren't search results.
      { name: "robots", content: "noindex, follow" },
    ],
  }),
  // /auth?tab=login opens the Log in tab (the header's "Log in" button); anything else opens Sign up.
  // ?returnTo=/s/<id> or /c/<slug>: after signing in or up, go back to that page.
  // ?intent=share: came from "Share my experience", so after signing in or up the share popup opens.
  validateSearch: (search: Record<string, unknown>): { tab?: "login"; returnTo?: string; intent?: "share" } => ({
    ...(search["tab"] === "login" && { tab: "login" as const }),
    ...(search["intent"] === "share" && { intent: "share" as const }),
    ...(typeof search["returnTo"] === "string" && safeReturnTo(search["returnTo"]) && { returnTo: search["returnTo"] }),
  }),
  component: AuthPage,
});

type Tab = "login" | "signup";
type Step = "details" | "code" | "account";
type Look = { seed: string; pastel: string };
type Notice = { tone: "error" | "info"; text: string } | null;
type Recover = null | "email" | "reset";

const PASTELS = ["bg-avatar-mint", "bg-avatar-sky", "bg-avatar-pink", "bg-avatar-amber", "bg-avatar-lilac"];
// First render uses fixed looks so server and client HTML match; the dice makes new ones.
const initialLooks: Look[] = users.slice(0, 8).map((u) => ({ seed: u.seed, pastel: u.pastel }));
const randomLooks = (): Look[] => Array.from({ length: 8 }, (_, i) => ({ seed: `peep-${Math.random().toString(36).slice(2, 10)}`, pastel: PASTELS[i % PASTELS.length]! }));
const inputClass = "h-11 border-2 border-foreground bg-card";
const STEPS: { id: Step; label: string }[] = [{ id: "details", label: "You" }, { id: "code", label: "Verify" }, { id: "account", label: "Disguise" }];

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-bold">{label}</span>{children}{hint && <span className="mt-1.5 block text-xs text-muted-foreground">{hint}</span>}</label>;
}

// Log in / Sign up switch with a pill that glides between the two.
function TabSwitch({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return <div className="relative mb-6 mt-8 grid grid-cols-2 rounded-lg border-2 border-foreground bg-muted p-1" role="tablist">
    {/* One pill sliding between the halves (shared-layout animation used to jump out and rejoin). */}
    <motion.span aria-hidden="true" className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-md border-2 border-foreground bg-primary shadow-hard-sm" initial={false} animate={{ x: tab === "login" ? "0%" : "100%" }} transition={{ type: "spring", stiffness: 420, damping: 34 }} />
    {(["login", "signup"] as const).map((t) => <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => onChange(t)} className={cn("relative z-10 h-9 rounded-md text-sm font-bold transition-colors", tab === t ? "text-primary-foreground" : "text-foreground hover:text-primary")}>
      {t === "login" ? "Log in" : "Sign up"}
    </button>)}
  </div>;
}

function Stepper({ step }: { step: Step }) {
  const at = STEPS.findIndex((s) => s.id === step);
  return <ol className="mb-5 flex items-center gap-2" aria-label="Sign-up progress">{STEPS.map((s, i) => <li key={s.id} className="flex flex-1 items-center gap-2">
    <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border-2 border-foreground text-[11px] font-bold transition-colors", i < at ? "bg-flag-green text-primary-foreground" : i === at ? "bg-primary text-primary-foreground" : "bg-card")} aria-current={i === at ? "step" : undefined}>{i < at ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}</span>
    <span className={cn("text-xs font-bold", i === at ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
    {i < STEPS.length - 1 && <span className="relative h-0.5 flex-1 overflow-hidden rounded-full bg-muted"><motion.span className="absolute inset-y-0 left-0 bg-foreground" animate={{ width: i < at ? "100%" : "0%" }} transition={{ duration: 0.35 }} /></span>}
  </li>)}</ol>;
}

function CodeInput({ value, onChange, onComplete }: { value: string; onChange: (v: string) => void; onComplete?: (v: string) => void }) {
  return <div>
    <span className="mb-2 block text-sm font-bold">Enter the 6-digit code</span>
    <InputOTP maxLength={6} value={value} onChange={(v) => { const digits = v.replace(/\D/g, ""); onChange(digits); if (digits.length === 6) onComplete?.(digits); }} inputMode="numeric" pattern="^[0-9]*$" autoFocus containerClassName="justify-between" aria-label="6-digit code">
      <InputOTPGroup className="w-full justify-between gap-2">{Array.from({ length: 6 }, (_, i) => <InputOTPSlot key={i} index={i} className="size-12 rounded-lg border-2 border-foreground bg-card font-display text-2xl font-bold first:rounded-lg first:border-l-2 last:rounded-lg sm:size-14" />)}</InputOTPGroup>
    </InputOTP>
  </div>;
}

function SentTo({ email, onChange }: { email: string; onChange: () => void }) {
  return <div className="flex items-center gap-3 rounded-lg border-2 border-foreground bg-card p-3">
    <MailCheck className="size-5 shrink-0 text-primary" />
    <p className="min-w-0 flex-1 truncate text-sm">Code sent to <strong>{email}</strong></p>
    <button type="button" onClick={onChange} className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"><Pencil className="size-3" />Change</button>
  </div>;
}

function Resend({ cooldown, disabled, onResend }: { cooldown: number; disabled: boolean; onResend: () => void }) {
  return <p className="text-xs text-muted-foreground">No email? Check spam, or <button type="button" disabled={cooldown > 0 || disabled} onClick={onResend} className="font-bold text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline">{cooldown > 0 ? `resend in ${cooldown}s` : "send a new code"}</button>.</p>;
}

// Fade in only: no sliding and no exit phase, so nothing collapses or jumps while content swaps.
const stepMotion = { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.2 } };

function AuthPage() {
  const navigate = useNavigate();
  const router = useRouter();
  // Fetch the dashboard's code in the background while the visitor types, so the jump after
  // logging in is instant instead of a second wait (noticeable on phones).
  useEffect(() => {
    const t = window.setTimeout(() => { router.preloadRoute({ to: "/dashboard" }).catch(() => {}); }, 1200);
    return () => window.clearTimeout(t);
  }, [router]);
  const [tab, setTab] = useState<Tab>(Route.useSearch().tab ?? "signup");
  const [step, setStep] = useState<Step>("details");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [looks, setLooks] = useState<Look[]>(initialLooks);
  const [chosen, setChosen] = useState(0);
  const [handle, setHandle] = useState(() => handleFromSeed("new-signup"));
  // A fresh random name each time the profile step opens (picked once there, not on every render);
  // the seeded one above only keeps the server and first browser render identical.
  useEffect(() => { if (step === "account") setHandle(randomHandle()); }, [step]);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [notice, setNotice] = useState<Notice>(null);
  const [recover, setRecover] = useState<Recover>(null);
  const [newPassword, setNewPassword] = useState("");
  // Two-step sign-in state: set when the password is right but a second factor is needed.
  const [mfa, setMfa] = useState<{ method: MfaMethod; ticket: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [resetNeedsAuth, setResetNeedsAuth] = useState(false);
  const look = looks[chosen] ?? looks[0]!;
  const account = useAccountActions();

  // Already logged in (the session cookie is still good)? Straight to the dashboard.
  const { returnTo = null, intent } = Route.useSearch();
  const { waiting } = useAuthGuard("public-only", { returnTo: intent === "share" ? "/dashboard?share=1" : returnTo });
  const goIn = () => {
    const back = safeReturnTo(returnTo);
    if (intent === "share") void navigate({ to: "/dashboard", search: { share: 1 } });
    else if (back) void navigate({ href: back });
    else void navigate({ to: "/dashboard" });
  };

  // Load the profile first so the dashboard opens already knowing who you are, with no flash.
  const enterDashboard = async (afterSignup = false) => {
    if (apiEnabled) {
      const profile = await account.refresh();
      if (!profile) {
        throw new ApiRequestError(
          401,
          "session_unavailable",
          afterSignup
            ? "Your account was created, but the browser could not keep you signed in. Please log in once more."
            : "Your details were accepted, but the browser could not keep you signed in. Please try again.",
        );
      }
    }
    goIn();
  };

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const shuffleLook = () => { setLooks(randomLooks()); setChosen(Math.floor(Math.random() * 8)); setHandle(randomHandle()); };
  const switchTab = (next: Tab) => { setTab(next); setRecover(null); setMfa(null); setNotice(null); };
  const failure = (err: unknown) => {
    if (err instanceof ApiRequestError && err.code === "email_exists") {
      setTab("login");
      setStep("details");
      setNotice({ tone: "info", text: "Plot twist: you're already one of us. We've moved you to log in—your inbox can stand down." });
      return;
    }
    setNotice({ tone: "error", text: err instanceof ApiRequestError ? (err.fields ? Object.values(err.fields)[0] ?? err.message : err.message) : "Couldn't reach Ghosted. Check your connection and try again." });
  };
  const run = async (task: () => Promise<void>) => { setNotice(null); setLoading(true); try { await task(); } catch (err) { failure(err); } finally { setLoading(false); } };

  // Ghosted Shield: token is built at submit time (single-use), then a fresh check starts.
  // If the server wants more proof, the widget escalates to the harder puzzle + drag challenge.
  const shield = useHumanCheck();
  const resolvedTheme = useResolvedTheme();
  const guarded = (task: (captchaToken: string | undefined) => Promise<void>) => run(async () => {
    let escalated = false;
    try { await task(shield.getToken()); }
    catch (err) {
      if (err instanceof ApiRequestError && err.code === "captcha_escalate") { escalated = true; shield.escalate(); }
      throw err;
    } finally { if (!escalated) shield.reset(); }
  });
  const needsShield = (tab === "login" && recover !== "reset" && !mfa) || (tab === "signup" && step === "details");
  const shieldReady = !apiEnabled || shield.status === "done";

  // Without an API (mock mode), every step is simulated, and any 6 digits work.
  const sendCode = () => guarded(async (ct) => {
    if (apiEnabled) await authApi.sendCode(email, fullName, ct, resolvedTheme);
    setCode(""); setCooldown(60); setStep("code");
    setNotice({ tone: "info", text: apiEnabled ? `We sent a 6-digit code to ${email}. It expires in 10 minutes.` : "Demo mode: any 6 digits will work." });
  });

  const verify = (value = code) => run(async () => {
    setToken(apiEnabled ? (await authApi.verifyCode(email, value)).verificationToken : "demo");
    setStep("account");
  });

  const createAccount = () => run(async () => {
    // An invite code remembered from /invite?ref=… gives the inviter credit once you share a story.
    const ref = pendingRef();
    if (apiEnabled) { await authApi.signup({ fullName, email, password, verificationToken: token, handle, avatarSeed: look.seed, pastel: look.pastel, acceptTerms: true, ...(ref && { ref }) }); clearRef(); }
    await enterDashboard(true);
  });

  const login = () => guarded(async (ct) => {
    if (apiEnabled) {
      const r = await authApi.login(email, password, ct);
      // Two-step sign-in: the password was right, now the second factor.
      if ("mfaRequired" in r) {
        setMfa({ method: r.method, ticket: r.ticket }); setMfaCode(""); setUseRecovery(false); setCooldown(r.method === "email" ? 60 : 0);
        setNotice({ tone: "info", text: r.method === "email" ? `We emailed a 6-digit sign-in code to ${email}.` : "Open your authenticator app and enter the 6-digit code for Ghosted." });
        return;
      }
      if (r.profile) { account.prime(r.profile); goIn(); return; }
    }
    await enterDashboard();
  });

  const finishMfa = (value = mfaCode) => run(async () => {
    if (!mfa) return;
    const r = await authApi.loginMfa(mfa.ticket, value);
    if (r.usedRecoveryCode) toast.info("Recovery code used. Each one works once; you can make new ones in Settings.");
    await enterDashboard();
  });

  const resendMfa = () => run(async () => {
    if (!mfa) return;
    await authApi.resendMfa(mfa.ticket);
    setCooldown(60);
    setNotice({ tone: "info", text: `New code sent to ${email}.` });
  });

  // Forgot password: "email" asks where to send a code; "reset" takes the code + a new password.
  const startRecovery = () => { setRecover("email"); setCode(""); setNewPassword(""); setNotice(null); };
  const endRecovery = () => { setRecover(null); setNotice(null); };

  const sendReset = () => guarded(async (ct) => {
    // With an authenticator app on, the reset also needs a code from it (the server enforces this).
    if (apiEnabled) setResetNeedsAuth((await authApi.forgotPassword(email, ct)).needsAuthenticator);
    setCode(""); setMfaCode(""); setCooldown(60); setRecover("reset");
    setNotice({ tone: "info", text: apiEnabled ? `Code sent to ${email}. It expires in 10 minutes.` : "Demo mode: any 6 digits will work." });
  });

  const resetPassword = () => run(async () => {
    if (apiEnabled) await authApi.resetPassword(email, code, newPassword, resetNeedsAuth ? mfaCode : undefined);
    await enterDashboard();
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (tab === "login" && recover === "email") return void sendReset();
    if (tab === "login" && recover === "reset") return void resetPassword();
    if (tab === "login" && mfa) return void finishMfa();
    if (tab === "login") return void login();
    if (step === "details") return void sendCode();
    if (step === "code") return void verify();
    if (agreed) void createAccount();
  };

  const spinner = (label: string) => <><Loader2 className="animate-spin" />{label}</>;

  // The page scrolls normally (scrollbar at the window's edge) and moves the form; the showcase is
  // sticky, one screen tall, so it stays put and never stretches to match a long form.
  if (waiting) return <Preloader />;

  return <main className="grid min-h-screen lg:grid-cols-2 lg:items-start">
    <section className="flex min-h-screen flex-col p-5 sm:p-10">
      <div className="flex items-center justify-between gap-3">
        <Link to="/" className="group inline-flex w-fit items-center gap-2 font-display text-xl font-bold" aria-label="Back to Ghosted home">
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" />
          <img src="/ghosted-mark.png" alt="" className="size-8 object-contain" />Ghosted.
        </Link>
        <ThemeToggle />
      </div>
      {/* Anchored to the top (not vertically centred), so the heading never moves when the form's height changes. */}
      <div className="mx-auto w-full max-w-md pb-10 pt-10 lg:pt-16">
        <motion.div key={tab} {...stepMotion}>
          <h1 className="text-4xl font-bold">{tab === "signup" ? <>Come for the tea.<br />Stay for the receipts.</> : <>Welcome back.<br />The tea's still hot.</>}</h1>
          <p className="mt-3 text-muted-foreground">{tab === "signup" ? "Real name for trust. Fake name for everyone else." : "Log in to share, react and keep receipts."}</p>
        </motion.div>

        <TabSwitch tab={tab} onChange={switchTab} />

        <form onSubmit={submit} className="space-y-4">
            {tab === "login" && mfa && !recover && <motion.div key={`mfa-${useRecovery}`} {...stepMotion} className="space-y-4">
              <button type="button" onClick={() => { setMfa(null); setNotice(null); }} className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"><ArrowLeft className="size-4" />Back to log in</button>
              <div className="flex items-start gap-3 rounded-xl border-2 border-foreground bg-accent p-4">
                <ShieldCheck className="mt-0.5 size-5 shrink-0" />
                <div><p className="font-bold">Two-step sign-in</p><p className="text-sm text-muted-foreground">{useRecovery ? "Enter one of the recovery codes you saved when you set this up. Each works once." : mfa.method === "totp" ? "Password: correct. Now the code from your authenticator app." : "Password: correct. Now the 6-digit code we just emailed you."}</p></div>
              </div>
              {useRecovery
                ? <Field label="Recovery code"><Input autoFocus autoComplete="one-time-code" value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} placeholder="xxxx-xxxx" maxLength={9} className={cn(inputClass, "font-mono tracking-wider")} /></Field>
                : <CodeInput value={mfaCode} onChange={setMfaCode} onComplete={(v) => void finishMfa(v)} />}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                {mfa.method === "email" && !useRecovery ? <Resend cooldown={cooldown} disabled={loading} onResend={() => void resendMfa()} /> : <span />}
                <button type="button" onClick={() => { setUseRecovery(!useRecovery); setMfaCode(""); }} className="font-bold text-primary hover:underline">{useRecovery ? "Use a 6-digit code instead" : "Lost access? Use a recovery code"}</button>
              </div>
            </motion.div>}

            {tab === "login" && !recover && !mfa && <motion.div key="login" {...stepMotion} className="space-y-4">
              <Field label="Email"><Input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@somewhere.com" maxLength={254} className={inputClass} /></Field>
              <div>
                <div className="mb-1.5 flex items-center justify-between"><span className="text-sm font-bold">Password</span><button type="button" onClick={startRecovery} className="text-xs font-semibold text-primary hover:underline">Forgot password?</button></div>
                <PasswordInput required aria-label="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" maxLength={72} className={inputClass} />
              </div>
            </motion.div>}

            {tab === "login" && recover && <motion.div key={`recover-${recover}`} {...stepMotion} className="space-y-4">
              <button type="button" onClick={endRecovery} className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"><ArrowLeft className="size-4" />Back to log in</button>
              <div className="flex items-start gap-3 rounded-xl border-2 border-foreground bg-accent p-4">
                <KeyRound className="mt-0.5 size-5 shrink-0" />
                <div><p className="font-bold">{recover === "email" ? "Forgot your password?" : "Choose a new password"}</p><p className="text-sm text-muted-foreground">{recover === "email" ? "Happens to the best of us. We'll email you a 6-digit code. Unlike recruiters, we actually reply." : "Enter the code from your email, then pick something new. Other devices get logged out."}</p></div>
              </div>
              {recover === "email" && <Field label="Email" hint="The one you signed up with."><Input required type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@somewhere.com" maxLength={254} className={inputClass} /></Field>}
              {recover === "reset" && <>
                <SentTo email={email} onChange={() => { setRecover("email"); setNotice(null); }} />
                <CodeInput value={code} onChange={setCode} />
                <Resend cooldown={cooldown} disabled={loading} onResend={() => void sendReset()} />
                <Field label="New password" hint="At least 10 characters. A short sentence works great."><PasswordInput required autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 10 characters" minLength={10} maxLength={72} className={inputClass} /></Field>
                <PasswordStrength password={newPassword} personal={[email]} />
                {resetNeedsAuth && <Field label="Authenticator code" hint="Your account has an authenticator app, so resetting needs it too. A recovery code also works."><Input autoComplete="one-time-code" value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} placeholder="123456 or xxxx-xxxx" maxLength={9} className={cn(inputClass, "font-mono tracking-wider")} /></Field>}
              </>}
            </motion.div>}

            {tab === "signup" && <motion.div key="signup" {...stepMotion}>
              <Stepper step={step} />
                {step === "details" && <motion.div key="details" {...stepMotion} className="space-y-4">
                  <Field label="Full name" hint={<span className="flex items-start gap-1.5"><Lock className="mt-0.5 size-3 shrink-0" />As on your ID. Encrypted, and never shown to anyone, including companies, unless you choose to go public in settings.</span>}>
                    <Input required autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Priya Sharma" minLength={2} maxLength={80} className={inputClass} />
                  </Field>
                  <Field label="Email" hint="We'll send a 6-digit code to prove it's really you."><Input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@somewhere.com" maxLength={254} className={inputClass} /></Field>
                </motion.div>}

                {step === "code" && <motion.div key="code" {...stepMotion} className="space-y-4">
                  <SentTo email={email} onChange={() => { setStep("details"); setNotice(null); }} />
                  <CodeInput value={code} onChange={setCode} onComplete={(v) => void verify(v)} />
                  <Resend cooldown={cooldown} disabled={loading} onResend={() => void sendCode()} />
                </motion.div>}

                {step === "account" && <motion.div key="account" {...stepMotion} className="space-y-4">
                  <p className="flex items-center gap-2 rounded-lg border-2 border-foreground bg-card p-3 text-sm"><Check className="size-4 shrink-0 text-flag-green" strokeWidth={3} /><span className="truncate"><strong>{email}</strong> verified</span></p>
                  <Field label="Create a password" hint="At least 10 characters. A short sentence works great."><PasswordInput required autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 10 characters" minLength={10} maxLength={72} className={inputClass} /></Field>
                  <PasswordStrength password={password} personal={[fullName, email]} />
                  <div className="rounded-xl border-2 border-foreground bg-card p-4">
                    <div className="flex items-center justify-between">
                      <div><p className="text-sm font-bold">Your undercover look</p><p className="text-xs text-muted-foreground">This face and name are all anyone will see.</p></div>
                      <Button type="button" size="sm" variant="outline" onClick={shuffleLook} aria-label="Randomise face and name"><Dices />Randomise</Button>
                    </div>
                    <div className="mt-4 flex flex-wrap justify-between gap-2" role="radiogroup" aria-label="Choose an avatar">
                      {looks.map((l, i) => <button key={l.seed} type="button" role="radio" aria-checked={chosen === i} aria-label={`Avatar ${i + 1}`} onClick={() => setChosen(i)} className={cn("grid size-11 shrink-0 place-items-center rounded-full outline-none ring-offset-2 ring-offset-card transition focus-visible:ring-2 focus-visible:ring-foreground", chosen === i ? "ring-[3px] ring-primary" : "opacity-80 hover:opacity-100")}><Avatar seed={l.seed} pastel={l.pastel} size="sm" /></button>)}
                    </div>
                    <div className="mt-4 flex items-center gap-3 rounded-lg border-2 border-foreground bg-background p-3">
                      <motion.div key={look.seed} initial={{ scale: 0.6, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 400, damping: 14 }}><Avatar seed={look.seed} pastel={look.pastel} size="sm" label={handle} /></motion.div>
                      <div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">Your anonymous handle</p><motion.p key={handle} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="truncate font-bold">{handle}</motion.p></div>
                      <Button type="button" size="icon" variant="ghost" aria-label="New name, same face" onClick={() => setHandle(randomHandle())}><RefreshCw /></Button>
                    </div>
                  </div>
                  <label className="flex cursor-pointer items-start gap-3 text-sm">
                    <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} className="mt-0.5 border-2 border-foreground" aria-required="true" />
                    <span>I'm 18 or older and agree to the <Link to="/terms" target="_blank" className="font-bold text-primary underline-offset-2 hover:underline">Terms & Conditions</Link> and <Link to="/privacy" target="_blank" className="font-bold text-primary underline-offset-2 hover:underline">Privacy Policy</Link>.</span>
                  </label>
                </motion.div>}
            </motion.div>}

          {needsShield && <HumanCheck shield={shield} />}

          {notice && <p role={notice.tone === "error" ? "alert" : "status"} className={cn("rounded-lg border-2 border-foreground p-3 text-sm font-semibold", notice.tone === "error" ? "bg-flag-red text-primary-foreground" : "bg-accent")}>{notice.text}</p>}

          <Button className="w-full" size="lg" disabled={loading || (needsShield && !shieldReady) ||(tab === "signup" && ((step === "account" && !agreed) || (step === "code" && code.length < 6))) || (tab === "login" && recover === "reset" && (code.length < 6 || newPassword.length < 10 || (resetNeedsAuth && mfaCode.length < 6))) || (tab === "login" && !!mfa && !recover && mfaCode.trim().length < (useRecovery ? 9 : 6))}>
            {tab === "login" && mfa && !recover ? (loading ? spinner("Checking…") : "Verify & log in")
              : tab === "login" && recover === "email" ? (loading ? spinner("Sending your code…") : "Email me a reset code")
              : tab === "login" && recover === "reset" ? (loading ? spinner("Updating…") : "Reset password & log in")
              : tab === "login" ? (loading ? spinner("Sneaking you in…") : "Log in")
              : step === "details" ? (loading ? spinner("Sending your code…") : "Send verification code")
              : step === "code" ? (loading ? spinner("Checking…") : "Verify email")
              : loading ? spinner("Building your disguise…") : agreed ? "Create anonymous account" : "Tick the box above to continue"}
          </Button>
        </form>

        {/* Icon sits inline with the first word, so it stays beside the text when the line wraps. */}
        <p className="mt-6 text-balance text-center text-xs text-muted-foreground"><ShieldCheck className="mr-1.5 inline size-4 -translate-y-px align-middle text-flag-green" />You're anonymous by default. Change what you share anytime in settings.</p>
      </div>
    </section>
    <AuthShowcase />
  </main>;
}
