// Small building blocks shared by the admin screens, in Ghosted's own style.
import type { ReactNode } from "react";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export const card = "rounded-xl border-2 border-foreground bg-card shadow-hard-sm";

// `eyebrow` names the section the page belongs to; it sits quietly beside the title, not above it.
export function PageHead({ eyebrow, title, copy, action }: { eyebrow?: string; title: string; copy?: string; action?: ReactNode }) {
  return <div className="mb-5 flex flex-col items-stretch gap-3 border-b-2 border-foreground/10 pb-4 sm:mb-6 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:pb-5">
    <div className="min-w-0">
      <h1 className="flex flex-wrap items-baseline gap-x-3 font-display text-3xl font-bold sm:text-4xl">{title}{eyebrow && <span className="text-sm font-semibold text-muted-foreground">{eyebrow}</span>}</h1>
      {copy && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{copy}</p>}
    </div>
    {action && <div className="no-scrollbar max-w-full overflow-x-auto pb-0.5 sm:ml-auto sm:overflow-visible sm:pb-0">{action}</div>}
  </div>;
}

export function Peep({ seed, className, pastel = "bg-avatar-lilac" }: { seed: string; className?: string; pastel?: string }) {
  return <img src={`https://api.dicebear.com/9.x/open-peeps/svg?seed=${encodeURIComponent(seed)}`} alt="" className={cn("shrink-0 rounded-full border-2 border-foreground object-cover", pastel, className ?? "size-10")} />;
}

// A labelled on/off row (settings, platform switches).
export function SwitchRow({ title, copy, checked, onChange, disabled, tone }: { title: string; copy?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; tone?: "danger" }) {
  return <label className={cn("flex cursor-pointer items-start gap-4 py-3.5", disabled && "cursor-not-allowed opacity-60")}>
    <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{title}</span>{copy && <span className="mt-0.5 block text-xs text-muted-foreground">{copy}</span>}</span>
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className={cn("relative mt-0.5 h-7 w-12 shrink-0 rounded-full border-2 border-foreground transition-colors", checked ? (tone === "danger" ? "bg-flag-red" : "bg-primary") : "bg-muted")}>
      <motion.span aria-hidden="true" className="absolute top-0.5 left-0.5 size-5 rounded-full border-2 border-foreground bg-card" initial={false} animate={{ x: checked ? 20 : 0 }} transition={{ type: "spring", stiffness: 500, damping: 32 }} />
    </button>
  </label>;
}

export function Panel({ title, icon: Icon, action, children, className }: { title?: string; icon?: LucideIcon; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={cn(card, "p-4 sm:p-5", className)}>
    {title && <div className="mb-3 flex flex-wrap items-center gap-2">{Icon && <Icon className="size-4 text-primary" />}<h2 className="font-display text-lg font-bold">{title}</h2><span className="ml-auto" />{action && <span className="max-w-full">{action}</span>}</div>}
    {children}
  </section>;
}

// Fourteen hard-edged bars; today is the last one, marked with a ball.
export function Bars({ values, days, label, tone = "bg-primary" }: { values: number[]; days: string[]; label: string; tone?: string }) {
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  return <div>
    <div className="flex items-baseline justify-between"><p className="text-sm font-bold">{label}</p><p className="font-display text-2xl font-bold tabular-nums">{total.toLocaleString("en-IN")}</p></div>
    <div className="mt-3 flex h-24 items-end gap-1" role="img" aria-label={`${label}: ${values.join(", ")} over the last ${values.length} days`}>
      {values.map((v, i) => <div key={days[i]} className="group relative flex h-full flex-1 flex-col justify-end">
        <span className="pointer-events-none absolute -top-6 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-bold text-background opacity-0 transition-opacity group-hover:opacity-100">{v} on {new Date(days[i]!).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
        <motion.span className={cn("block rounded-t-[3px] border-2 border-b-0 border-foreground", tone, v === 0 && "border-foreground/20 bg-transparent")} initial={{ height: 0 }} animate={{ height: `${Math.max(v ? 8 : 4, (v / max) * 100)}%` }} transition={{ delay: i * 0.02, type: "spring", stiffness: 260, damping: 28 }} />
        {i === values.length - 1 && <span aria-hidden="true" className="absolute -bottom-2.5 left-1/2 size-2.5 -translate-x-1/2 rounded-full bg-foreground" />}
      </div>)}
    </div>
    <div className="mt-1 h-0.5 bg-foreground" />
  </div>;
}

// A popup in the middle of the screen: grows out from the centre, dims the page, Esc or a click
// outside closes it. Tall content scrolls inside; on phones it fills most of the screen.
export function Modal({ open, onClose, title, subtitle, children, footer, size = "md", tone }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg"; tone?: "danger" }) {
  useEffect(() => {
    if (!open) return;
    const f = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    addEventListener("keydown", f);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { removeEventListener("keydown", f); document.body.style.overflow = prev; };
  }, [open, onClose]);
  return createPortal(<AnimatePresence>{open && <motion.div key="modal" className="fixed inset-0 z-[60] grid place-items-center p-3 sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
    <motion.div role="dialog" aria-modal="true" className={cn("relative flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-2xl border-2 bg-background shadow-hard sm:max-h-[calc(100dvh-3rem)]", tone === "danger" ? "border-flag-red" : "border-foreground", size === "sm" ? "max-w-md" : size === "md" ? "max-w-xl" : "max-w-3xl")}
      initial={{ scale: 0.92, y: 12, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.95, y: 8, opacity: 0 }} transition={{ type: "spring", stiffness: 380, damping: 30 }}>
      <div className="flex items-start gap-3 border-b-2 border-foreground/10 px-5 py-4">
        <div className="min-w-0 flex-1"><h2 className="font-display text-xl font-bold">{title}</h2>{subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}</div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-lg border-2 border-foreground hover:bg-muted"><X className="size-4" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5" data-lenis-prevent>{children}</div>
      {footer && <div className="flex flex-wrap items-center gap-2 border-t-2 border-foreground/10 bg-card px-4 py-3 max-sm:[&>button]:min-w-[calc(50%-0.25rem)] max-sm:[&>button]:flex-1 sm:px-5">{footer}</div>}
    </motion.div>
  </motion.div>}</AnimatePresence>, document.body);
}

type ConfirmOptions = { title: string; copy: string; confirm?: string; danger?: boolean };
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolve = useRef<((answer: true | undefined) => void) | null>(null);
  const close = useCallback((answer: boolean) => { resolve.current?.(answer ? true : undefined); resolve.current = null; setOptions(null); }, []);
  const ask = useCallback((next: ConfirmOptions) => new Promise<true | undefined>((done) => { resolve.current?.(undefined); resolve.current = done; setOptions(next); }), []);
  useEffect(() => () => resolve.current?.(undefined), []);
  const confirmation = <Modal open={!!options} onClose={() => close(false)} size="sm" {...(options?.danger && { tone: "danger" as const })} title={options?.title ?? "Confirm"} subtitle="Please confirm before this admin action is applied."
    footer={<><Button variant={options?.danger ? "destructive" : "default"} onClick={() => close(true)}>{options?.confirm ?? "Confirm"}</Button><Button variant="ghost" onClick={() => close(false)}>Cancel</Button></>}>
    <p className="text-sm leading-relaxed">{options?.copy}</p>
  </Modal>;
  return { ask, confirmation };
}

// Page numbers with first/last, a window around the current page, and a jump on wide screens.
export function Pager({ page, pages, total, size, onPage, noun = "entries" }: { page: number; pages: number; total: number; size: number; onPage: (p: number) => void; noun?: string }) {
  if (total === 0) return null;
  const from = (page - 1) * size + 1, to = Math.min(total, page * size);
  const nums = [...new Set([1, page - 1, page, page + 1, pages].filter((n) => n >= 1 && n <= pages))].sort((a, b) => a - b);
  const btn = "grid h-9 min-w-9 place-items-center rounded-lg border-2 px-2 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  return <nav aria-label="Pages" className="mt-4 flex flex-wrap items-center justify-between gap-3">
    <p className="text-sm text-muted-foreground">Showing <b className="text-foreground">{from.toLocaleString("en-IN")}–{to.toLocaleString("en-IN")}</b> of {total.toLocaleString("en-IN")} {noun}</p>
    <div className="flex items-center gap-1.5">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className={cn(btn, "border-foreground bg-card hover:bg-muted")} aria-label="Previous page"><ChevronLeft className="size-4" /></button>
      {nums.map((n, i) => <span key={n} className="flex items-center gap-1.5">
        {i > 0 && n - nums[i - 1]! > 1 && <span className="px-0.5 text-muted-foreground">…</span>}
        <button type="button" onClick={() => onPage(n)} aria-current={n === page ? "page" : undefined} className={cn(btn, n === page ? "border-foreground bg-primary text-primary-foreground shadow-hard-sm" : "border-foreground/15 bg-card hover:border-foreground")}>{n}</button>
      </span>)}
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className={cn(btn, "border-foreground bg-card hover:bg-muted")} aria-label="Next page"><ChevronRight className="size-4" /></button>
    </div>
  </nav>;
}

export const field ="h-11 rounded-lg border-2 border-foreground bg-background";

export function Stat({ label, value, icon: Icon, tone, note, onClick }: { label: string; value: ReactNode; icon: LucideIcon; tone?: string | undefined; note?: string | undefined; onClick?: (() => void) | undefined }) {
  const Tag = onClick ? "button" : "div";
  return <Tag type={onClick ? "button" : undefined} onClick={onClick} className={cn(card, "flex flex-col p-4 text-left", onClick && "card-lift")}>
    <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Icon className={cn("size-3.5", tone)} />{label}</p>
    <p className={cn("mt-1 font-display text-3xl font-bold tabular-nums", tone)}>{value}</p>
    {note && <p className="mt-auto pt-1 text-xs text-muted-foreground">{note}</p>}
  </Tag>;
}

export function Empty({ icon: Icon, title, copy }: { icon: LucideIcon; title: string; copy?: string }) {
  return <div className="rounded-xl border-2 border-dashed border-foreground/30 p-10 text-center">
    <Icon className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 font-display text-xl font-bold">{title}</p>{copy && <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{copy}</p>}
  </div>;
}

export function Skeleton({ rows = 3, h = "h-24" }: { rows?: number; h?: string }) {
  return <div className="space-y-3">{Array.from({ length: rows }, (_, i) => <div key={i} className={cn("skeleton rounded-xl", h)} />)}</div>;
}

export function Chip({ children, tone = "bg-muted" }: { children: ReactNode; tone?: string | undefined }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full border-2 border-foreground/20 px-2 py-0.5 text-[11px] font-bold", tone)}>{children}</span>;
}

// Two-to-five option switch with one sliding pill (no shared-layout jumps).
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string; count?: number }[]; onChange: (v: T) => void; label: string }) {
  const i = Math.max(0, options.findIndex((o) => o.id === value));
  return <div role="tablist" aria-label={label} className="relative grid rounded-full border-2 border-foreground bg-card p-0.5 text-xs font-bold" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
    <motion.span aria-hidden="true" className="absolute inset-y-0.5 left-0.5 rounded-full bg-primary" style={{ width: `calc(${100 / options.length}% - 2px)` }} initial={false} animate={{ x: `${i * 100}%` }} transition={{ type: "spring", stiffness: 420, damping: 34 }} />
    {options.map((o) => <button key={o.id} type="button" role="tab" aria-selected={o.id === value} onClick={() => onChange(o.id)} className={cn("relative whitespace-nowrap rounded-full px-3 py-1 transition-colors", o.id === value ? "text-primary-foreground" : "hover:text-primary")}>
      {o.label}{o.count != null && <span className="ml-1 opacity-70">{o.count}</span>}
    </button>)}
  </div>;
}

export const ago = (iso: string | null | undefined) => {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now"; if (s < 3600) return `${Math.round(s / 60)} min ago`; if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400); return d < 30 ? `${d} d ago` : new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};
export const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
