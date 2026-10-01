// A date input that opens Ghosted's own calendar instead of the browser's: a popover on desktop,
// a bottom sheet on phones and tablets. Values are "YYYY-MM-DD" strings, like a native date input.
import { useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useIsTouchLayout } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromIso = (s: string) => new Date(`${s}T00:00:00`);
const pretty = (s: string) => fromIso(s).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

export function DateField({ value, onChange, min, max, label, className }: { value: string; onChange: (v: string) => void; min?: string; max?: string; label: string; className?: string }) {
  const touch = useIsTouchLayout();
  const [open, setOpen] = useState(false);
  const selected = value ? fromIso(value) : undefined;
  const lo = min ? fromIso(min) : undefined, hi = max ? fromIso(max) : undefined;
  const inRange = (d: Date) => (!lo || d >= lo) && (!hi || d <= hi);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const quick = [["Today", 0], ["Yesterday", 1], ["A week ago", 7], ["Two weeks ago", 14]] as const;
  const pick = (d: Date | undefined) => { if (d && inRange(d)) { onChange(toIso(d)); setOpen(false); } };

  const body = <div className="space-y-3">
    <Calendar mode="single" selected={selected} onSelect={pick} defaultMonth={selected ?? hi ?? today}
      disabled={[...(lo ? [{ before: lo }] : []), ...(hi ? [{ after: hi }] : [])]} {...(lo && { startMonth: lo })} {...(hi && { endMonth: hi })}
      className="mx-auto rounded-lg [--cell-size:2.5rem] sm:[--cell-size:2.2rem]" />
    <div className="flex flex-wrap gap-1.5 border-t-2 border-foreground/10 px-1 pt-3">{quick.map(([l, n]) => {
      const d = new Date(today.getTime() - n * 86400_000);
      return <button key={l} type="button" disabled={!inRange(d)} onClick={() => pick(d)} className="rounded-full border-2 border-foreground/15 px-2.5 py-1 text-xs font-semibold hover:border-foreground disabled:opacity-40">{l}</button>;
    })}</div>
  </div>;

  const trigger = <button type="button" onClick={() => setOpen(true)} aria-label={`${label}: ${value ? pretty(value) : "not set"}`} aria-haspopup="dialog"
    className={cn("group flex h-11 w-full items-center gap-2 rounded-lg border-2 border-foreground bg-background px-3 text-left text-sm font-medium transition-[box-shadow,background-color] hover:bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[state=open]:bg-card data-[state=open]:shadow-hard-sm", className)}>
    <CalendarDays className="size-4 shrink-0 text-primary" />
    <span className={cn("min-w-0 flex-1 truncate", !value && "text-muted-foreground")}>{value ? pretty(value) : "Pick a date"}</span>
    <ChevronDown className="size-4 shrink-0 opacity-60 transition-transform group-data-[state=open]:rotate-180" />
  </button>;

  if (touch) return <>
    {trigger}
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerContent className="rounded-t-2xl border-2 border-b-0 border-foreground bg-card pb-[max(1rem,env(safe-area-inset-bottom))]">
        <DrawerHeader className="text-left"><DrawerTitle>{label}</DrawerTitle><DrawerDescription>{value ? pretty(value) : "Pick a day"}</DrawerDescription></DrawerHeader>
        <div className="px-4">{body}</div>
      </DrawerContent>
    </Drawer>
  </>;
  return <Popover open={open} onOpenChange={setOpen} modal>
    <PopoverTrigger asChild>{trigger}</PopoverTrigger>
    <PopoverContent align="start" sideOffset={6} className="w-auto rounded-xl border-2 border-foreground bg-card p-3 shadow-hard">{body}</PopoverContent>
  </Popover>;
}
