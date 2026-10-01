// The team: who has access and to what. A role gives a starting set of permissions; owners can tick
// a custom set for anyone, switch someone's sign-in off (it stays off even for ADMIN_EMAILS people),
// sign them out everywhere, or add someone new.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, KeyRound, LogOut, Plus, Power, ServerCog, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ApiRequestError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { adminApi, type AdminMe } from "../api";
import { can, ROLE_COPY, ROLE_LABEL, type Permission } from "../perms";
import { ago, card, Chip, field, PageHead, Peep, useConfirm } from "../ui";
import { TeamSkeleton } from "../page-skeletons";

const fail = (e: unknown) => toast.error(e instanceof ApiRequestError ? e.message : "Couldn't do that.");
type Role = keyof typeof ROLE_LABEL;
type Member = { name: string; email: string | null; role: Role; custom: boolean; permissions: Permission[]; avatarSeed: string; fromEnv: boolean; active: boolean; disabled: boolean; disabledBy: string | null; mfa: boolean; ready: boolean; lastLoginAt: string | null; addedBy: string | null; you: boolean };
type Team = { roles: Record<Role, Permission[]>; permissions: { id: Permission; label: string }[]; items: Member[] };
const ROLES: Role[] = ["owner", "admin", "moderator", "viewer"];

export function TeamPage({ me }: { me: AdminMe }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "team"], queryFn: () => adminApi<Team>("/team") });
  const [adding, setAdding] = useState(false);
  const manage = can(me, "team");
  const reload = () => void qc.invalidateQueries({ queryKey: ["admin", "team"] });
  const t = q.data;
  const people = (t?.items ?? []).filter((m) => m.active);
  return <>
    <PageHead eyebrow="People" title="Team" copy="Everyone with access to this panel. People listed in ADMIN_EMAILS on the server keep the role set there; everything else is managed here."
      action={manage ? <Button onClick={() => setAdding((a) => !a)}><UserPlus />Add someone</Button> : undefined} />
    <AnimatePresence>{adding && t && <AddPerson key="add" me={me} onDone={() => { setAdding(false); reload(); }} onCancel={() => setAdding(false)} />}</AnimatePresence>

    {!t ? <TeamSkeleton /> : <>
      <ul className="space-y-3">{people.map((m) => <Person key={m.email ?? m.name} m={m} team={t} me={me} manage={manage} onChange={reload} />)}</ul>

      <section className="mt-8">
        <h2 className="font-display text-xl font-bold">What each role can do</h2>
        <p className="text-sm text-muted-foreground">The starting point. Owners can tick a different set for anyone.</p>
        <div className={cn(card, "mt-3 hidden overflow-x-auto sm:block")}>
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b-2 border-foreground"><th className="p-3 text-left font-bold">Permission</th>{ROLES.map((r) => <th key={r} className="p-3 text-center font-bold">{ROLE_LABEL[r]}</th>)}</tr></thead>
            <tbody>{t.permissions.map((p) => <tr key={p.id} className="border-b-2 border-foreground/5 last:border-0"><td className="p-3">{p.label}</td>{ROLES.map((r) => <td key={r} className="p-3 text-center">{t.roles[r].includes(p.id) ? <span className="mx-auto grid size-4 place-content-center rounded-sm border-2 border-foreground bg-primary text-primary-foreground"><Check className="size-3.5" strokeWidth={3} /></span> : <span className="mx-auto block size-4 rounded-sm border-2 border-foreground/20 bg-background" />}</td>)}</tr>)}</tbody>
          </table>
        </div>
        <ul className="mt-3 space-y-2 sm:hidden">{t.permissions.map((p) => <li key={p.id} className={cn(card, "p-3")}><p className="text-sm font-bold">{p.label}</p><div className="mt-2 flex flex-wrap gap-1.5">{ROLES.filter((r) => t.roles[r].includes(p.id)).map((r) => <Chip key={r} tone="bg-primary/15 text-primary"><Check className="size-3" />{ROLE_LABEL[r]}</Chip>)}</div></li>)}</ul>
      </section>
    </>}
  </>;
}

function Person({ m, team, me, manage, onChange }: { m: Member; team: Team; me: AdminMe; manage: boolean; onChange: () => void }) {
  const { ask, confirmation } = useConfirm();
  const [open, setOpen] = useState(false);
  const [perms, setPerms] = useState<Permission[]>(m.permissions);
  const [busy, setBusy] = useState(false);
  const editable = manage && !m.you && (m.role !== "owner" || me.role === "owner");
  const patch = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try { await adminApi(`/team/${encodeURIComponent(m.email!)}`, { method: "PATCH", body }); toast.success(ok); onChange(); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const post = async (path: string, method: string, ok: string) => { try { await adminApi(`/team/${encodeURIComponent(m.email!)}${path}`, { method }); toast.success(ok); onChange(); } catch (e) { fail(e); } };
  const status = m.disabled ? { label: "Sign-in off", tone: "bg-flag-red text-primary-foreground" } : !m.ready ? { label: "Hasn't set a password", tone: "bg-accent" } : null;

  return <><li className={cn(card, "overflow-hidden", m.disabled && "opacity-75")}>
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 p-4 sm:flex sm:flex-wrap sm:items-center sm:gap-4">
      <Peep seed={m.avatarSeed} className="size-12 sm:size-14" />
      <div className="min-w-0 sm:flex-1">
        <p className="flex flex-wrap items-center gap-2 font-display text-lg font-bold">{m.name}{m.you && <Chip>You</Chip>}</p>
        {m.email && <p className="truncate text-sm text-muted-foreground">{m.email}</p>}
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Chip tone={m.role === "owner" ? "bg-primary text-primary-foreground" : "bg-muted"}>{ROLE_LABEL[m.role]}{m.custom && ", custom access"}</Chip>
          {m.fromEnv && <Chip><ServerCog className="size-3" />From ADMIN_EMAILS</Chip>}
          {m.mfa && <Chip tone="bg-flag-green/15 text-flag-green"><ShieldCheck className="size-3" />Two-step on</Chip>}
          {status && <Chip tone={status.tone}>{status.label}</Chip>}
        </div>
      </div>
      <p className="col-start-2 text-xs text-muted-foreground sm:col-auto">{m.lastLoginAt ? `Last in ${ago(m.lastLoginAt)}` : "Never signed in"}</p>
      {editable && <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="col-start-2 flex w-fit items-center gap-1 rounded-lg border-2 border-foreground px-3 py-1.5 text-sm font-bold hover:bg-muted sm:col-auto">Manage<ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} /></button>}
    </div>
    <AnimatePresence initial={false}>{open && <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
      <div className="space-y-5 border-t-2 border-foreground/10 bg-muted/30 p-4">
        <div>
          <p className="mb-2 text-sm font-bold">Role {m.fromEnv && <span className="font-normal text-muted-foreground">(set in ADMIN_EMAILS on the server)</span>}</p>
          <div className="grid gap-2 sm:grid-cols-4">{ROLES.map((r) => <button key={r} type="button" disabled={m.fromEnv || busy || (r === "owner" && me.role !== "owner")} onClick={() => void ask({ title: `Change ${m.name}'s role?`, copy: `This will replace their current access with the ${ROLE_LABEL[r]} defaults.`, confirm: "Change role", danger: r === "owner" }).then((ok) => ok && patch({ role: r, permissions: null }, `${m.name} is now ${ROLE_LABEL[r].toLowerCase()}.`))}
            className={cn("rounded-lg border-2 p-2.5 text-left disabled:cursor-not-allowed disabled:opacity-50", m.role === r ? "border-foreground bg-primary text-primary-foreground" : "border-foreground/15 bg-card hover:border-foreground")}>
            <span className="block text-sm font-bold">{ROLE_LABEL[r]}</span><span className={cn("block text-xs", m.role === r ? "opacity-85" : "text-muted-foreground")}>{ROLE_COPY[r]}</span>
          </button>)}</div>
        </div>
        {m.role !== "owner" && <div>
          <p className="mb-2 text-sm font-bold">Access</p>
          <div className="grid gap-1.5 sm:grid-cols-2">{team.permissions.map((p) => {
            const on = perms.includes(p.id);
            const locked = p.id === "team" && me.role !== "owner";
            return <label key={p.id} className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg border-2 px-3 py-2 text-sm", on ? "border-foreground bg-card" : "border-foreground/10", locked && "cursor-not-allowed opacity-50")}>
              <Checkbox checked={on} disabled={locked} onCheckedChange={() => setPerms((ps) => (on ? ps.filter((x) => x !== p.id) : [...ps, p.id]))} />{p.label}
            </label>;
          })}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => void ask({ title: `Change ${m.name}'s access?`, copy: "Their admin permissions will change immediately and may remove access to parts of this panel.", confirm: "Save access" }).then((ok) => ok && patch({ permissions: perms }, "Access saved."))}><Check />Save access</Button>
            {m.custom && <Button size="sm" variant="outline" disabled={busy} onClick={() => void ask({ title: `Restore ${m.name}'s role defaults?`, copy: "Their custom permission choices will be discarded and replaced immediately.", confirm: "Use role defaults" }).then(async (ok) => { if (ok) { setPerms(team.roles[m.role]); await patch({ permissions: null }, `Back to the ${ROLE_LABEL[m.role].toLowerCase()} defaults.`); } })}>Use role defaults</Button>}
          </div>
        </div>}
        <div className="flex flex-wrap gap-2 border-t-2 border-foreground/10 pt-4">
          <Button size="sm" variant={m.disabled ? "default" : "destructive"} disabled={busy} onClick={() => m.disabled ? void patch({ disabled: false }, `${m.name} can sign in again.`) : void ask({ title: `Turn off sign-in for ${m.name}?`, copy: "Their active sessions will end and they will be unable to sign in until an owner restores access.", confirm: "Turn sign-in off", danger: true }).then((ok) => ok && patch({ disabled: true }, `${m.name}'s sign-in is off and their sessions are ended.`))}><Power />{m.disabled ? "Turn sign-in back on" : "Turn sign-in off"}</Button>
          <Button size="sm" variant="outline" onClick={() => void ask({ title: `Sign ${m.name} out everywhere?`, copy: "All of their current admin sessions will end. Their account remains active and they can sign in again.", confirm: "Sign out everywhere", danger: true }).then((ok) => ok && post("/sign-out", "POST", `${m.name} is signed out everywhere.`))}><LogOut />Sign out everywhere</Button>
          {!m.fromEnv && <Button size="sm" variant="ghost" className="text-flag-red" onClick={() => void ask({ title: `Remove ${m.name} from the team?`, copy: "They will lose admin access and all active sessions will end. This cannot be undone from their account.", confirm: "Remove from team", danger: true }).then((ok) => ok && post("", "DELETE", `${m.name} was removed.`))}><Trash2 />Remove</Button>}
        </div>
      </div>
    </motion.div>}</AnimatePresence>
  </li>{confirmation}</>;
}

function AddPerson({ me, onDone, onCancel }: { me: AdminMe; onDone: () => void; onCancel: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("moderator");
  const [busy, setBusy] = useState(false);
  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { const r = await adminApi<{ message: string }>("/team", { method: "POST", body: { email, name, role } }); toast.success(r.message); onDone(); } catch (err) { fail(err); } finally { setBusy(false); }
  };
  return <motion.form onSubmit={(e) => void add(e)} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className={cn(card, "mb-6 p-5")}>
    <p className="flex items-center gap-2 font-display text-lg font-bold"><Plus className="size-4" />Add someone to the team</p>
    <p className="text-sm text-muted-foreground">They open the panel, choose “First time here”, get a code by email and set their own password. Nobody else ever sees it.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="block"><span className="mb-1 block text-sm font-bold">Email</span><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} /></label>
      <label className="block"><span className="mb-1 block text-sm font-bold">Name</span><Input required value={name} onChange={(e) => setName(e.target.value)} className={field} maxLength={60} /></label>
    </div>
    <div className="mt-3 flex flex-wrap gap-2">{ROLES.filter((r) => r !== "owner" || me.role === "owner").map((r) => <button key={r} type="button" onClick={() => setRole(r)} className={cn("rounded-full border-2 border-foreground px-3 py-1 text-sm font-bold", role === r ? "bg-foreground text-background" : "bg-card")}>{ROLE_LABEL[r]}</button>)}</div>
    <p className="mt-2 text-xs text-muted-foreground">{ROLE_COPY[role]}</p>
    <div className="mt-4 flex flex-wrap gap-2"><Button className="max-sm:flex-1" type="submit" disabled={busy}><KeyRound />Add to the team</Button><Button className="max-sm:flex-1" type="button" variant="ghost" onClick={onCancel}>Cancel</Button></div>
  </motion.form>;
}
