import { useState } from "react";
import type { Company, Story } from "@/mock/data";
import type { StoryModel } from "@/lib/stories";
import { plainText } from "@/components/markdown";
import { getCompany, getUser } from "@/mock/data";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Flag, HeartHandshake, MessageCircle, Zap } from "lucide-react";
import { cn, formatCount } from "@/lib/utils";

export function Avatar({ seed, pastel, size = "md", label = "Anonymous user" }: { seed: string; pastel: string; size?: "sm" | "md" | "lg"; label?: string }) {
  return <img src={`https://api.dicebear.com/9.x/open-peeps/svg?seed=${seed}`} alt={label} className={cn("shrink-0 rounded-full border-2 border-foreground object-cover", pastel, size === "sm" && "size-9", size === "md" && "size-11", size === "lg" && "size-16")} />;
}

// A person's banner: a row of DiceBear "Shapes" tiles (CC0), seeded from their avatar so it's unique
// and stable per person, and limited to Ghosted's palette (violet, the avatar pastels, amber, coral)
// so it always matches the UI. Plain <img> URLs, like the avatars.
const BANNER_BG = "ede9fe,d1fae5,e0f2fe,fce7f3,fef3c7";
const BANNER_INK = "6d28d9,7c3aed,a78bfa,34d399,38bdf8,f472b6,fbbf24,f87171";
export function Banner({ seed, className }: { seed: string; className?: string }) {
  return <div className={cn("flex overflow-hidden", className)} aria-hidden="true">
    {Array.from({ length: 12 }, (_, i) => <img key={i} alt="" loading="lazy" draggable={false} className="h-full aspect-square shrink-0 select-none"
      src={`https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(`${seed}-${i}`)}&backgroundColor=${BANNER_BG}&shape1Color=${BANNER_INK}&shape2Color=${BANNER_INK}&shape3Color=${BANNER_INK}`} />)}
  </div>;
}

export function FlagScore({ score, compact = false }: { score: number; compact?: boolean }) {
  const status = score >= 70 ? "Green Flag" : score >= 40 ? "Mixed Signals" : "Red Flag";
  const tone = score >= 70 ? "text-flag-green" : score >= 40 ? "text-flag-amber" : "text-flag-red";
  const dash = Math.max(0, Math.min(157, 157 - score * 1.57));
  return (
    <div className={cn("relative flex flex-col items-center", compact ? "w-24" : "w-40")} aria-label={`Flag score ${score}, ${status}`}>
      <svg viewBox="0 0 120 68" className={cn("overflow-visible", compact ? "w-24" : "w-40")} aria-hidden="true">
        <path d="M10 60 A50 50 0 0 1 110 60" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" className="text-muted" pathLength="157" />
        <path d="M10 60 A50 50 0 0 1 110 60" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" className={cn(tone, "animate-dial")} pathLength="157" strokeDasharray="157" strokeDashoffset={dash} />
      </svg>
      <strong className={cn("absolute font-display", compact ? "top-7 text-2xl" : "top-11 text-4xl")}>{score}</strong>
      <span className={cn("font-bold", tone, compact ? "-mt-1 text-[11px]" : "-mt-1 text-sm")}>{status}</span>
    </div>
  );
}

const scoreLabels: [keyof Company["scores"], string][] = [["hiring", "Hiring"], ["communication", "Comms"], ["culture", "Culture"], ["pay", "Pay"], ["growth", "Growth"]];

export function ScoreMeters({ company }: { company: Company }) {
  // An area nobody has rated yet shows an empty dashed bar ("No data yet"), never a made-up 50.
  return <div className="grid grid-cols-5 gap-2">{scoreLabels.map(([key, label]) => {
    const v = company.scores[key];
    const n = company.scoreCounts?.[key];
    return <div key={key} className="min-w-0" title={v == null ? `${label}: no data yet` : `${label}: ${v}${n != null ? `, based on ${n} ${n === 1 ? "story" : "stories"}` : ""}`}>
      <div className={cn("mb-1 h-1.5 overflow-hidden rounded-full", v == null ? "border border-dashed border-foreground/30" : "bg-muted")}>{v != null && <div className={cn("h-full rounded-full", v >= 70 ? "bg-flag-green" : v >= 40 ? "bg-flag-amber" : "bg-flag-red")} style={{ width: `${v}%` }} />}</div>
      <span className="block truncate text-[10px] font-semibold text-muted-foreground">{label}</span>
      {n != null && <span className="block truncate text-[9px] text-muted-foreground/80">{v == null ? "No data yet" : `${n} ${n === 1 ? "story" : "stories"}`}</span>}
    </div>;
  })}</div>;
}

// Marks a story posted with the quick path (written from the author's taps, not typed out).
export function QuickBadge() {
  return <span title="Posted as a quick story: written from the author's answers" className="inline-flex items-center gap-1 rounded-full border-2 border-foreground/30 bg-card px-2 py-0.5 text-[11px] font-bold uppercase"><Zap className="size-3" />Quick story</span>;
}

// The company's own icon (fetched from its website when it was listed) on a white tile, or its
// initial on a colour tile when there's no icon or it fails to load.
// Logos that failed once this visit: later cards go straight to the initial instead of retrying.
const BROKEN_LOGOS = new Set<string>();
export function CompanyMark({ company, size = "md" }: { company: Pick<Company, "name" | "initial" | "color" | "logoUrl">; size?: "sm" | "md" | "lg" }) {
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const box = size === "sm" ? "size-9 text-sm" : size === "lg" ? "size-16 text-2xl" : "size-12 text-xl";
  // Eager, not lazy: browsers often never load lazy images inside sideways-scrolling strips, which
  // left those cards showing initials. Logos are tiny and served from a long CDN cache.
  if (company.logoUrl && brokenSrc !== company.logoUrl && !BROKEN_LOGOS.has(company.logoUrl)) return <div className={cn("grid shrink-0 place-items-center overflow-hidden rounded-lg border-2 border-foreground bg-white", box)}>
    <img src={company.logoUrl} alt={`${company.name} logo`} decoding="async" referrerPolicy="no-referrer" onError={() => { BROKEN_LOGOS.add(company.logoUrl!); setBrokenSrc(company.logoUrl!); }} className="size-[70%] object-contain" />
  </div>;
  return <div className={cn("grid shrink-0 place-items-center rounded-lg border-2 border-foreground font-display font-bold text-primary-foreground", company.color, box)}>{company.initial}</div>;
}

// A real story (API) on the landing page's story wall: same look as the sample cards.
export function StoryModelCard({ story, readMore = "Read more" }: { story: StoryModel; readMore?: React.ReactNode }) {
  // Every card is the same size: one-line role and title, the story capped at four lines, and
  // "Read more" (which asks visitors to join) always in the same place.
  return <article className="card-lift flex h-full flex-col rounded-xl border-2 border-foreground bg-card p-5 shadow-hard-sm">
    <div className="mb-4 flex items-center gap-3"><Avatar seed={story.author.avatarSeed} pastel={story.author.pastel} size="sm" label={story.author.name} /><div className="min-w-0"><p className="truncate text-sm font-bold">{story.author.name}</p><p className="truncate text-xs text-muted-foreground">about {story.company.name} · {story.timeLabel}</p></div></div>
    <div className="mb-3 flex min-w-0 items-center gap-2"><span className="shrink-0 rounded-full border-2 border-foreground bg-accent px-2.5 py-0.5 text-[11px] font-bold uppercase">{story.outcomeLabel}</span>{story.role && <span className="truncate text-xs font-semibold text-muted-foreground">{story.role}</span>}</div>
    <h3 className="mb-1 truncate font-bold">{story.title || `About ${story.company.name}`}</h3>
    <p className="line-clamp-4 h-[6.5em] leading-relaxed">{plainText(story.body)}</p>
    <Link to="/auth" className="mt-2 inline-flex w-fit items-center gap-1 rounded text-sm font-bold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">{readMore}<ArrowRight className="size-4" /></Link>
    <div className="mt-auto flex flex-wrap gap-2 pt-4 text-xs font-semibold">{([[HeartHandshake, story.relatable, "relatable"], [Flag, story.flags, "red flags"], [MessageCircle, story.comments, "chitchats"]] as const).map(([I, n, label]) => { const red = label === "red flags"; return <span key={label} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1", red ? "border-flag-red text-flag-red" : "border-foreground")}><I className={cn("size-3.5", red && "fill-flag-red/20")} />{formatCount(n)} {label}</span>; })}</div>
  </article>;
}

export function StoryCard({ story, tilted = false }: { story: Story; tilted?: boolean }) {
  const user = getUser(story.userId);
  const company = getCompany(story.companyId);
  const [outcome, role] = story.stage.split(" · ");
  return <article className={cn("card-lift break-inside-avoid rounded-xl border-2 border-foreground bg-card p-5 shadow-hard-sm", tilted && "rotate-1")}>
    <div className="mb-4 flex items-center gap-3"><Avatar seed={user.seed} pastel={user.pastel} size="sm" label={user.handle} /><div className="min-w-0"><p className="truncate text-sm font-bold">{user.handle}</p><p className="truncate text-xs text-muted-foreground">about {company.name} · {story.time}</p></div></div>
    <div className="mb-3 flex flex-wrap items-center gap-2"><span className="rounded-full border-2 border-foreground bg-accent px-2.5 py-0.5 text-[11px] font-bold uppercase">{outcome}</span>{role && <span className="text-xs font-semibold text-muted-foreground">{role}</span>}</div>
    <p className="leading-relaxed">{story.excerpt}</p>
    <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">{[[HeartHandshake, story.relatable, "relatable"], [Flag, story.flags, "red flags"], [MessageCircle, story.comments, "chitchats"]].map(([Icon, n, label]) => { const I = Icon as typeof Flag; const red = label === "red flags"; return <span key={label as string} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1", red ? "border-flag-red text-flag-red" : "border-foreground")}><I className={cn("size-3.5", red && "fill-flag-red/20")} />{formatCount(n as number)} {label as string}</span>; })}</div>
  </article>;
}