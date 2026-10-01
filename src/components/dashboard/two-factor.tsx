import { useEffect, useState } from "react";
import { motion } from "motion/react";
import QRCode from "qrcode";
import { Check, Copy, Download, KeyRound, Loader2, Mail, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiRequestError, apiEnabled, mfaApi } from "@/lib/api";
import { useTone, voice, type Me } from "@/lib/session";
import { cn } from "@/lib/utils";
import { card } from "./widgets";

// Settings → Two-factor authentication.
// Authenticator app (TOTP) is the recommended option; email codes are easier but weaker, since
// anyone with access to your inbox gets both the reset link and the second factor.

type Flow =
  | { step: "idle" }
  | { step: "totp"; secret: string; qr: string }
  | { step: "email" }
  | { step: "codes"; codes: string[] }
  | { step: "manage"; action: "disable" | "recovery" };

const errorText = (err: unknown) => (err instanceof ApiRequestError ? (err.fields ? Object.values(err.fields)[0] ?? err.message : err.message) : "Something went wrong. Try again.");

function CodeField({ value, onChange, allowRecovery = false, autoFocus = true }: { value: string; onChange: (v: string) => void; allowRecovery?: boolean; autoFocus?: boolean }) {
  return <Input autoFocus={autoFocus} inputMode={allowRecovery ? "text" : "numeric"} autoComplete="one-time-code" value={value} maxLength={allowRecovery ? 9 : 6}
    onChange={(e) => onChange(allowRecovery ? e.target.value : e.target.value.replace(/\D/g, ""))}
    placeholder={allowRecovery ? "123456 or xxxx-xxxx" : "123456"} className="h-11 max-w-56 border-2 border-foreground text-center font-mono text-lg tracking-[0.3em]" aria-label="Code" />;
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const tone = useTone();
  const text = `Ghosted recovery codes (each works once)\n\n${codes.join("\n")}\n`;
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "ghosted-recovery-codes.txt", style: "display:none" });
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };
  return <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
    <div className="rounded-lg border-2 border-foreground bg-accent p-4 text-sm"><p className="font-bold">Save these recovery codes now.</p><p className="mt-1">{voice(tone, "Lose your phone? These get you back in. We'll only show them once, unlike recruiters who show up in your inbox forever.", "If you lose access to your second factor, each of these codes lets you sign in once. They won't be shown again.")}</p></div>
    <div className="grid grid-cols-2 gap-2 rounded-lg border-2 border-foreground bg-background p-4 font-mono text-sm sm:grid-cols-4">{codes.map((c) => <span key={c} className="rounded bg-muted px-2 py-1 text-center">{c}</span>)}</div>
    <div className="flex flex-wrap gap-3">
      <Button variant="outline" onClick={async () => { await navigator.clipboard.writeText(text); toast.success("Copied. Paste them somewhere safe."); }}><Copy />Copy</Button>
      <Button variant="outline" onClick={download}><Download />Download .txt</Button>
      <Button onClick={onDone}><Check />I've saved them</Button>
    </div>
  </motion.div>;
}

export function TwoFactorSection({ me }: { me: Me }) {
  const qc = useQueryClient();
  const tone = useTone();
  const [flow, setFlow] = useState<Flow>({ step: "idle" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const method = me.mfa.method;
  const refresh = () => qc.invalidateQueries({ queryKey: ["me"] });
  useEffect(() => { setCode(""); }, [flow.step]);

  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (err) { toast.error(errorText(err)); } finally { setBusy(false); } };
  const needsApi = () => { if (!apiEnabled) { toast.info("Two-factor needs the Ghosted API to be connected."); return true; } return false; };

  const startTotp = () => { if (needsApi()) return; void run(async () => {
    const { secret, uri } = await mfaApi.startTotp();
    // Drawn in the browser: the secret never goes to any QR service.
    const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220, color: { dark: "#141110", light: "#FFFFFF" } });
    setFlow({ step: "totp", secret, qr });
  }); };
  const confirmTotp = () => void run(async () => { const { recoveryCodes } = await mfaApi.confirmTotp(code); await refresh(); setFlow({ step: "codes", codes: recoveryCodes }); toast.success(voice(tone, "Authenticator on. Recruiters now need your phone too.", "Authenticator app turned on.")); });
  const startEmail = () => { if (needsApi()) return; void run(async () => { await mfaApi.startEmail(); setFlow({ step: "email" }); toast.success("Code sent. Check your inbox."); }); };
  const confirmEmail = () => void run(async () => { const { recoveryCodes } = await mfaApi.confirmEmail(code); await refresh(); setFlow({ step: "codes", codes: recoveryCodes }); toast.success("Email codes turned on."); });
  const manage = (action: "disable" | "recovery") => { setFlow({ step: "manage", action }); if (method === "email") void run(async () => { await mfaApi.sendCode(); toast.success("We emailed you a code to confirm."); }); };
  const confirmManage = (action: "disable" | "recovery") => void run(async () => {
    if (action === "disable") { await mfaApi.disable(code); await refresh(); setFlow({ step: "idle" }); toast.success(voice(tone, "Two-step sign-in is off. Living dangerously.", "Two-step sign-in turned off.")); }
    else { const { recoveryCodes } = await mfaApi.newRecoveryCodes(code); await refresh(); setFlow({ step: "codes", codes: recoveryCodes }); }
  });

  const status = method === "none" ? { label: "Off", cls: "bg-muted" } : { label: method === "totp" ? "Authenticator app" : "Email codes", cls: "bg-flag-green text-primary-foreground" };

  return <section className={cn(card, "p-6")}>
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg border-2 border-foreground bg-accent"><KeyRound className="size-5" /></span>
        <div><h3 className="font-display text-xl font-bold">Two-step sign-in</h3><p className="mt-0.5 text-sm text-muted-foreground">{voice(tone, "Your password plus a second code. Even if someone guesses your password, they're still stuck in round one.", "Sign in with your password and a second code for extra protection.")}</p></div>
      </div>
      <span className={cn("shrink-0 rounded-full border-2 border-foreground px-2.5 py-0.5 text-[11px] font-bold uppercase", status.cls)}>{status.label}</span>
    </div>

    <div className="mt-5">
      {flow.step === "codes" && <RecoveryCodes codes={flow.codes} onDone={() => setFlow({ step: "idle" })} />}

      {flow.step === "idle" && method === "none" && <div className="grid gap-3 md:grid-cols-2">
        <button type="button" disabled={busy} onClick={startTotp} className="card-lift rounded-xl border-2 border-foreground bg-background p-4 text-left shadow-hard-sm disabled:opacity-60">
          <div className="flex items-center justify-between"><Smartphone className="size-6 text-primary" /><span className="rounded-full border-2 border-foreground bg-flag-green px-2 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">Recommended</span></div>
          <p className="mt-3 font-bold">Authenticator app</p>
          <p className="mt-1 text-xs text-muted-foreground">Google Authenticator, Authy, 1Password or any TOTP app. Works offline, and nobody can intercept it.</p>
        </button>
        <button type="button" disabled={busy} onClick={startEmail} className="card-lift rounded-xl border-2 border-foreground bg-background p-4 text-left shadow-hard-sm disabled:opacity-60">
          <div className="flex items-center justify-between"><Mail className="size-6 text-primary" /><span className="rounded-full border-2 border-foreground bg-flag-amber px-2 py-0.5 text-[10px] font-bold uppercase">Less secure</span></div>
          <p className="mt-3 font-bold">Email codes</p>
          <p className="mt-1 text-xs text-muted-foreground">A 6-digit code in your inbox each time you sign in. Easier, but anyone with access to your email gets it too.</p>
        </button>
      </div>}

      {flow.step === "totp" && <div className="grid items-start gap-5 md:grid-cols-[auto_1fr]">
        <img src={flow.qr} alt="QR code to scan with your authenticator app" className="size-48 rounded-lg border-2 border-foreground bg-card p-2" />
        <div className="space-y-3">
          <ol className="list-decimal space-y-1 pl-5 text-sm"><li>Open your authenticator app and scan the QR code.</li><li>Can't scan? Enter this key manually:</li></ol>
          <button type="button" onClick={async () => { await navigator.clipboard.writeText(flow.secret); toast.success("Key copied."); }} className="flex w-full items-center justify-between gap-2 rounded-lg border-2 border-foreground bg-muted px-3 py-2 text-left font-mono text-xs tracking-wider hover:bg-background"><span className="break-all">{flow.secret.match(/.{1,4}/g)?.join(" ")}</span><Copy className="size-4 shrink-0" /></button>
          <p className="text-sm font-bold">3. Enter the 6-digit code it shows</p>
          <div className="flex flex-wrap gap-3"><CodeField value={code} onChange={setCode} /><Button disabled={busy || code.length !== 6} onClick={confirmTotp}>{busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />}Turn on</Button><Button variant="ghost" onClick={() => setFlow({ step: "idle" })}>Cancel</Button></div>
        </div>
      </div>}

      {flow.step === "email" && <div className="space-y-3">
        <p className="text-sm">We sent a 6-digit code to your email. Enter it to turn on email codes.</p>
        <div className="flex flex-wrap gap-3"><CodeField value={code} onChange={setCode} /><Button disabled={busy || code.length !== 6} onClick={confirmEmail}>{busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />}Turn on</Button><Button variant="ghost" onClick={() => setFlow({ step: "idle" })}>Cancel</Button></div>
      </div>}

      {flow.step === "idle" && method !== "none" && <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-lg border-2 border-foreground bg-background p-3">
          {method === "totp" ? <Smartphone className="size-5 shrink-0" /> : <Mail className="size-5 shrink-0" />}
          <div className="min-w-0 flex-1"><p className="text-sm font-bold">{method === "totp" ? "Authenticator app is on" : "Email codes are on"}</p><p className="text-xs text-muted-foreground">{me.mfa.recoveryLeft} of 8 recovery codes left{me.mfa.recoveryLeft <= 2 ? ". Make new ones soon." : "."}</p></div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => manage("recovery")}><KeyRound />New recovery codes</Button>
          <Button variant="outline" onClick={() => manage("disable")}><ShieldOff />Turn off</Button>
        </div>
        {method === "email" && <p className="text-xs text-muted-foreground">Want stronger protection? Turn email codes off, then set up an authenticator app.</p>}
      </div>}

      {flow.step === "manage" && <div className="space-y-3">
        <p className="text-sm">{flow.action === "disable" ? "To turn off two-step sign-in, confirm it's you." : "Your old recovery codes stop working as soon as new ones are made. Confirm it's you."} {method === "totp" ? "Enter the code from your authenticator app, or a recovery code." : "Enter the code we just emailed you, or a recovery code."}</p>
        <div className="flex flex-wrap gap-3"><CodeField value={code} onChange={setCode} allowRecovery /><Button variant={flow.action === "disable" ? "destructive" : "default"} disabled={busy || code.trim().length < 6} onClick={() => confirmManage(flow.action)}>{busy && <Loader2 className="animate-spin" />}{flow.action === "disable" ? "Turn off" : "Make new codes"}</Button><Button variant="ghost" onClick={() => setFlow({ step: "idle" })}>Cancel</Button></div>
      </div>}
    </div>
  </section>;
}
