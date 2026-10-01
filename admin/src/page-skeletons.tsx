import { cn } from "@/lib/utils";
import { card } from "./ui";

const W = ({ className = "" }: { className?: string }) => <span className={cn("skeleton block", className)} />;
const Lines = ({ short = false }: { short?: boolean }) => <div className="min-w-0 flex-1 space-y-2"><W className="h-4 w-2/3 rounded" /><W className={cn("h-3 rounded", short ? "w-1/3" : "w-5/6")} /></div>;

export function OverviewSkeleton() {
  return <div className="space-y-6" aria-busy="true" aria-label="Loading overview">
    <section className={cn(card, "p-5 sm:p-6")}><div className="flex items-center gap-4"><W className="size-14 shrink-0 rounded-full sm:size-20" /><Lines /></div><div className="mt-5 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="rounded-xl border-2 border-foreground/15 p-4"><W className="h-4 w-2/3 rounded" /><W className="mt-3 h-12 w-16 rounded" /><W className="mt-3 h-3 w-full rounded" /></div>)}</div></section>
    <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">{[0, 1].map((i) => <section key={i} className={cn(card, "p-5")}><W className="h-5 w-40 rounded" /><W className="mt-5 h-8 w-24 rounded" /><W className="mt-5 h-64 w-full rounded-lg sm:h-72" /></section>)}</div>
    <section className={cn(card, "p-5")}><div className="flex justify-between"><W className="h-5 w-36 rounded" /><W className="h-3 w-28 rounded" /></div><div className="mt-5 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i}><W className="h-4 w-24 rounded" /><div className="mt-3 flex h-24 items-end gap-1">{Array.from({ length: 14 }, (_, j) => <W key={j} className={cn("w-full rounded-t", j % 3 === 0 ? "h-20" : j % 2 ? "h-10" : "h-16")} />)}</div></div>)}</div></section>
    <div className="grid gap-6 lg:grid-cols-2">{[0, 1].map((i) => <section key={i} className={cn(card, "space-y-3 p-5")}><W className="h-5 w-40 rounded" />{[0, 1, 2, 3].map((j) => <div key={j} className="flex items-center gap-3 border-t-2 border-foreground/10 pt-3"><W className="size-9 rounded-lg" /><Lines short /></div>)}</section>)}</div>
  </div>;
}

export function MemberGridSkeleton({ count = 8 }: { count?: number }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-busy="true">{Array.from({ length: count }, (_, i) => <div key={i} className={cn(card, "flex items-center gap-3 p-3")}><W className="size-11 shrink-0 rounded-full" /><Lines short /><W className="h-6 w-14 rounded-full" /></div>)}</div>;
}

export function ModerationSkeleton({ reports = false, count = 3 }: { reports?: boolean; count?: number }) {
  return <div className="space-y-4" aria-busy="true">{Array.from({ length: count }, (_, i) => <section key={i} className={cn(card, "overflow-hidden")}><div className="space-y-3 p-4 sm:p-5"><div className="flex gap-2"><W className="h-6 w-20 rounded-full" /><W className="h-6 w-24 rounded-full" /><W className="ml-auto h-4 w-28 rounded" /></div><W className="h-5 w-2/5 rounded" /><div className="space-y-2 rounded-lg bg-muted/30 p-3"><W className="h-3 w-full rounded" /><W className="h-3 w-[92%] rounded" /><W className="h-3 w-3/5 rounded" /></div>{reports && <div className="flex gap-2"><W className="h-6 w-24 rounded-full" /><W className="h-6 w-20 rounded-full" /></div>}</div><div className="flex flex-wrap gap-2 border-t-2 border-foreground/10 bg-muted/30 px-4 py-3 sm:px-5"><W className="h-9 min-w-52 flex-1 rounded-lg" /><W className="h-9 w-24 rounded-lg" /><W className="h-9 w-24 rounded-lg" /><W className="h-9 w-24 rounded-lg" /></div></section>)}</div>;
}

export function FeedbackSkeleton() {
  return <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]" aria-busy="true"><div className={cn(card, "divide-y-2 divide-foreground/10 overflow-hidden")}>{[0, 1, 2, 3, 4].map((i) => <div key={i} className="flex gap-3 p-3"><W className="size-4 shrink-0 rounded" /><Lines short /></div>)}</div><section className={cn(card, "space-y-4 p-5")}><div className="flex gap-3"><W className="size-10 rounded-lg" /><Lines /></div><W className="h-6 w-20 rounded-full" /><div className="space-y-2 rounded-lg bg-muted/30 p-3"><W className="h-3 w-full rounded" /><W className="h-3 w-4/5 rounded" /><W className="h-3 w-2/3 rounded" /></div><div className="grid gap-3 sm:grid-cols-[12rem_1fr]"><W className="h-11 rounded-lg" /><W className="h-24 rounded-lg" /></div><W className="ml-auto h-10 w-24 rounded-lg" /></section></div>;
}

export function PanelGridSkeleton({ panels = 4, three = false }: { panels?: number; three?: boolean }) {
  return <div className={cn("grid gap-6", three ? "xl:grid-cols-3" : "lg:grid-cols-2")} aria-busy="true">{Array.from({ length: panels }, (_, i) => <section key={i} className={cn(card, "p-5")}><div className="flex items-center gap-2"><W className="size-5 rounded" /><W className="h-5 w-40 rounded" /></div><W className="mt-3 h-3 w-3/4 rounded" /><div className="mt-4 divide-y-2 divide-foreground/10">{[0, 1, 2, 3].map((j) => <div key={j} className="flex items-center gap-4 py-3"><Lines /><W className="h-7 w-12 shrink-0 rounded-full" /></div>)}</div></section>)}</div>;
}

export function GoofyOverviewSkeleton() {
  return <div className="space-y-6" aria-busy="true"><section className={cn(card, "flex items-center gap-4 p-5")}><W className="size-20 rounded-full" /><Lines /></section><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className={cn(card, "p-4")}><W className="h-4 w-2/3 rounded" /><W className="mt-3 h-10 w-16 rounded" /><W className="mt-2 h-3 w-4/5 rounded" /></div>)}</div><div className="grid gap-6 lg:grid-cols-2"><PanelGridSkeleton panels={2} /></div></div>;
}

export function ControlsSkeleton() {
  return <div className="space-y-6" aria-busy="true"><section className={cn(card, "flex items-center gap-4 p-5")}><Lines /><W className="h-7 w-12 rounded-full" /></section><PanelGridSkeleton panels={3} three /><section className={cn(card, "p-5")}><W className="h-5 w-36 rounded" /><W className="mt-2 h-3 w-3/5 rounded" /><div className="mt-4 grid gap-2 sm:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="flex gap-3 rounded-lg border-2 border-foreground/15 p-3"><W className="size-5 rounded" /><Lines short /></div>)}</div></section></div>;
}

export function PlatformSkeleton() {
  return <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]" aria-busy="true"><div className="space-y-6"><PanelGridSkeleton panels={1} /><section className={cn(card, "p-5")}><div className="flex items-center gap-4"><Lines /><W className="h-7 w-12 rounded-full" /></div><W className="mt-4 h-11 w-full rounded-lg" /></section></div><div className="space-y-6">{[0, 1].map((i) => <section key={i} className={cn(card, "space-y-4 p-5")}><W className="h-5 w-36 rounded" /><W className="h-3 w-4/5 rounded" /><W className="h-11 w-full rounded-lg" /><W className="h-11 w-full rounded-lg" /><W className="h-10 w-36 rounded-lg" /></section>)}</div></div>;
}

export function TeamSkeleton({ count = 4 }: { count?: number }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">{Array.from({ length: count }, (_, i) => <section key={i} className={cn(card, "p-4")}><div className="flex items-center gap-3"><W className="size-12 rounded-full" /><Lines short /><W className="h-6 w-16 rounded-full" /></div><div className="mt-4 flex gap-2"><W className="h-7 w-20 rounded-full" /><W className="h-7 w-24 rounded-full" /></div><W className="mt-4 h-10 w-28 rounded-lg" /></section>)}</div>;
}

export function RuledListSkeleton({ rows = 5, logo = false }: { rows?: number; logo?: boolean }) {
  return <div className={cn(card, "divide-y-2 divide-foreground/10")} aria-busy="true">{Array.from({ length: rows }, (_, i) => <div key={i} className="flex flex-wrap items-center gap-3 p-3 sm:p-4">{logo && <W className="size-10 shrink-0 rounded-lg" />}<Lines short /><W className="h-7 w-20 rounded-full" /><W className="h-9 w-24 rounded-lg" /></div>)}</div>;
}

export function DonationsSkeleton() {
  return <div className="space-y-4" aria-busy="true"><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className={cn(card, "p-4")}><W className="h-3 w-20 rounded" /><W className="mt-3 h-8 w-24 rounded" /><W className="mt-2 h-3 w-2/3 rounded" /></div>)}</div><RuledListSkeleton rows={5} /></div>;
}
