// The company dropdown used everywhere a company is chosen (share a story, Waiting Room). Logos in
// the list and the button, and a search box at the top, since there are hundreds of companies.
// Keyboard: type to search, arrows to move, Enter to pick, Esc to close.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Building2, Check, ChevronDown, Search, X } from "lucide-react";
import { CompanyMark } from "@/components/ghosted";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Company } from "@/mock/data";

// Loose matching: ignores case, accents, dots and spaces ("tcs" finds "T.C.S.", "infy" finds
// "Infosys" by prefix), and ranks name-starts above word-starts above anywhere-in-name.
const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
function rank(name: string, q: string) {
  const n = norm(name), squashed = n.replace(/ /g, "");
  if (!q) return 1;
  if (n.startsWith(q) || squashed.startsWith(q.replace(/ /g, ""))) return 4;
  if (n.split(" ").some((w) => w.startsWith(q))) return 3;
  if (n.includes(q) || squashed.includes(q.replace(/ /g, ""))) return 2;
  // Initials: "hcl t" style abbreviations.
  const initials = n.split(" ").map((w) => w[0]).join("");
  return initials.startsWith(q.replace(/ /g, "")) ? 1.5 : 0;
}

export type ExtraOption = { value: string; label: string; icon?: ReactNode };

export function CompanyPicker({ value, onChange, companies, disabled, placeholder = "Choose a company", extra = [], footer, className, "aria-label": ariaLabel = "Company" }: {
  value: string; onChange: (slug: string) => void; companies: Company[]; disabled?: boolean; placeholder?: string;
  extra?: ExtraOption[]; footer?: (close: () => void, query: string) => ReactNode; className?: string; "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const q = norm(query);
  const results = useMemo(() => companies
    .map((c) => ({ c, r: rank(c.name, q) }))
    .filter((x) => x.r > 0)
    .sort((a, b) => b.r - a.r || a.c.name.localeCompare(b.c.name))
    .slice(0, 80)
    .map((x) => x.c), [companies, q]);
  const options = [...results.map((c) => ({ value: c.id, label: c.name, c })), ...extra.filter((e) => !q || norm(e.label).includes(q)).map((e) => ({ ...e, c: null as Company | null }))];
  useEffect(() => { if (open) { setQuery(""); setActive(Math.max(0, results.findIndex((c) => c.id === value))); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => { listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);

  const pick = (v: string) => { onChange(v); setOpen(false); };
  const selected = companies.find((c) => c.id === value);
  const selectedExtra = extra.find((e) => e.value === value);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(options.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter" && options[active]) { e.preventDefault(); pick(options[active]!.value); }
  };

  return <Popover open={open} onOpenChange={setOpen} modal>
    <PopoverTrigger asChild disabled={disabled}>
      <button type="button" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open}
        className={cn("group flex h-12 w-full items-center gap-2.5 rounded-lg border-2 border-foreground bg-background px-2.5 text-left text-sm font-medium transition-[box-shadow,background-color] hover:bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:bg-card data-[state=open]:shadow-hard-sm", className)}>
        {selected ? <><CompanyMark company={selected} size="sm" /><span className="min-w-0 flex-1 truncate">{selected.name}</span></>
          : selectedExtra ? <><span className="grid size-9 shrink-0 place-items-center rounded-lg border-2 border-dashed border-foreground/40">{selectedExtra.icon ?? <Building2 className="size-4" />}</span><span className="min-w-0 flex-1 truncate">{selectedExtra.label}</span></>
          : <><span className="grid size-9 shrink-0 place-items-center rounded-lg border-2 border-dashed border-foreground/30 text-muted-foreground"><Building2 className="size-4" /></span><span className="min-w-0 flex-1 truncate text-muted-foreground">{placeholder}</span></>}
        <ChevronDown className="size-4 shrink-0 opacity-60 transition-transform group-data-[state=open]:rotate-180" />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" sideOffset={6} onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).querySelector("input")?.focus(); }}
      className="w-[var(--radix-popover-trigger-width)] min-w-64 overflow-hidden rounded-xl border-2 border-foreground bg-card p-0 shadow-hard">
      <label className="flex items-center gap-2 border-b-2 border-foreground/10 px-3">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey} placeholder="Search companies" aria-label="Search companies" aria-controls="company-options"
          className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
        {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>}
      </label>
      <ul ref={listRef} id="company-options" role="listbox" data-lenis-prevent className="max-h-72 overflow-y-auto overscroll-contain p-1.5">
        {options.length ? options.map((o, i) => {
          const on = o.value === value;
          return <li key={o.value} role="option" aria-selected={on} data-i={i} onMouseEnter={() => setActive(i)} onClick={() => pick(o.value)}
            className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm", i === active && "bg-muted", on && "font-bold")}>
            {o.c ? <CompanyMark company={o.c} size="sm" /> : <span className="grid size-9 shrink-0 place-items-center rounded-lg border-2 border-dashed border-foreground/40">{"icon" in o && o.icon ? o.icon : <Building2 className="size-4" />}</span>}
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
            {on && <Check className="size-4 shrink-0 text-primary" />}
          </li>;
        }) : <li className="px-3 py-6 text-center text-sm text-muted-foreground">No company called “{query.trim()}” yet.</li>}
      </ul>
      {footer && <div className="border-t-2 border-foreground/10 p-1.5">{footer(() => setOpen(false), query.trim())}</div>}
    </PopoverContent>
  </Popover>;
}
