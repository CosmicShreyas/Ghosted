// Admin sign-in (email, password and the same human check as the site), and setting your password
// the first time (or after forgetting it): a 6-digit code emailed to an address in ADMIN_EMAILS.
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Eye, EyeOff, KeyRound, Loader2, Lock, MailCheck, ShieldCheck, Smartphone } from "lucide-react";
import { HumanCheck, useHumanCheck } from "@/components/human-check";
import { ThemeToggle } from "@/components/theme-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { ApiRequestError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { adminApi, deviceId, session, type AdminMe, type Tokens } from "./api";

const field = "h-11 rounded-lg border-2 border-foreground bg-background";
const explain = (err: unknown) => (err instanceof ApiRequestError ? (err.status === 404 ? "The admin panel isn't enabled for this address (ADMIN_ORIGINS)." : err.fields ? Object.values(err.fields)[0] ?? err.message : err.message) : "Couldn't reach the server.");

function PasswordInput({ value, onChange, autoComplete, label }: { value: string; onChange: (v: string) => void; autoComplete: string; label: string }) {
  const [show, setShow] = useState(false);
  return <label className="mt-4 block"><span className="mb-1.5 block text-sm font-bold">{label}</span>
    <span className="relative block">
      <Input type={show ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} className={cn(field, "pr-11")} required />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md hover:bg-muted">{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
    </span></label>;
}

// Two-step sign-in: the code from an authenticator app or the email we just sent, or a recovery code.
function SecondStep({ method, ticket, onBack, onSignedIn }: { method: "totp" | "email"; ticket: string; onBack: () => void; onSignedIn: (a: AdminMe) => void }) {
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (value = code) => {
    if (busy) return;
    setBusy(true); setError(null);
    try { const r = await adminApi<Tokens & { admin: AdminMe }>("/login/mfa", { method: "POST", body: { ticket, code: value } }); session.set(r); onSignedIn(r.admin); }
    catch (err) { setError(explain(err)); setCode(""); }
    finally { setBusy(false); }
  };
  return <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
    <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Back</button>
    <span className="grid size-12 place-items-center rounded-xl border-2 border-foreground bg-accent"><Smartphone className="size-5" /></span>
    <h1 className="mt-4 font-display text-3xl font-bold">Two-step sign-in</h1>
    <p className="mt-1 text-sm text-muted-foreground">{recovery ? "Enter one of the recovery codes you saved. Each works once." : method === "totp" ? "Password: correct. Now the 6-digit code from your authenticator app." : "Password: correct. Now the 6-digit code we just emailed you."}</p>
    {method !== "totp" && !recovery && <p role="note" className="mt-3 rounded-lg border-2 border-foreground bg-[#FDF3B4] p-3 text-sm text-[#141110]"><mark className="rounded bg-[#FACC15] px-1 font-bold text-[#141110]">Can't see it? Check your Spam and Promotions folders.</mark> Mark it "Not spam" so the next one reaches your inbox. Still nothing? Go back and sign in again for a new code.</p>}
    <div className="mt-6">{recovery
      ? <Input value={code} onChange={(e) => setCode(e.target.value.toLowerCase().slice(0, 9))} placeholder="abcd-2345" autoComplete="one-time-code" className={cn(field, "font-mono")} autoFocus />
      : <InputOTP maxLength={6} value={code} onChange={(v) => { const d = v.replace(/\D/g, ""); setCode(d); if (d.length === 6) void submit(d); }} inputMode="numeric" pattern="^[0-9]*$" autoFocus containerClassName="justify-between" aria-label="6-digit code">
          <InputOTPGroup className="w-full justify-between gap-1.5 sm:gap-2">{Array.from({ length: 6 }, (_, i) => <InputOTPSlot key={i} index={i} className="size-10 rounded-lg border-2 border-foreground bg-card font-display text-xl font-bold first:rounded-lg first:border-l-2 last:rounded-lg sm:size-14 sm:text-2xl" />)}</InputOTPGroup>
        </InputOTP>}</div>
    {error && <p role="alert" className="mt-4 rounded-lg border-2 border-flag-red bg-flag-red/10 p-3 text-sm font-semibold text-flag-red">{error}</p>}
    <Button type="submit" size="lg" className="mt-5 w-full" disabled={busy || code.length < 6}>{busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />}Verify and sign in</Button>
    <button type="button" onClick={() => { setRecovery((r) => !r); setCode(""); setError(null); }} className="mt-4 w-full text-center text-sm font-semibold text-primary hover:underline">{recovery ? "Use a 6-digit code instead" : "Lost your device? Use a recovery code"}</button>
  </form>;
}

function SignIn({ onSignedIn, onSetup, notice }: { onSignedIn: (a: AdminMe) => void; onSetup: (email: string) => void; notice: string | null }) {
  const shield = useHumanCheck();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mfa, setMfa] = useState<{ method: "totp" | "email"; ticket: string } | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return setError("Enter your email and password.");
    const captchaToken = shield.getToken();
    if (!captchaToken) return setError("Let the human check finish first.");
    setBusy(true); setError(null);
    try {
      const r = await adminApi<(Tokens & { admin: AdminMe }) | { mfaRequired: true; method: "totp" | "email"; ticket: string }>("/login", { method: "POST", body: { email, password, captchaToken, device: deviceId() } });
      if ("mfaRequired" in r) { setMfa({ method: r.method, ticket: r.ticket }); return; }
      session.set(r);
      onSignedIn(r.admin);
    } catch (err) { setError(explain(err)); shield.reset(); }
    finally { setBusy(false); setPassword(""); }
  };
  if (mfa) return <SecondStep {...mfa} onBack={() => { setMfa(null); shield.reset(); }} onSignedIn={onSignedIn} />;
  return <form onSubmit={(e) => void submit(e)}>
    <span className="grid size-12 place-items-center rounded-xl border-2 border-foreground bg-accent"><KeyRound className="size-5" /></span>
    <h1 className="mt-4 font-display text-3xl font-bold">Sign in</h1>
    <p className="mt-1 text-sm text-muted-foreground">For the Ghosted team only. Every action here is logged.</p>
    {notice && <p className="mt-4 rounded-lg border-2 border-flag-green bg-flag-green/10 p-3 text-sm font-semibold">{notice}</p>}
    <label className="mt-6 block"><span className="mb-1.5 block text-sm font-bold">Email</span>
      <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={field} required /></label>
    <PasswordInput label="Password" autoComplete="current-password" value={password} onChange={setPassword} />
    <div className="mt-4"><HumanCheck shield={shield} /></div>
    {error && <p role="alert" className="mt-4 rounded-lg border-2 border-flag-red bg-flag-red/10 p-3 text-sm font-semibold text-flag-red">{error}</p>}
    <Button type="submit" size="lg" className="mt-5 w-full" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Lock />}Sign in</Button>
    <button type="button" onClick={() => onSetup(email)} className="mt-4 w-full text-center text-sm font-semibold text-primary hover:underline">First time here, or forgot your password?</button>
    <p className="mt-4 flex items-start gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-flag-green" />Five wrong passwords lock the account for 15 minutes. You stay signed in on this browser for up to 7 days, or until you sign out.</p>
  </form>;
}

function SetPassword({ initialEmail, onBack, onDone }: { initialEmail: string; onBack: () => void; onDone: (msg: string) => void }) {
  const shield = useHumanCheck();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const captchaToken = shield.getToken();
    if (!captchaToken) return setError("Let the human check finish first.");
    setBusy(true); setError(null);
    // The email comes in the panel's current theme, like the site's emails follow your setting.
    const theme = document.documentElement.classList.contains("dark") ? "dark" : "light";
    try { await adminApi("/setup/start", { method: "POST", body: { email, captchaToken, theme } }); setStep("code"); }
    catch (err) { setError(explain(err)); shield.reset(); }
    finally { setBusy(false); }
  };
  const finish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 14) return setError("Use at least 14 characters. Four or five random words work well.");
    if (password !== again) return setError("The two passwords don't match.");
    setBusy(true); setError(null);
    try { const r = await adminApi<{ message: string }>("/setup/finish", { method: "POST", body: { email, code, password } }); onDone(r.message); }
    catch (err) { setError(explain(err)); }
    finally { setBusy(false); }
  };

  return <div>
    <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Back to sign in</button>
    <span className="grid size-12 place-items-center rounded-xl border-2 border-foreground bg-accent"><MailCheck className="size-5" /></span>
    <h1 className="mt-4 font-display text-3xl font-bold">Set your password</h1>
    <AnimatePresence mode="wait" initial={false}>
      {step === "email" ? <motion.form key="email" onSubmit={(e) => void send(e)} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
        <p className="mt-1 text-sm text-muted-foreground">Enter your admin email and we'll send you a 6-digit code. Only emails on the admin team work.</p>
        <label className="mt-6 block"><span className="mb-1.5 block text-sm font-bold">Email</span>
          <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={field} required /></label>
        <div className="mt-4"><HumanCheck shield={shield} /></div>
        {error && <p role="alert" className="mt-4 rounded-lg border-2 border-flag-red bg-flag-red/10 p-3 text-sm font-semibold text-flag-red">{error}</p>}
        <Button type="submit" size="lg" className="mt-5 w-full" disabled={busy || !email}>{busy ? <Loader2 className="animate-spin" /> : <MailCheck />}Email me a code</Button>
      </motion.form> : <motion.form key="code" onSubmit={(e) => void finish(e)} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
        <p className="mt-1 text-sm text-muted-foreground">We sent a code to <span className="font-semibold text-foreground">{email}</span>. It works for 15 minutes.</p>
        <p role="note" className="mt-3 rounded-lg border-2 border-foreground bg-[#FDF3B4] p-3 text-sm text-[#141110]"><mark className="rounded bg-[#FACC15] px-1 font-bold text-[#141110]">Can't see it? Check your Spam and Promotions folders.</mark> Mark it "Not spam" so the next one reaches your inbox. Still nothing? Use "Send a new code" below.</p>
        <div className="mt-6"><span className="mb-1.5 block text-sm font-bold">6-digit code</span>
          {/* Same boxes as the site's sign-in codes. */}
          <InputOTP maxLength={6} value={code} onChange={(v) => setCode(v.replace(/\D/g, ""))} inputMode="numeric" pattern="^[0-9]*$" autoFocus containerClassName="justify-between" aria-label="6-digit code">
            <InputOTPGroup className="w-full justify-between gap-1.5 sm:gap-2">{Array.from({ length: 6 }, (_, i) => <InputOTPSlot key={i} index={i} className="size-10 rounded-lg border-2 border-foreground bg-card font-display text-xl font-bold first:rounded-lg first:border-l-2 last:rounded-lg sm:size-14 sm:text-2xl" />)}</InputOTPGroup>
          </InputOTP></div>
        <PasswordInput label="New password (at least 14 characters)" autoComplete="new-password" value={password} onChange={setPassword} />
        <PasswordInput label="Same password again" autoComplete="new-password" value={again} onChange={setAgain} />
        {error && <p role="alert" className="mt-4 rounded-lg border-2 border-flag-red bg-flag-red/10 p-3 text-sm font-semibold text-flag-red">{error}</p>}
        <Button type="submit" size="lg" className="mt-5 w-full" disabled={busy || code.length !== 6}>{busy ? <Loader2 className="animate-spin" /> : <Lock />}Set password</Button>
        <button type="button" onClick={() => { setStep("email"); setCode(""); setError(null); shield.reset(); }} className="mt-4 w-full text-center text-sm font-semibold text-primary hover:underline">Didn't get it? Send a new code</button>
      </motion.form>}
    </AnimatePresence>
  </div>;
}

export function Login({ onSignedIn }: { onSignedIn: (a: AdminMe) => void }) {
  const [mode, setMode] = useState<"signin" | "setup">("signin");
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  return <div className="relative grid min-h-screen place-items-center bg-background p-4">
    {/* Light / dark, same switch as the site (remembered in this browser). */}
    <div className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))]"><ThemeToggle className="size-10" /></div>
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 200, damping: 22 }} className="w-full max-w-md">
      <div className="mb-6 flex items-center gap-2 font-display text-2xl font-bold"><img src="/ghosted-mark.png" alt="" className="size-10 object-contain" />Ghosted.<span className="rounded-full border-2 border-foreground bg-foreground px-2 py-0.5 text-xs font-bold uppercase text-background">Admin</span></div>
      <div className="rounded-xl border-2 border-foreground bg-card p-6 shadow-hard sm:p-8">
        {mode === "signin"
          ? <SignIn onSignedIn={onSignedIn} notice={notice} onSetup={(e) => { setEmail(e); setNotice(null); setMode("setup"); }} />
          : <SetPassword initialEmail={email} onBack={() => setMode("signin")} onDone={(msg) => { setNotice(msg); setMode("signin"); }} />}
      </div>
    </motion.div>
  </div>;
}
