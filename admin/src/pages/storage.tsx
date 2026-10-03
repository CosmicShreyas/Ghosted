// Storage: how much of the database plan Ghosted uses, what one story costs, and how long the space
// lasts at the current pace. Exact sizes come from Postgres (admin_storage_stats in init_database.sql);
// without that function the page shows an estimate from row counts. The plan limit is configurable.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Database, Gauge, HardDrive, Info, PenLine, Save, Timer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiRequestError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { adminApi, type AdminMe } from "../api";
import { can } from "../perms";
import { field, PageHead, Panel, Skeleton } from "../ui";

type Storage = {
  exact: boolean; limitMb: number; usedBytes: number; limitBytes: number; remainingBytes: number; percent: number;
  stories: number; storiesLast30: number; bytesPerStory: number; storiesThatFit: number; daysLeft: number | null;
  tables: { name: string; rows: number; bytes: number; indexBytes: number }[];
};

export const bytes = (b: number) => (b < 1024 ? `${b} B` : b < 1024 ** 2 ? `${(b / 1024).toFixed(1)} KB` : b < 1024 ** 3 ? `${(b / 1024 ** 2).toFixed(b < 10 * 1024 ** 2 ? 2 : 1)} MB` : `${(b / 1024 ** 3).toFixed(2)} GB`);
const num = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${+(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k` : String(n));
const tone = (p: number) => (p >= 90 ? "bg-flag-red" : p >= 70 ? "bg-flag-amber" : "bg-flag-green");

export function StoragePage({ me }: { me: AdminMe }) {
  const qc = useQueryClient();
  // Refreshes every 30 seconds while the page is open.
  const q = useQuery({ queryKey: ["admin", "storage"], queryFn: () => adminApi<Storage>("/storage"), refetchInterval: 30_000 });
  const s = q.data;
  const [limit, setLimit] = useState("");
  useEffect(() => { if (s) setLimit(String(s.limitMb)); }, [s?.limitMb]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveLimit = async () => {
    const mb = Number(limit);
    if (!Number.isInteger(mb) || mb < 50) { toast.error("Use a whole number of MB, at least 50."); return; }
    try { await adminApi("/platform", { method: "PATCH", body: { storageLimitMb: mb } }); toast.success(`Limit set to ${mb} MB.`); void qc.invalidateQueries({ queryKey: ["admin", "storage"] }); }
    catch (e) { toast.error(e instanceof ApiRequestError ? e.message : "Couldn't save the limit."); }
  };

  return <>
    <PageHead eyebrow="Control" title="Storage" copy="How much of the database plan Ghosted uses, what each story costs, and how long the space lasts at the current pace. Updates every 30 seconds." />
    {!s ? <Skeleton rows={3} h="h-40" /> : <div className="space-y-6">
      {!s.exact && <p className="flex items-start gap-2 rounded-lg border-2 border-flag-amber bg-flag-amber/10 p-3 text-sm"><Info className="mt-0.5 size-4 shrink-0" />These numbers are estimated from row counts. Run the “Storage use” section of init_database.sql in Supabase for exact sizes.</p>}

      {/* The gauge */}
      <section className="rounded-2xl border-2 border-foreground bg-card p-5 shadow-hard sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="flex items-center gap-2 text-sm font-bold text-muted-foreground"><HardDrive className="size-4" />Database storage</p>
            <p className="mt-1 font-display text-5xl font-bold tabular-nums">{bytes(s.usedBytes)} <span className="text-2xl text-muted-foreground">of {bytes(s.limitBytes)}</span></p></div>
          <p className={cn("font-display text-4xl font-bold tabular-nums", s.percent >= 90 ? "text-flag-red" : s.percent >= 70 ? "text-flag-amber" : "text-flag-green")}>{s.percent}%</p>
        </div>
        <div className="relative mt-5 h-5 rounded-full border-2 border-foreground bg-muted">
          <motion.div className={cn("h-full rounded-full", tone(s.percent))} initial={{ width: 0 }} animate={{ width: `${Math.max(1, s.percent)}%` }} transition={{ type: "spring", stiffness: 90, damping: 20 }} />
          {[70, 90].map((m) => <span key={m} aria-hidden="true" className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground bg-card" style={{ left: `${m}%` }} />)}
        </div>
        <div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>0</span><span>{bytes(s.remainingBytes)} free</span><span>{bytes(s.limitBytes)}</span></div>
      </section>

      {/* What it means */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{([
        [PenLine, "Stories so far", num(s.stories), `${num(s.storiesLast30)} in the last 30 days`],
        [Database, "Space per story", bytes(s.bytesPerStory), "The story plus its reactions, chitchats and notifications"],
        [Gauge, "Stories that still fit", num(s.storiesThatFit), "At the current size per story"],
        [Timer, "Space lasts", s.daysLeft == null ? "No new stories yet" : s.daysLeft > 3650 ? "10+ years" : s.daysLeft > 365 ? `${(s.daysLeft / 365).toFixed(1)} years` : `${s.daysLeft} days`, "At the last 30 days' pace"],
      ] as const).map(([Icon, label, value, note]) => <div key={label} className="rounded-xl border-2 border-foreground bg-card p-4 shadow-hard-sm">
        <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground"><Icon className="size-3.5" />{label}</p>
        <p className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{note}</p>
      </div>)}</div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Panel title="Where the space goes" icon={Database}>
          <ul className="space-y-2.5">{s.tables.map((t) => { const share = s.usedBytes ? (t.bytes / s.usedBytes) * 100 : 0; return <li key={t.name}>
            <div className="flex items-baseline justify-between gap-3 text-sm"><span className="truncate font-mono font-semibold">{t.name}</span><span className="shrink-0 tabular-nums text-muted-foreground">{num(t.rows)} rows · <b className="text-foreground">{bytes(t.bytes)}</b></span></div>
            <div className="mt-1 h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0.5, share)}%` }} /></div>
          </li>; })}</ul>
          <p className="mt-3 text-xs text-muted-foreground">Sizes include indexes. Postgres and Supabase's own tables make up the rest of the total.</p>
        </Panel>
        <Panel title="Plan limit" icon={HardDrive} className="h-fit">
          <p className="text-sm text-muted-foreground">The storage your database plan allows. Supabase's free plan is 500 MB; set this to match your plan.</p>
          <div className="mt-3 flex gap-2"><label className="flex-1"><span className="sr-only">Limit in MB</span><Input inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value.replace(/\D/g, ""))} disabled={!can(me, "platform")} className={field} /></label><span className="self-center text-sm font-bold">MB</span></div>
          {can(me, "platform") ? <Button className="mt-3" disabled={limit === String(s.limitMb)} onClick={() => void saveLimit()}><Save />Save limit</Button> : <p className="mt-2 text-xs text-muted-foreground">Ask an owner for platform access to change it.</p>}
        </Panel>
      </div>
    </div>}
  </>;
}
