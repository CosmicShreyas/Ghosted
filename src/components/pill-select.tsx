// A small dropdown in the site's style: a pill that opens a themed menu, with a tick on the current
// choice. Use instead of a plain <select> for filters. Keyboard: Enter or Space opens, arrows move,
// Enter picks, Escape closes.
import { Check, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function PillSelect<T extends string>({ value, options, onChange, label, className }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string; className?: string }) {
  const current = options.find((o) => o.id === value) ?? options[0]!;
  const changed = value !== options[0]?.id; // a filter other than the default gets a tint
  return <DropdownMenu>
    <DropdownMenuTrigger aria-label={`${label}: ${current.label}`}
      className={cn("group inline-flex h-9 items-center gap-1.5 rounded-full border-2 border-foreground pl-3.5 pr-2.5 text-xs font-bold shadow-hard-sm transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:shadow-hard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:translate-y-0 data-[state=open]:shadow-none",
        changed ? "bg-primary text-primary-foreground" : "bg-card", className)}>
      {current.label}
      <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" sideOffset={6} className="min-w-44 rounded-xl border-2 border-foreground p-1.5 shadow-hard">
      <p className="px-2.5 pb-1.5 pt-1 text-xs font-bold text-muted-foreground">{label}</p>
      <div className="grid gap-1">{options.map((o) => {
        const on = o.id === value;
        return <DropdownMenuItem key={o.id} onSelect={() => onChange(o.id)} aria-current={on || undefined}
          className={cn("flex min-h-10 items-center gap-3 rounded-lg px-2.5 font-semibold", on && "bg-primary/10 text-primary")}>
          <span className="flex-1">{o.label}</span>
          <Check className={cn("size-4", on ? "opacity-100" : "opacity-0")} aria-hidden="true" />
        </DropdownMenuItem>;
      })}</div>
    </DropdownMenuContent>
  </DropdownMenu>;
}
