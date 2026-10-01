// Platform switches: what members can do right now, read-only mode, and a site-wide announcement.
// Changes reach every server within 30 seconds and every open page on its next refresh.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { History as History_, Info, Lock, Megaphone, PartyPopper, Save, TriangleAlert } from "lucide-react";
import { detailLines } from "../describe";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiRequestError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { adminApi, type AdminMe } from "../api";
import { can } from "../perms";
import { ago, field, PageHead, Panel, Peep, Segmented, SwitchRow, useConfirm } from "../ui";
import { PlatformSkeleton } from "../page-skeletons";

type Announcement = { text: string; tone: "info" | "warn" | "good"; link: string | null } | null;
type Settings = { signupsOpen: boolean; postingOpen: boolean; chitchatsOpen: boolean; donationsOpen: boolean; reportsOpen: boolean; readOnly: boolean; readOnlyMessage: string; announcement: Announcement };
type Change = { id: number; who: string; avatarSeed: string | null; at: string; changes: Record<string, unknown> };
type Res = { settings: Settings; changed: Record<string, { by: string | null; at: string }>; history: Change[] };

// Every change ever made to these switches, newest first, in plain words.
function History({ items }: { items: Change[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 8);
  return <Panel title="History" icon={History_}>
    {!items.length ? <p className="text-sm text-muted-foreground">No changes yet. Everything you switch here is listed with who did it and when.</p>
      : <ol className="relative ml-4 border-l-2 border-foreground/15">{shown.map((h) => <li key={h.id} className="relative pb-4 pl-6 last:pb-0">
        <span className="absolute -left-[17px] top-0">{h.avatarSeed ? <Peep seed={h.avatarSeed} className="size-8" /> : <span className="grid size-8 place-items-center rounded-full border-2 border-foreground bg-muted text-xs font-bold">{h.who[0]}</span>}</span>
        <p className="text-sm"><b>{h.who}</b> <span className="text-muted-foreground">{ago(h.at)}</span></p>
        <ul className="mt-1 space-y-0.5">{detailLines("platform_update", h.changes).map((l, i) => <li key={i} className="break-words text-sm">{l}</li>)}</ul>
      </li>)}</ol>}
    {items.length > 8 && <button type="button" onClick={() => setAll((a) => !a)} className="mt-3 text-sm font-bold text-primary hover:underline">{all ? "Show fewer" : `Show all ${items.length} changes`}</button>}
  </Panel>;
}
const fail = (e: unknown) => toast.error(e instanceof ApiRequestError ? e.message : "Couldn't save that.");
const TONE = { info: { icon: Info, cls: "bg-avatar-sky" }, warn: { icon: TriangleAlert, cls: "bg-accent" }, good: { icon: PartyPopper, cls: "bg-avatar-mint" } } as const;

export function PlatformPage({ me }: { me: AdminMe }) {
  const { ask, confirmation } = useConfirm();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "platform"], queryFn: () => adminApi<Res>("/platform") });
  const edit = can(me, "platform");
  const save = async (patch: Partial<Settings>, ok: string) => {
    const closing = (["signupsOpen", "postingOpen", "chitchatsOpen", "donationsOpen", "reportsOpen"] as const).find((k) => patch[k] === false);
    const prompt = patch.announcement === null ? { title: "Remove the announcement?", copy: "The announcement will disappear from every public page.", confirm: "Remove announcement", danger: true }
      : patch.readOnly === true ? { title: "Put all of Ghosted into read-only mode?", copy: "Members will immediately be unable to sign up, post, comment or react until read-only mode is switched off.", confirm: "Turn on read-only", danger: true }
      : closing ? { title: `Pause ${closing.replace(/Open$/, "").replace(/([A-Z])/g, " $1").toLowerCase()}?`, copy: "This affects every member. Existing content remains available, but new actions in this area will be rejected.", confirm: "Pause for everyone", danger: true } : null;
    if (prompt && !(await ask(prompt))) return;
    try { const r = await adminApi<{ settings: Settings }>("/platform", { method: "PATCH", body: patch }); qc.setQueryData<Res>(["admin", "platform"], (o) => (o ? { ...o, settings: r.settings } : o)); void qc.invalidateQueries({ queryKey: ["admin", "overview"] }); toast.success(ok); }
    catch (e) { fail(e); }
  };
  const s = q.data?.settings;
  const who = (k: string) => { const c = q.data?.changed[k]; return c ? `Changed by ${c.by ?? "someone"} ${ago(c.at)}` : undefined; };

  return <>
    <PageHead eyebrow="Control" title="Platform" copy={edit ? "Switch parts of Ghosted on and off for everyone. Each change is logged and takes effect within 30 seconds." : "How Ghosted is set right now. Ask an owner for platform access to change it."} />
    {!s ? <PlatformSkeleton /> : <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <div className="space-y-6">
        <Panel title="What members can do" icon={Lock}>
          <div className="divide-y-2 divide-foreground/10">
            <SwitchRow title="New sign-ups" copy={who("signupsOpen") ?? "People can create accounts."} checked={s.signupsOpen} disabled={!edit} onChange={(v) => void save({ signupsOpen: v }, v ? "Sign-ups are open." : "Sign-ups are paused.")} />
            <SwitchRow title="New stories" copy={who("postingOpen") ?? "Members can share stories."} checked={s.postingOpen} disabled={!edit} onChange={(v) => void save({ postingOpen: v }, v ? "Stories are open." : "New stories are paused.")} />
            <SwitchRow title="Chitchats" copy={who("chitchatsOpen") ?? "Members can comment on stories."} checked={s.chitchatsOpen} disabled={!edit} onChange={(v) => void save({ chitchatsOpen: v }, v ? "Chitchats are open." : "Chitchats are paused.")} />
            <SwitchRow title="Reports" copy={who("reportsOpen") ?? "Anyone can report a story or chitchat."} checked={s.reportsOpen} disabled={!edit} onChange={(v) => void save({ reportsOpen: v }, v ? "Reports are open." : "Reports are paused.")} />
            <SwitchRow title="Donations" copy={who("donationsOpen") ?? "The donate button on /feedback works."} checked={s.donationsOpen} disabled={!edit} onChange={(v) => void save({ donationsOpen: v }, v ? "Donations are open." : "Donations are paused.")} />
          </div>
        </Panel>
        <ReadOnly s={s} edit={edit} save={save} note={who("readOnly")} />
      </div>
      <div className="space-y-6">
        <AnnouncementEditor current={s.announcement} edit={edit} save={save} note={who("announcement")} />
        <History items={q.data?.history ?? []} />
      </div>
    </div>}{confirmation}
  </>;
}

function ReadOnly({ s, edit, save, note }: { s: Settings; edit: boolean; save: (p: Partial<Settings>, ok: string) => Promise<void>; note: string | undefined }) {
  const [msg, setMsg] = useState(s.readOnlyMessage);
  return <section className={cn("rounded-xl border-2 border-foreground p-5 shadow-hard-sm", s.readOnly ? "bg-flag-red/10" : "bg-card")}>
    <SwitchRow tone="danger" title="Read-only mode" copy={note ?? "Everything stays readable; nobody can post, comment, react or sign up. Signing in still works."} checked={s.readOnly} disabled={!edit} onChange={(v) => void save({ readOnly: v, readOnlyMessage: msg }, v ? "Ghosted is read-only." : "Ghosted is open again.")} />
    <label className="mt-2 block"><span className="mb-1 block text-xs font-bold">What people see when they try</span>
      <Input value={msg} onChange={(e) => setMsg(e.target.value)} disabled={!edit} className={field} maxLength={240} /></label>
    {edit && msg !== s.readOnlyMessage && <Button size="sm" className="mt-2" onClick={() => void save({ readOnlyMessage: msg }, "Message saved.")}><Save />Save message</Button>}
  </section>;
}

function AnnouncementEditor({ current, edit, save, note }: { current: Announcement; edit: boolean; save: (p: Partial<Settings>, ok: string) => Promise<void>; note: string | undefined }) {
  const [text, setText] = useState(current?.text ?? "");
  const [tone, setTone] = useState<"info" | "warn" | "good">(current?.tone ?? "info");
  const [link, setLink] = useState(current?.link ?? "");
  useEffect(() => { setText(current?.text ?? ""); setTone(current?.tone ?? "info"); setLink(current?.link ?? ""); }, [current]);
  const T = TONE[tone];
  return <Panel title="Announcement" icon={Megaphone} className="h-fit">
    <p className="text-sm text-muted-foreground">A strip across the top of every page on Ghosted. {note ?? (current ? "Live now." : "Nothing is showing.")}</p>
    <p className="mb-1.5 mt-4 text-xs font-semibold text-muted-foreground">Preview</p>
    <div className={cn("flex items-center gap-2 rounded-lg border-2 border-foreground px-3 py-2 text-sm font-semibold text-black", T.cls)}><T.icon className="size-4 shrink-0" /><span className="min-w-0 flex-1">{text || "Your announcement"}</span>{link && <span className="underline">Learn more</span>}</div>
    <div className="mt-4 space-y-3">
      <Segmented label="Style" value={tone} onChange={setTone} options={[{ id: "info", label: "News" }, { id: "warn", label: "Heads-up" }, { id: "good", label: "Good news" }]} />
      <Input value={text} onChange={(e) => setText(e.target.value)} disabled={!edit} placeholder="What should everyone know?" className={field} maxLength={200} />
      <Input value={link} onChange={(e) => setLink(e.target.value)} disabled={!edit} placeholder="Link (optional): /feedback or https://…" className={field} maxLength={200} />
    </div>
    {edit && <div className="mt-4 flex flex-wrap gap-2">
      <Button disabled={text.trim().length < 3} onClick={() => void save({ announcement: { text: text.trim(), tone, link: link.trim() || null } }, "Announcement is live.")}><Megaphone />{current ? "Update announcement" : "Show announcement"}</Button>
      {current && <Button variant="outline" onClick={() => void save({ announcement: null }, "Announcement removed.")}>Take it down</Button>}
    </div>}
  </Panel>;
}
