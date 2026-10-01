// The audit log: every admin action, page by page, with filters by area, person and words. Each
// entry shows who (with their avatar), what in plain words, what it was about and the details.
import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Ban, Bot, Building2, Flag, KeyRound, ScrollText, ShieldCheck, SlidersHorizontal, UserCog, Users, type LucideIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { adminApi, SITE_URL } from "../api";
import { actionText, detailLines } from "../describe";
import { ago, card, Empty, PageHead, Pager, Peep, Segmented } from "../ui";

type Entry = { id: number; who: string; avatarSeed: string | null; action: string; targetKind: string | null; targetRef: string | null; detail: Record<string, unknown> | null; at: string };
type Res = { page: number; size: number; total: number; pages: number; people: { name: string; email: string }[]; items: Entry[] };
type Area = "all" | "moderation" | "goofy" | "members" | "team" | "platform" | "account" | "catalogue";

const KIND: { test: RegExp; icon: LucideIcon; tone: string }[] = [
  { test: /^(queue|report|term)_/, icon: Flag, tone: "bg-avatar-sky" },
  { test: /^member_banned|^ip_banned/, icon: Ban, tone: "bg-flag-red text-primary-foreground" },
  { test: /^(member|ip)_/, icon: Users, tone: "bg-avatar-mint" },
  { test: /^team_/, icon: UserCog, tone: "bg-avatar-lilac" },
  { test: /^platform_/, icon: SlidersHorizontal, tone: "bg-accent" },
  { test: /^goofy_/, icon: Bot, tone: "bg-avatar-lilac" },
  { test: /^(company|feedback)_/, icon: Building2, tone: "bg-avatar-amber" },
  { test: /^(mfa|session)_/, icon: ShieldCheck, tone: "bg-flag-green/20" },
];
const kindOf = (a: string) => KIND.find((k) => k.test.test(a)) ?? { icon: KeyRound, tone: "bg-muted" };

function target(e: Entry) {
  if (!e.targetRef) return null;
  const link = e.targetKind === "profile" ? `${SITE_URL}/u/${e.targetRef}` : e.targetKind === "company" ? `${SITE_URL}/c/${e.targetRef}` : e.targetKind === "story" ? `${SITE_URL}/s/${e.targetRef}` : null;
  const label = e.targetKind === "profile" ? `member ${e.targetRef}` : e.targetKind === "admin" ? e.targetRef : e.targetKind === "ip" ? `connection ${e.targetRef}` : `${e.targetKind ?? ""} ${e.targetRef}`.trim();
  return link ? <a href={link} target="_blank" rel="noopener noreferrer" className="font-semibold underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground">{label}</a> : <span className="font-semibold">{label}</span>;
}
const dayLabel = (iso: string) => { const d = new Date(iso), t = new Date(); const y = new Date(Date.now() - 86400_000); return d.toDateString() === t.toDateString() ? "Today" : d.toDateString() === y.toDateString() ? "Yesterday" : d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); };

export function AuditPage({ search }: { search: string }) {
  const [page, setPage] = useState(1);
  const [area, setArea] = useState<Area>("all");
  const [who, setWho] = useState("all");
  const [q, setQ] = useState("");
  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => setPage(1), [area, who, q]);
  const params = new URLSearchParams({ page: String(page), size: "25", area, ...(who !== "all" && { who }), ...(q && { q }) });
  const res = useQuery({ queryKey: ["admin", "audit", params.toString()], queryFn: () => adminApi<Res>(`/audit?${params}`), placeholderData: keepPreviousData });
  const d = res.data;
  const go = (p: number) => { setPage(p); scrollTo({ top: 0, behavior: "smooth" }); };
  let lastDay = "";

  return <>
    <PageHead eyebrow="Control" title="Audit log" copy="Every admin action, newest first. It's append-only: the database refuses edits and deletions, even from owners." />
    <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center">
      <div className="no-scrollbar -mx-1 overflow-x-auto px-1"><Segmented label="Area" value={area} onChange={setArea} options={[{ id: "all", label: "Everything" }, { id: "moderation", label: "Moderation" }, { id: "goofy", label: "Goofy" }, { id: "members", label: "Members" }, { id: "team", label: "Team" }, { id: "platform", label: "Platform" }, { id: "catalogue", label: "Companies and feedback" }, { id: "account", label: "Sign-ins" }]} /></div>
      <div className="flex flex-1 justify-stretch sm:justify-end">
        <Select value={who} onValueChange={setWho}>
          <SelectTrigger className="h-10 w-full rounded-lg border-2 border-foreground bg-card font-semibold sm:w-48"><SelectValue placeholder="Everyone" /></SelectTrigger>
          <SelectContent className="border-2 border-foreground"><SelectItem value="all">Everyone</SelectItem>{(d?.people ?? []).map((p) => <SelectItem key={p.email} value={p.email}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </div>

    {!d ? <div className={cn(card, "space-y-0 divide-y-2 divide-foreground/10")}>{Array.from({ length: 8 }, (_, i) => <div key={i} className="flex items-center gap-3 p-4"><div className="skeleton size-10 rounded-full" /><div className="flex-1 space-y-2"><div className="skeleton h-4 w-2/3 rounded" /><div className="skeleton h-3 w-1/3 rounded" /></div></div>)}</div>
      : !d.items.length ? <Empty icon={ScrollText} title="Nothing matches" copy="Try another area, person or search." />
      : <div className={cn("transition-opacity", res.isFetching && "opacity-60")}>
        <ol className={cn(card, "overflow-hidden")}>{d.items.map((e) => {
          const day = dayLabel(e.at); const head = day !== lastDay; lastDay = day;
          const k = kindOf(e.action);
          const lines = detailLines(e.action, e.detail);
          return <li key={e.id}>
            {head && <p className={cn("bg-muted/70 px-4 py-2 text-xs font-bold", lastDay !== "" && "border-b-2 border-foreground/10", d.items[0]!.id !== e.id && "border-t-2")}>{day}</p>}
            <div className="flex flex-wrap items-start gap-3 border-b-2 border-foreground/5 px-3 py-3 sm:flex-nowrap sm:px-4">
              <span className="relative shrink-0">
                {e.avatarSeed ? <Peep seed={e.avatarSeed} className="size-10" /> : <span className="grid size-10 place-items-center rounded-full border-2 border-foreground bg-muted font-bold">{e.who[0]}</span>}
                <span className={cn("absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full border-2 border-foreground", k.tone)}><k.icon className="size-2.5" /></span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm"><b>{e.who}</b> {actionText(e.action)} {target(e)}</p>
                {lines.length > 0 && <ul className="mt-1 space-y-0.5">{lines.map((l, i) => <li key={i} className="break-words text-xs text-muted-foreground">{l}</li>)}</ul>}
              </div>
              <time dateTime={e.at} title={new Date(e.at).toLocaleString("en-IN")} className="ml-[3.25rem] shrink-0 text-xs text-muted-foreground sm:ml-0">{ago(e.at)}</time>
            </div>
          </li>;
        })}</ol>
        <Pager page={d.page} pages={d.pages} total={d.total} size={d.size} onPage={go} />
      </div>}
  </>;
}
