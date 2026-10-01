import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, BrainCircuit, ExternalLink, Flag, Hourglass, ListRestart, Play, ShieldCheck, Sparkles, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { GOOFY_AVATAR, GOOFY_ID } from "@/lib/goofy";
import { ApiRequestError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { adminApi, SITE_URL, type AdminMe } from "../api";
import { can } from "../perms";
import { ago, card, Chip, PageHead, Panel, Stat, SwitchRow, useConfirm } from "../ui";
import { ControlsSkeleton, GoofyOverviewSkeleton } from "../page-skeletons";

type Controls = { enabled: boolean; blockVulgarity: boolean; holdRisky: boolean; fileReports: boolean; strikes: boolean; redactNames: boolean; queueSweep: boolean; welcomeMembers: boolean; rescanPublished: boolean; ghostJobAlerts: boolean; weeklyReports: boolean; dailyBriefs: boolean; refreshWordLists: boolean; learnFromOutcomes: boolean };
type Run = { job: string; last_run: string; stats: Record<string, unknown> | null };
type Activity = { public_id: number; action: string; target_kind: string | null; story_public_id: number | null; company_slug: string | null; reason: string | null; created_at: string };
type Data = { controls: Controls; activity24h: Record<string, number>; activity7d: Record<string, number>; runs: Run[]; recent: Activity[]; termCounts: Record<string, number> };

const fail = (e: unknown) => toast.error(e instanceof ApiRequestError ? e.message : "Couldn't save that.");
const sum = (r: Record<string, number> | undefined, keys: string[]) => keys.reduce((n, k) => n + (r?.[k] ?? 0), 0);
const label = (a: string) => ({ removed_story: "Removed a story", removed_chitchat: "Removed a chitchat", held: "Held content for review", released: "Released held content", redacted: "Hid a person's name", took_down: "Took content down", restored: "Restored content", reported_story: "Filed a story report", reported_chitchat: "Filed a chitchat report", reported_company: "Filed a company report", welcomed: "Welcomed a member", ghost_job_alert: "Sent a ghost-job alert", lists_updated: "Updated word lists", learned: "Learned from moderation outcomes" } as Record<string, string>)[a] ?? a.replace(/_/g, " ");

function useGoofy() { return useQuery({ queryKey: ["admin", "goofy"], queryFn: () => adminApi<Data>("/goofy"), refetchInterval: 30_000 }); }

export function GoofyOverviewPage({ me }: { me: AdminMe }) {
  const q = useGoofy(), d = q.data;
  return <>
    <PageHead eyebrow="Goofy" title="Overview" copy="What Ghosted's AutoMod is doing, what needs attention, and whether his automation is healthy." action={<Button variant="outline" asChild><a href={`${SITE_URL}/u/${GOOFY_ID}`} target="_blank" rel="noopener noreferrer"><ExternalLink />Public profile</a></Button>} />
    {!d ? <GoofyOverviewSkeleton /> : <div className="space-y-6">
      <section className={cn(card, "flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5")}>
        <img src={GOOFY_AVATAR} alt="Goofy, Ghosted's AutoMod" className="size-20 rounded-full border-2 border-foreground object-cover" />
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-2xl font-bold">Goofy</h2><Chip tone={d.controls.enabled ? "bg-flag-green/15 text-flag-green" : "bg-flag-red/15 text-flag-red"}>{d.controls.enabled ? "Running" : "Paused"}</Chip></div><p className="mt-1 text-sm text-muted-foreground">{Object.entries(d.controls).filter(([key, on]) => key !== "enabled" && on).length} of {Object.keys(d.controls).length - 1} individual controls are on.</p></div>
      </section>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Actions, 24 hours" value={Object.values(d.activity24h).reduce((a, b) => a + b, 0)} icon={Sparkles} />
        <Stat label="Held" value={sum(d.activity24h, ["held"])} icon={Hourglass} tone="text-primary" />
        <Stat label="Reports filed" value={sum(d.activity24h, ["reported_story", "reported_chitchat", "reported_company"])} icon={Flag} />
        <Stat label="Removed" value={sum(d.activity24h, ["removed_story", "removed_chitchat", "took_down"])} icon={Trash2} tone="text-flag-red" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Panel title="Recent activity" icon={Sparkles}>{d.recent.length ? <ol className="divide-y-2 divide-foreground/10">{d.recent.map((a) => <li key={a.public_id} className="py-3"><div className="flex items-start justify-between gap-3"><p className="text-sm font-bold">{label(a.action)}</p><span className="shrink-0 text-xs text-muted-foreground">{ago(a.created_at)}</span></div>{a.reason && <p className="mt-0.5 text-xs text-muted-foreground">{a.reason}</p>}</li>)}</ol> : <p className="text-sm text-muted-foreground">No activity yet.</p>}</Panel>
        <div className="space-y-6"><Panel title="Last 7 days" icon={ShieldCheck}><dl className="divide-y-2 divide-foreground/10">{[["Helped", ["released", "restored", "redacted"]], ["Escalated", ["held", "reported_story", "reported_chitchat", "reported_company"]], ["Removed", ["removed_story", "removed_chitchat", "took_down"]], ["Welcomed", ["welcomed"]]].map(([name, keys]) => <div key={name as string} className="flex justify-between py-2.5 text-sm"><dt>{name as string}</dt><dd className="font-display text-lg font-bold">{sum(d.activity7d, keys as string[])}</dd></div>)}</dl></Panel><Panel title="Vocabulary" icon={BrainCircuit}><p className="font-display text-3xl font-bold">{Object.entries(d.termCounts).filter(([k]) => k.startsWith("active:")).reduce((n, [, v]) => n + v, 0).toLocaleString("en-IN")}</p><p className="text-xs text-muted-foreground">active moderation terms</p></Panel></div>
      </div>
    </div>}
  </>;
}

const GROUPS: { title: string; copy: string; rows: { key: keyof Controls; title: string; copy: string }[] }[] = [
  { title: "At the door", copy: "What happens as members submit content.", rows: [
    { key: "blockVulgarity", title: "Block abusive language", copy: "Refuse vulgarity, slurs, identity attacks and threats before publishing." },
    { key: "holdRisky", title: "Hold risky content", copy: "Put uncertain stories and chitchats into the review queue." },
    { key: "fileReports", title: "File Goofy's reports", copy: "Create reports when content or a company needs a human decision." },
    { key: "strikes", title: "Strikes and posting pauses", copy: "Warn after two removals and pause posting after three in 30 days." },
  ]},
  { title: "Review and maintenance", copy: "Automated work after content has been submitted.", rows: [
    { key: "queueSweep", title: "Review the held queue", copy: "Automatically release, redact or remove held content." },
    { key: "redactNames", title: "Hide people's names", copy: "Replace identified people with [name] when that is the only issue." },
    { key: "rescanPublished", title: "Rescan recent posts", copy: "Re-check the last 30 days when moderation vocabulary changes." },
    { key: "refreshWordLists", title: "Refresh open word lists", copy: "Download maintained English and Hindi lists during the daily job." },
    { key: "learnFromOutcomes", title: "Learn from outcomes", copy: "Learn safe words, risky wording, disguised spellings and search concepts." },
  ]},
  { title: "People and messages", copy: "Notifications Goofy sends as the official AutoMod.", rows: [
    { key: "welcomeMembers", title: "Welcome new members", copy: "Send the community ground rules after a member joins." },
    { key: "ghostJobAlerts", title: "Ghost-job alerts", copy: "Warn company followers after several ghost-job stories." },
    { key: "weeklyReports", title: "Weekly follower report", copy: "Send Goofy's weekly activity summary to his followers." },
    { key: "dailyBriefs", title: "Daily moderator brief", copy: "Email admins when urgent or long-waiting items need a person." },
  ]},
];
const JOBS = [{ id: "sweep", label: "Review waiting content", icon: ShieldCheck }, { id: "refresh_lists", label: "Refresh word lists", icon: ListRestart }, { id: "learn", label: "Learn from outcomes", icon: BrainCircuit }] as const;
const jobEnabled = (c: Controls, job: typeof JOBS[number]["id"]) => job === "sweep" ? c.queueSweep : job === "refresh_lists" ? c.refreshWordLists : c.learnFromOutcomes;

export function GoofyControlsPage({ me }: { me: AdminMe }) {
  const q = useGoofy(), qc = useQueryClient(), edit = can(me, "platform"), [running, setRunning] = useState<string | null>(null);
  const { ask, confirmation } = useConfirm();
  const patch = async (body: Partial<Controls>) => { const off = Object.entries(body).find(([, value]) => value === false)?.[0]; if (off && !(await ask({ title: off === "enabled" ? "Pause Goofy completely?" : "Disable this Goofy control?", copy: off === "enabled" ? "All automatic moderation, reports, messages and scheduled Goofy work will stop until you turn him back on." : "This protection or automation will stop for everyone. Other Goofy controls will keep running.", confirm: off === "enabled" ? "Pause Goofy" : "Disable control", danger: true }))) return; try { const r = await adminApi<{ controls: Controls }>("/goofy", { method: "PATCH", body }); qc.setQueryData<Data>(["admin", "goofy"], (o) => o ? { ...o, controls: r.controls } : o); toast.success("Goofy's controls were updated."); } catch (e) { fail(e); } };
  const run = async (job: typeof JOBS[number]["id"], name: string) => { if (!(await ask({ title: `Run “${name}” now?`, copy: "This starts a production Goofy job immediately. It may publish, redact or remove content, or change live moderation vocabulary.", confirm: "Run job" }))) return; setRunning(job); try { await adminApi(`/goofy/run/${job}`, { method: "POST" }); toast.success(`${name} finished.`); void q.refetch(); } catch (e) { fail(e); } finally { setRunning(null); } };
  const c = q.data?.controls;
  return <>
    <PageHead eyebrow="Goofy" title="Controls" copy={edit ? "Choose exactly what Goofy may do. Every change is logged and reaches the API within 30 seconds." : "You can inspect Goofy's controls. Platform access is required to change them."} />
    {!c ? <ControlsSkeleton /> : <div className="space-y-6">
      <section className={cn(card, "p-4 sm:p-5", !c.enabled && "border-flag-red bg-flag-red/5")}><SwitchRow tone="danger" title="Goofy is active" copy="The master control. Turning this off pauses all of Goofy's automatic actions while keeping his history and settings." checked={c.enabled} disabled={!edit} onChange={(v) => void patch({ enabled: v })} /></section>
      <div className="grid gap-6 xl:grid-cols-3">{GROUPS.map((g) => <Panel key={g.title} title={g.title} icon={g.title === "At the door" ? Bot : g.title === "People and messages" ? Users : ShieldCheck}><p className="mb-2 text-xs text-muted-foreground">{g.copy}</p><div className="divide-y-2 divide-foreground/10">{g.rows.map((r) => <SwitchRow key={r.key} title={r.title} copy={r.copy} checked={c[r.key]} disabled={!edit || !c.enabled} onChange={(v) => void patch({ [r.key]: v })} />)}</div></Panel>)}</div>
      <Panel title="Run a job now" icon={Play}><p className="mb-3 text-sm text-muted-foreground">Manual runs use the same controls above and are recorded in the audit log.</p><div className="grid gap-2 sm:grid-cols-3">{JOBS.map((j) => { const last = q.data?.runs.find((r) => r.job === j.id)?.last_run, allowed = jobEnabled(c, j.id); return <button key={j.id} type="button" disabled={!edit || !!running || !c.enabled || !allowed} onClick={() => void run(j.id, j.label)} className="flex items-center gap-3 rounded-lg border-2 border-foreground/15 p-3 text-left disabled:opacity-50 enabled:hover:border-foreground"><j.icon className="size-5 shrink-0 text-primary" /><span className="min-w-0"><span className="block text-sm font-bold">{j.label}</span><span className="block text-xs text-muted-foreground">{!allowed ? "Disabled above" : running === j.id ? "Running…" : last ? `Last ran ${ago(last)}` : "Never run"}</span></span></button>; })}</div></Panel>
    </div>}{confirmation}
  </>;
}
