import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Link } from "@tanstack/react-router";
import { Bell, CheckCircle2, Circle, Dices, Download, Eye, EyeOff, Loader2, LogOut, MonitorSmartphone, Palette, ShieldCheck, Shuffle, Trash2, UserRound, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ghosted";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api, ApiRequestError, apiEnabled } from "@/lib/api";
import { setPrefs, usePrefs } from "@/lib/prefs";
import { displayName, isPublic, nameIsPublic, useAccountActions, useTone, voice, type Field, type Me, type Notify, type Tone } from "@/lib/session";
import { TwoFactorSection } from "./two-factor";
import { DevicesList } from "./devices";
import { ThemePicker } from "@/components/theme-picker";
import { cn } from "@/lib/utils";
import { stories, users } from "@/mock/data";
import { DeleteAccountDialog, LogoutDialog } from "./confirm-dialogs";
import { card } from "./widgets";

const FIELDS: { key: Field; label: string; placeholder: string }[] = [
  { key: "name", label: "Full name", placeholder: "As on your ID" },
  { key: "role", label: "Role", placeholder: "e.g. Backend Engineer" },
  { key: "experience", label: "Experience", placeholder: "e.g. 5 yrs" },
  { key: "city", label: "City", placeholder: "e.g. Bengaluru" },
  { key: "linkedin", label: "LinkedIn", placeholder: "in/your-name" },
];

const PASTELS = ["bg-avatar-mint", "bg-avatar-sky", "bg-avatar-pink", "bg-avatar-amber", "bg-avatar-lilac"];
const randomLooks = () => Array.from({ length: 8 }, (_, i) => ({ seed: `peep-${Math.random().toString(36).slice(2, 10)}`, pastel: PASTELS[i % PASTELS.length]! }));

function Section({ icon: Icon, title, subtitle, action, children, danger }: { icon: LucideIcon; title: string; subtitle?: string; action?: ReactNode; children?: ReactNode; danger?: boolean }) {
  // Phones: the action (button or switch) wraps below the text instead of squeezing it into a thin
  // column. Buttons stretch full width there; switches stay compact.
  return <section className={cn(danger ? "rounded-xl border-2 border-flag-red bg-card shadow-hard-sm" : card, "p-4 sm:p-6")}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-1 basis-64 items-start gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg border-2 border-foreground", danger ? "bg-flag-red text-primary-foreground" : "bg-accent")}><Icon className="size-5" /></span>
        <div className="min-w-0"><h3 className={cn("font-display text-xl font-bold", danger && "text-flag-red")}>{title}</h3>{subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}</div>
      </div>
      {action && <div className="w-full shrink-0 sm:w-auto [&>button:not([role=switch])]:w-full sm:[&>button:not([role=switch])]:w-auto">{action}</div>}
    </div>
    {children && <div className="mt-5">{children}</div>}
  </section>;
}

function ToggleRow({ title, copy, checked, onChange, disabled }: { title: string; copy: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <label className="flex items-center justify-between gap-4 border-b border-foreground/10 py-3 last:border-0">
    <span><span className="block text-sm font-bold">{title}</span><span className="block text-xs text-muted-foreground">{copy}</span></span>
    <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={title} />
  </label>;
}

// ---------- right column ----------

// Live preview of how your posts, chitchats and page look to other people. Mirrors the server's rule
// (backend dto.ts storyAuthor): identity is account-wide, so ONE preview covers everything you've
// ever posted. Anonymous: handle + avatar. Public: your shown details, real name in place of the
// handle if shown, on every post, past ones included.
function PublicPreview({ me }: { me: Me }) {
  const shown = (f: Field) => isPublic(me) && me.sharedFields.includes(f) ? me.details[f] : null;
  const extras = (["role", "experience", "city"] as const).map(shown).filter(Boolean).join(" · ");
  const linkedin = shown("linkedin");
  const named = isPublic(me);
  const who = displayName(me);
  const note = !named ? "You're anonymous: all your stories, past and future, show only your handle and avatar."
    : nameIsPublic(me) ? "All your stories, including ones posted while anonymous, now show your real name. Hide your name to switch them all back."
    : "All your stories show your handle with the details marked Shown.";
  return <div className={cn(card, "p-5")}>
    <div className="flex items-center justify-between"><h3 className="flex items-center gap-2 font-bold"><Eye className="size-4" />How others see you</h3>{me.publicId && <Link to="/u/$id" params={{ id: me.publicId }} className="text-xs font-bold text-primary hover:underline">View your page</Link>}</div>
    <motion.div key={`${isPublic(me)}-${me.sharedFields.join()}-${me.handle}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-xl border-2 border-foreground bg-background p-4">
      <div className="flex items-center gap-3">
        <Avatar seed={me.avatarSeed} pastel={me.pastel} size="sm" label="Your avatar" />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{who}</p>
          <p className="truncate text-xs text-muted-foreground">{named && extras ? extras : "about Nimbus Labs · just now"}</p>
        </div>
      </div>
      {named && linkedin && <p className="mt-2 inline-block rounded-full border border-foreground px-2 py-0.5 text-[11px] font-bold">{linkedin}</p>}
      <p className="mt-3 text-sm text-muted-foreground">“Two rounds, clear feedback, decision in three days. Boring in the best way.”</p>
    </motion.div>
    <p className="mt-3 text-xs text-muted-foreground">{note}</p>
  </div>;
}

function AccountHealth({ me }: { me: Me }) {
  const items = [
    { ok: true, text: "Email verified with a 6-digit code" },
    { ok: true, text: "Name encrypted at rest" },
    { ok: true, text: isPublic(me) ? `${me.sharedFields.length} ${me.sharedFields.length === 1 ? "detail" : "details"} shown on named posts` : "Fully anonymous right now" },
    { ok: !!me.details.role, text: "Role added (helps others trust your stories)" },
    { ok: true, text: "Session stored in encrypted, script-proof cookies" },
  ];
  const score = items.filter((i) => i.ok).length;
  return <div className={cn(card, "p-5")}>
    <div className="flex items-center justify-between"><h3 className="flex items-center gap-2 font-bold"><ShieldCheck className="size-4 text-flag-green" />Account health</h3><span className="font-display text-lg font-bold">{score}/{items.length}</span></div>
    <div className="mt-2 h-2 overflow-hidden rounded-full border border-foreground bg-muted"><motion.div className="h-full bg-flag-green" initial={false} animate={{ width: `${(score / items.length) * 100}%` }} /></div>
    <ul className="mt-4 space-y-2">{items.map((i) => <li key={i.text} className="flex items-start gap-2 text-sm">{i.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-flag-green" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}<span className={cn(!i.ok && "text-muted-foreground")}>{i.text}</span></li>)}</ul>
  </div>;
}

// ---------- page ----------

export function SettingsView({ me, onLoggedOut, onRequestLogout }: { me: Me; onLoggedOut: () => void; onRequestLogout: () => void }) {
  const actions = useAccountActions();
  const prefs = usePrefs();
  const [details, setDetails] = useState(me.details);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [everywhere, setEverywhere] = useState(false);
  const [looks, setLooks] = useState(() => users.slice(0, 8).map((u) => ({ seed: u.seed, pastel: u.pastel })));
  const [exporting, setExporting] = useState(false);
  const shared = new Set(me.sharedFields);

  const save = async (patch: Parameters<typeof actions.update>[0], ok: string) => {
    setBusy(true);
    try { await actions.update(patch); toast.success(ok); } catch (err) { toast.error(err instanceof ApiRequestError ? (err.fields ? Object.values(err.fields)[0] ?? err.message : err.message) : "Couldn't save. Try again."); } finally { setBusy(false); }
  };
  // The server treats "any detail shown" as public, so the first switch on makes you public and the
  // last one off makes you anonymous again.
  const toggleField = (f: Field) => {
    const next = new Set(shared);
    const label = FIELDS.find((x) => x.key === f)!.label;
    if (next.has(f)) next.delete(f); else next.add(f);
    const msg = next.has(f) ? (shared.size === 0 ? `You're public. Only your ${label.toLowerCase()} is shown.` : `${label} is now shown.`) : next.size === 0 ? "Everything hidden. You're fully anonymous again." : `${label} is now hidden.`;
    void save({ sharedFields: [...next] }, msg);
  };
  // Saved on the account: the server reads these before sending any email.
  const setNotify = (k: keyof Notify, v: boolean) => void save({ notify: { [k]: v } }, v ? voice(tone, "Noted. We'll ping you.", "Email notification turned on.") : voice(tone, "Muted. Peace and quiet.", "Email notification turned off."));
  const setTone = (t: Tone) => { setPrefs({ tone: t }); void save({ tone: t }, t === "calm" ? "Calm mode on. Emails and copy will keep it professional." : "Sassy mode on. The receipts are back."); };
  const tone = useTone();

  // DPDP right of access: everything we hold about you, as a JSON file.
  const exportData = async () => {
    setExporting(true);
    try {
      const data = apiEnabled
        ? { profile: (await api<{ profile: unknown }>("/v1/me")).profile, stories: (await api<{ stories: unknown[] }>("/v1/me/stories")).stories }
        : { profile: me, stories: stories.filter((s) => s.userId === "u1") };
      const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), note: "Your Ghosted data. Your name and details are shown decrypted because this file is only for you.", ...data }, null, 2)], { type: "application/json" });
      // The link must be in the page for some browsers, and the URL must outlive the click:
      // revoking it immediately (as before) cancelled the download.
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: `ghosted-data-${new Date().toISOString().slice(0, 10)}.json`, style: "display:none" });
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success("Your data is downloading. Keep it somewhere safe.");
    } catch { toast.error("Couldn't prepare your data. Try again."); } finally { setExporting(false); }
  };

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase text-primary">Your account</p><h2 className="text-2xl font-bold">Settings</h2></div><p className="text-xs text-muted-foreground">Signed in as <strong className="text-foreground">{displayName(me)}</strong>{nameIsPublic(me) && <> (aka {me.handle})</>}</p></div>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">
        <Section icon={UserRound} title="Identity" subtitle="Your disguise: the face and name everyone sees.">
          {/* On narrow screens the button drops below, so the handle is never cut off. */}
          <div className="flex flex-wrap items-center gap-4 rounded-lg border-2 border-foreground bg-background p-4">
            <Avatar seed={me.avatarSeed} pastel={me.pastel} size="lg" label={me.handle} />
            <div className="min-w-0 flex-1 basis-40"><p className="text-xs text-muted-foreground">Your anonymous handle</p><p className="break-words font-display text-2xl font-bold leading-tight">{me.handle}</p>{me.publicId && <p className="break-all text-xs text-muted-foreground">Profile ID {me.publicId}</p>}</div>
            <Button variant="outline" disabled={busy} className="w-full sm:w-auto" onClick={() => void save({ rerollHandle: true }, "New handle, new you.")}><Dices />Re-roll</Button>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between"><p className="text-sm font-bold">Change your look</p><Button size="sm" variant="ghost" onClick={() => setLooks(randomLooks())}><Shuffle />Shuffle faces</Button></div>
            <div className="mt-2 flex flex-wrap gap-2">{looks.map((l) => { const on = l.seed === me.avatarSeed; return <button key={l.seed} type="button" disabled={busy} aria-pressed={on} aria-label="Use this avatar" onClick={() => void save({ avatarSeed: l.seed, pastel: l.pastel }, "New look saved.")} className={cn("grid size-12 place-items-center rounded-full ring-offset-2 ring-offset-card transition", on ? "ring-[3px] ring-primary" : "opacity-80 hover:opacity-100")}><Avatar seed={l.seed} pastel={l.pastel} size="sm" /></button>; })}</div>
          </div>
        </Section>

        {/* Go public: one switch per detail. Anything switched on appears on your named posts; with
            everything hidden you're fully anonymous. There's no separate master switch to forget. */}
        <Section icon={isPublic(me) ? Eye : EyeOff} title="Go public" subtitle="Choose exactly what appears on your named posts. Everything hidden means you're fully anonymous. Companies never get anything else."
          action={<span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-foreground px-2.5 py-1 text-xs font-bold", isPublic(me) ? "bg-primary text-primary-foreground" : "bg-muted")}>
            {isPublic(me) ? <><Eye className="size-3.5" />Public · {shared.size} shown</> : <><EyeOff className="size-3.5" />Anonymous</>}
          </span>}>
          <div className="space-y-2.5">{FIELDS.map((f) => {
            const on = shared.has(f.key);
            const empty = !(me.details[f.key] ?? "").trim();
            return <div key={f.key} className={cn("rounded-lg border-2 p-3 transition-colors sm:grid sm:grid-cols-[8.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:border-transparent sm:p-0", on ? "border-primary bg-primary/5 sm:bg-transparent" : "border-foreground/15")}>
              <div className="mb-2 flex items-center justify-between gap-3 sm:mb-0">
                <label htmlFor={`d-${f.key}`} className="text-sm font-bold">{f.label}</label>
                {/* Phones: the switch sits beside the label. */}
                <Switch className="sm:hidden" checked={on} disabled={busy || (empty && !on)} onCheckedChange={() => toggleField(f.key)} aria-label={`Show ${f.label} on named posts`} />
              </div>
              <Input id={`d-${f.key}`} value={details[f.key] ?? ""} placeholder={f.placeholder} maxLength={f.key === "linkedin" ? 104 : 80} onChange={(e) => setDetails({ ...details, [f.key]: e.target.value })} onBlur={() => { if ((details[f.key] ?? "") !== (me.details[f.key] ?? "")) void save({ details: { [f.key]: details[f.key] || null } }, `${f.label} saved.`); }} className="border-2 border-foreground" />
              {/* Tablet and up: the switch with its state, at the end of the row. */}
              <label className="hidden w-28 cursor-pointer items-center justify-end gap-2 text-xs font-bold sm:flex">
                <span className={on ? "text-primary" : "text-muted-foreground"}>{on ? "Shown" : "Hidden"}</span>
                <Switch checked={on} disabled={busy || (empty && !on)} onCheckedChange={() => toggleField(f.key)} aria-label={`Show ${f.label} on named posts`} />
              </label>
              {empty && !on && <p className="mt-1.5 text-[11px] text-muted-foreground sm:col-start-2 sm:mt-0">Fill this in to be able to show it.</p>}
            </div>;
          })}</div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="flex min-w-0 flex-1 basis-64 items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="size-3.5 shrink-0 text-flag-green" />Details are encrypted at rest. What you show here applies to all your stories and your page, past ones included.</p>
            {isPublic(me) && <Button size="sm" variant="outline" disabled={busy} onClick={() => void save({ sharedFields: [] }, "Everything hidden. You're fully anonymous again.")}><EyeOff />Hide everything</Button>}
          </div>
        </Section>

        {/* Phones/tablets: the preview and health check right after Go public, where they're most useful. */}
        <div className="space-y-6 xl:hidden">
          <PublicPreview me={me} />
          <AccountHealth me={me} />
        </div>

        <Section icon={Bell} title="Notifications" subtitle={voice(tone, "Choose what's worth an email. At most one per story per hour, because we're not recruiters.", "Choose which emails you receive. We send at most one per story per hour.")}>
          <ToggleRow disabled={busy} title="Someone relates to your story" copy={voice(tone, "A gentle nudge when your receipts help someone.", "When people mark your story as relatable.")} checked={me.notify.relatable} onChange={(v) => setNotify("relatable", v)} />
          <ToggleRow disabled={busy} title="Replies to your chitchats" copy={voice(tone, "Know when the tea gets hotter.", "When someone adds a chitchat to your story.")} checked={me.notify.chitchatReplies} onChange={(v) => setNotify("chitchatReplies", v)} />
          <ToggleRow disabled={busy} title="Someone follows you" copy={voice(tone, "A quick heads-up when someone joins your anonymous fan club.", "When a new person follows your profile.")} checked={me.notify.newFollowers !== false} onChange={(v) => setNotify("newFollowers", v)} />
          <ToggleRow disabled={busy} title="Companies you've red-flagged" copy={voice(tone, "Keep the usual suspects in your weekly brief.", "Include useful stories about these companies in your weekly brief.")} checked={me.notify.flaggedCompanies} onChange={(v) => setNotify("flaggedCompanies", v)} />
          <ToggleRow disabled={busy} title="Personalized weekly brief" copy={voice(tone, "Your story activity and useful receipts from companies you follow, bundled Mondays at 11 AM IST. No inbox haunting.", "A Monday 11 AM IST summary of activity on your stories and useful posts from companies you follow.")} checked={me.notify.weeklyDigest} onChange={(v) => setNotify("weeklyDigest", v)} />
        </Section>

        <Section icon={Palette} title="Appearance" subtitle="How Ghosted looks and talks on this device.">
          <div className="pb-4"><p className="mb-2 text-sm font-bold">Theme</p><ThemePicker /></div>
          <ToggleRow title="Reduce motion" copy="Turns off animations across the site: marquees, bouncing ghosts, all of it." checked={prefs.reduceMotion} onChange={(v) => { setPrefs({ reduceMotion: v }); toast.success(v ? "Motion reduced. Very zen." : "Animations are back."); }} />
          {/* Wraps on phones: the Sassy/Calm switch drops below the text at full width instead of being squeezed. */}
          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <span className="min-w-0 flex-1 basis-56"><span className="block text-sm font-bold">Tone</span><span className="block text-xs text-muted-foreground">Sassy is the default. Calm keeps the jokes out of the site and every email we send you.</span></span>
            <div className="grid w-full shrink-0 grid-cols-2 rounded-lg border-2 border-foreground bg-muted p-1 text-xs font-bold sm:w-44">{(["sassy", "calm"] as const).map((t) => <button key={t} type="button" onClick={() => setTone(t)} disabled={busy} aria-pressed={tone === t} className={cn("whitespace-nowrap rounded-md px-3 py-1.5 capitalize transition-colors", tone === t ? "bg-primary text-primary-foreground" : "hover:bg-background")}>{t}</button>)}</div>
          </div>
        </Section>

        <Section icon={Download} title="Your data" subtitle="Everything we hold about you, in one file. Your right under India's DPDP Act, 2023." action={<Button variant="outline" disabled={exporting} onClick={exportData}>{exporting ? <Loader2 className="animate-spin" /> : <Download />}Download my data</Button>} />

        <TwoFactorSection me={me} />

        <Section icon={MonitorSmartphone} title="Security" subtitle="Where you're signed in.">
          <DevicesList />
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="outline" onClick={onRequestLogout}><LogOut />Log out</Button>
            <Button variant="outline" onClick={() => setEverywhere(true)}><MonitorSmartphone />Log out everywhere</Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">This list updates live. Every new sign-in also gets a security email with the device, browser, rough location and time. Sessions refresh quietly for 30 days; “Log out everywhere” cancels every one of them.</p>
        </Section>

        <Section icon={Trash2} title="Delete account" subtitle="Permanently deletes your account, stories, chitchats and reactions. This can't be undone." danger action={<Button variant="destructive" onClick={() => setDeleting(true)}><Trash2 />Delete my account…</Button>} />
      </div>

      {/* Desktop only: the sticky right-hand column. Phones/tablets show the same cards right after Go public. */}
      <aside className="hidden space-y-5 xl:sticky xl:top-24 xl:block xl:self-start">
        <PublicPreview me={me} />
        <AccountHealth me={me} />
      </aside>
    </div>

    <LogoutDialog open={everywhere} onOpenChange={setEverywhere} everywhere onConfirm={async () => {
      try { if (apiEnabled) await api("/v1/auth/logout-all", { method: "POST" }); await actions.logout(); toast.success("Signed out on every device."); setEverywhere(false); onLoggedOut(); }
      catch { toast.error("Couldn't sign out other devices. Try again."); }
    }} />
    {/* Errors are rethrown so the dialog can react (e.g. escalate the human check). */}
    <DeleteAccountDialog open={deleting} onOpenChange={setDeleting} onConfirm={async (captchaToken) => {
      try { await actions.deleteAccount(captchaToken); toast.success("Account deleted. Take care out there."); setDeleting(false); onLoggedOut(); }
      catch (err) { toast.error(err instanceof ApiRequestError ? err.message : "Couldn't delete right now. Try again."); throw err; }
    }} />
  </div>;
}
