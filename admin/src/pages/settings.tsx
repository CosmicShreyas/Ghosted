// Your own settings: profile (name, Open Peeps avatar), voice (sassy or calm), appearance and email
// theme, which notifications you get, password, two-step sign-in and your signed-in sessions.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import QRCode from "qrcode";
import { Bell, Check, Copy, KeyRound, Laptop, Loader2, LogOut, Mail, Palette, RefreshCw, ShieldCheck, ShieldOff, Smartphone, UserRound } from "lucide-react";
import { toast } from "sonner";
import { ThemePicker } from "@/components/theme-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { ApiRequestError } from "@/lib/api";
import { randomHandle } from "@/lib/handles";
import { cn } from "@/lib/utils";
import { adminApi, type AdminMe } from "../api";
import { ROLE_LABEL } from "../perms";
import { ago, Chip, field, PageHead, Panel, Peep, Segmented, SwitchRow, useConfirm } from "../ui";
import { PanelGridSkeleton } from "../page-skeletons";

const fail = (e: unknown) => toast.error(e instanceof ApiRequestError ? e.message : "Couldn't save that.");
type Notify = { dailyBrief: boolean; urgentReports: boolean; newBugs: boolean; donations: boolean; teamChanges: boolean };
type S = { me: AdminMe; notify: Notify; recoveryLeft: number; sessions: { current: boolean; device: string; startedAt: string; lastUsedAt: string | null; endsAt: string | null }[]; permissions: { id: string; label: string }[] };
const seedFrom = () => randomHandle().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "admin";
const browserOf = (ua: string) => `${/Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser"} on ${/Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "an unknown system"}`;

export function SettingsPage({ me, onMe, onSignOut }: { me: AdminMe; onMe: (m: AdminMe) => void; onSignOut: () => void }) {
  const { ask, confirmation } = useConfirm();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "settings"], queryFn: () => adminApi<S>("/me/settings") });
  const reload = () => void qc.invalidateQueries({ queryKey: ["admin", "settings"] });
  const patch = async (body: Record<string, unknown>, ok?: string) => {
    try { const r = await adminApi<{ me: AdminMe }>("/me", { method: "PATCH", body }); onMe(r.me); reload(); if (ok) toast.success(ok); } catch (e) { fail(e); }
  };
  const s = q.data;
  return <>
    <PageHead eyebrow="You" title="Settings" copy="How the panel looks and talks to you, what it tells you about, and how your account is protected." />
    {!s ? <PanelGridSkeleton panels={6} /> : <div className="grid gap-6 lg:grid-cols-2">
      <Profile me={me} patch={patch} />
      <Panel title="Voice and look" icon={Palette}>
        <p className="text-sm font-bold">Voice</p>
        <p className="mb-2 text-xs text-muted-foreground">How the panel greets you, and the voice of the emails it sends you.</p>
        <div className="grid gap-2 sm:grid-cols-2">{(["sassy", "calm"] as const).map((t) => <button key={t} type="button" onClick={() => void patch({ tone: t }, t === "sassy" ? "Sassy it is." : "Calm it is.")} className={cn("rounded-lg border-2 p-3 text-left", me.tone === t ? "border-foreground bg-primary text-primary-foreground shadow-hard-sm" : "border-foreground/15 hover:border-foreground")}>
          <span className="block font-bold">{t === "sassy" ? "Sassy" : "Calm"}</span>
          <span className={cn("block text-xs", me.tone === t ? "opacity-85" : "text-muted-foreground")}>{t === "sassy" ? "“Goofy left you 3 things. He tried his best.”" : "“3 things need a human today.”"}</span>
        </button>)}</div>
        <p className="mt-5 text-sm font-bold">Panel theme</p>
        <div className="mt-2"><ThemePicker /></div>
        <p className="mt-3 text-xs text-muted-foreground">Emails we send you (codes, Goofy's brief) follow this theme automatically: right now they're {me.emailTheme}.</p>
      </Panel>

      <Panel title="Notifications" icon={Bell}>
        <p className="text-sm text-muted-foreground">What shows up under the bell, and what we email you.</p>
        <div className="divide-y-2 divide-foreground/10">
          <SwitchRow title="Goofy's daily brief" copy="One email a day with anything that needs a human." checked={s.notify.dailyBrief} onChange={(v) => void patch({ notify: { dailyBrief: v } })} />
          <SwitchRow title="Urgent reports" copy="High-priority reports, as they come in." checked={s.notify.urgentReports} onChange={(v) => void patch({ notify: { urgentReports: v } })} />
          <SwitchRow title="Bugs and feature ideas" copy="New ones from the feedback page." checked={s.notify.newBugs} onChange={(v) => void patch({ notify: { newBugs: v } })} />
          <SwitchRow title="Donations" copy="Every paid donation." checked={s.notify.donations} onChange={(v) => void patch({ notify: { donations: v } })} />
          <SwitchRow title="Team changes" copy="Someone added, removed, or given different access." checked={s.notify.teamChanges} onChange={(v) => void patch({ notify: { teamChanges: v } })} />
        </div>
      </Panel>

      <TwoStep me={me} recoveryLeft={s.recoveryLeft} onChanged={() => { reload(); void adminApi<{ admin: AdminMe }>("/me").then((r) => onMe(r.admin)); }} />
      <Password />

      <Panel title="Signed in" icon={Laptop} action={<Button size="sm" variant="outline" onClick={() => void ask({ title: "Sign out every other session?", copy: "Every other browser and device using this admin account will immediately lose access. This tab stays signed in.", confirm: "Sign out others", danger: true }).then((ok) => ok && adminApi("/me/sessions/revoke-all", { method: "POST" }).then(() => { toast.success("Every other session is signed out."); reload(); }, fail))}><LogOut />Sign out the others</Button>}>
        <ul className="divide-y-2 divide-foreground/10">{s.sessions.map((x, i) => <li key={i} className="flex items-center gap-3 py-2.5">
          <Laptop className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 text-sm"><span className="block font-semibold">{browserOf(x.device)} {x.current && <Chip tone="bg-flag-green/15 text-flag-green">This tab</Chip>}</span><span className="block text-xs text-muted-foreground">Signed in {ago(x.startedAt)}{x.endsAt ? `, ends ${new Date(x.endsAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}` : ""}</span></span>
        </li>)}</ul>
        <Button variant="destructive" className="mt-3" onClick={() => void ask({ title: "Sign out of this tab?", copy: "This admin session will end. Any unsaved changes on this page will be lost.", confirm: "Sign out", danger: true }).then((ok) => ok && onSignOut())}><LogOut />Sign out of this tab</Button>
      </Panel>

      <Panel title="Your access" icon={ShieldCheck} className="lg:col-span-2">
        <p className="text-sm text-muted-foreground">{ROLE_LABEL[me.role]}{me.fromEnv ? ", set in ADMIN_EMAILS on the server" : ""}. Ask an owner if you need more.</p>
        <ul className="mt-3 flex flex-wrap gap-2">{s.permissions.map((p) => <li key={p.id}><Chip tone="bg-card"><Check className="size-3" />{p.label}</Chip></li>)}</ul>
      </Panel>
    </div>}{confirmation}
  </>;
}

function Profile({ me, patch }: { me: AdminMe; patch: (b: Record<string, unknown>, ok?: string) => Promise<void> }) {
  const [name, setName] = useState(me.name);
  const [options, setOptions] = useState(() => [me.avatarSeed, ...Array.from({ length: 7 }, seedFrom)]);
  return <Panel title="Profile" icon={UserRound}>
    <div className="flex items-center gap-4">
      <Peep seed={me.avatarSeed} className="size-20" />
      <div className="min-w-0"><p className="truncate font-display text-xl font-bold">{me.name}</p><p className="truncate text-sm text-muted-foreground">{me.email}</p></div>
    </div>
    <p className="mt-5 text-sm font-bold">Pick a face</p>
    <div className="mt-2 grid grid-cols-4 gap-2">{options.map((seed) => <button key={seed} type="button" aria-label="Use this avatar" aria-pressed={seed === me.avatarSeed} onClick={() => void patch({ avatarSeed: seed }, "Looking good.")} className={cn("grid place-items-center rounded-xl border-2 p-1.5", seed === me.avatarSeed ? "border-foreground bg-accent shadow-hard-sm" : "border-foreground/10 hover:border-foreground")}>
      <Peep seed={seed} className="size-14 border-0" />
    </button>)}</div>
    <button type="button" onClick={() => setOptions([me.avatarSeed, ...Array.from({ length: 7 }, seedFrom)])} className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"><RefreshCw className="size-3.5" />Show me others</button>
    <form className="mt-5" onSubmit={(e) => { e.preventDefault(); if (name.trim() && name !== me.name) void patch({ name: name.trim() }, "Name saved."); }}>
      <label className="block"><span className="mb-1 block text-sm font-bold">Name the team sees</span>
        <span className="flex gap-2"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={field} /><Button type="submit" disabled={!name.trim() || name === me.name}>Save</Button></span></label>
    </form>
  </Panel>;
}

function Password() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 14) { toast.error("Use at least 14 characters."); return; }
    setBusy(true);
    try { await adminApi("/me/password", { method: "POST", body: { current, next } }); toast.success("Password changed. Your other sessions are signed out."); setCurrent(""); setNext(""); } catch (err) { fail(err); } finally { setBusy(false); }
  };
  return <Panel title="Password" icon={KeyRound}>
    <form onSubmit={(e) => void go(e)} className="space-y-3">
      <label className="block"><span className="mb-1 block text-sm font-bold">Current password</span><Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={field} required /></label>
      <label className="block"><span className="mb-1 block text-sm font-bold">New password (14+ characters)</span><Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={field} required /></label>
      <Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <KeyRound />}Change password</Button>
    </form>
  </Panel>;
}

function Codes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  return <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border-2 border-foreground bg-accent p-4">
    <p className="font-bold">Save these recovery codes</p>
    <p className="text-sm">Each one signs you in once if you lose your phone or inbox. They won't be shown again.</p>
    <ul className="mt-3 grid grid-cols-2 gap-1.5 font-mono text-sm">{codes.map((c) => <li key={c} className="rounded-md border-2 border-foreground bg-card px-2 py-1 text-center">{c}</li>)}</ul>
    <div className="mt-3 flex gap-2"><Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(codes.join("\n")).then(() => toast.success("Copied."))}><Copy />Copy</Button><Button size="sm" onClick={onDone}><Check />I've saved them</Button></div>
  </motion.div>;
}

function CodeBoxes({ value, onChange, onComplete }: { value: string; onChange: (v: string) => void; onComplete: (v: string) => void }) {
  return <InputOTP maxLength={6} value={value} onChange={(v) => { const d = v.replace(/\D/g, ""); onChange(d); if (d.length === 6) onComplete(d); }} inputMode="numeric" pattern="^[0-9]*$" containerClassName="max-w-full justify-start" aria-label="6-digit code">
    <InputOTPGroup className="gap-1.5 sm:gap-2">{Array.from({ length: 6 }, (_, i) => <InputOTPSlot key={i} index={i} className="size-9 rounded-lg border-2 border-foreground bg-card font-display text-lg font-bold first:rounded-lg first:border-l-2 last:rounded-lg sm:size-11 sm:text-xl" />)}</InputOTPGroup>
  </InputOTP>;
}

function TwoStep({ me, recoveryLeft, onChanged }: { me: AdminMe; recoveryLeft: number; onChanged: () => void }) {
  const [mode, setMode] = useState<null | "totp" | "email" | "off" | "recovery">(null);
  const [qr, setQr] = useState<{ img: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const reset = () => { setMode(null); setQr(null); setCode(""); setPassword(""); };
  const run = async <T,>(fn: () => Promise<T>) => { setBusy(true); try { return await fn(); } catch (e) { fail(e); return null; } finally { setBusy(false); } };

  const startTotp = () => void run(async () => { const r = await adminApi<{ secret: string; uri: string }>("/me/mfa/totp/start", { method: "POST" }); setQr({ secret: r.secret, img: await QRCode.toDataURL(r.uri, { margin: 1, width: 200, color: { dark: "#141110", light: "#FFFFFF" } }) }); setMode("totp"); });
  const startEmail = () => void run(async () => { await adminApi("/me/mfa/email/start", { method: "POST" }); setMode("email"); toast.success(`Code sent to ${me.email}.`); });
  const confirm = (c: string) => void run(async () => { const r = await adminApi<{ recoveryCodes: string[] }>(`/me/mfa/${mode}/confirm`, { method: "POST", body: { code: c } }); setCodes(r.recoveryCodes); reset(); onChanged(); toast.success("Two-step sign-in is on."); }).then((r) => { if (r === null) setCode(""); });
  const withPassword = (path: string) => void run(async () => { const r = await adminApi<{ recoveryCodes?: string[] }>(path, { method: "POST", body: { password } }); if (r.recoveryCodes) setCodes(r.recoveryCodes); else toast.success("Two-step sign-in is off."); reset(); onChanged(); });

  const on = me.mfaMethod !== "none";
  return <Panel title="Two-step sign-in" icon={ShieldCheck}>
    <div className={cn("flex items-center gap-3 rounded-lg border-2 p-3", on ? "border-flag-green bg-flag-green/10" : "border-flag-red bg-flag-red/5")}>
      {on ? <ShieldCheck className="size-5 text-flag-green" /> : <ShieldOff className="size-5 text-flag-red" />}
      <span className="text-sm"><b>{on ? (me.mfaMethod === "totp" ? "On, with an authenticator app" : "On, with email codes") : "Off"}</b>{on ? `. ${recoveryLeft} recovery code${recoveryLeft === 1 ? "" : "s"} left.` : ". Your password is the only thing between a stranger and this panel."}</span>
    </div>
    <AnimatePresence mode="wait">
      {codes ? <div key="codes" className="mt-4"><Codes codes={codes} onDone={() => setCodes(null)} /></div>
      : mode === "totp" && qr ? <motion.div key="totp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 space-y-3">
          <p className="text-sm">Scan this with Google Authenticator, Authy, 1Password or any authenticator app, then type the 6-digit code it shows.</p>
          <div className="flex flex-wrap items-center gap-4"><img src={qr.img} alt="QR code for your authenticator app" className="size-40 rounded-lg border-2 border-foreground bg-white p-1" /><p className="min-w-0 break-all font-mono text-xs text-muted-foreground">Or enter this key:<br /><span className="text-foreground">{qr.secret}</span></p></div>
          <CodeBoxes value={code} onChange={setCode} onComplete={confirm} />
          <Button variant="ghost" size="sm" onClick={reset}>Cancel</Button>
        </motion.div>
      : mode === "email" ? <motion.div key="email" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 space-y-3">
          <p className="text-sm">Enter the 6-digit code we just emailed you.</p>
          <CodeBoxes value={code} onChange={setCode} onComplete={confirm} />
          <Button variant="ghost" size="sm" onClick={reset}>Cancel</Button>
        </motion.div>
      : mode === "off" || mode === "recovery" ? <motion.form key="pw" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); withPassword(mode === "off" ? "/me/mfa/disable" : "/me/mfa/recovery"); }}>
          <label className="block"><span className="mb-1 block text-sm font-bold">Your password</span><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} required /></label>
          <div className="flex gap-2"><Button type="submit" variant={mode === "off" ? "destructive" : "default"} disabled={busy}>{mode === "off" ? "Turn two-step off" : "Make new recovery codes"}</Button><Button type="button" variant="ghost" onClick={reset}>Cancel</Button></div>
        </motion.form>
      : <motion.div key="menu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 flex flex-wrap gap-2">
          {me.mfaMethod !== "totp" && <Button disabled={busy} onClick={startTotp}><Smartphone />{on ? "Switch to an authenticator app" : "Use an authenticator app"}</Button>}
          {me.mfaMethod !== "email" && <Button variant="outline" disabled={busy} onClick={startEmail}><Mail />{on ? "Switch to email codes" : "Use email codes"}</Button>}
          {on && <><Button variant="outline" onClick={() => setMode("recovery")}><RefreshCw />New recovery codes</Button><Button variant="ghost" className="text-flag-red" onClick={() => setMode("off")}><ShieldOff />Turn off</Button></>}
        </motion.div>}
    </AnimatePresence>
  </Panel>;
}
