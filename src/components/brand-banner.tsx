// Ghosted's own set of company banners: five patterns drawn in the company's brand colour (read
// from its logo, lib/brand.ts) on a light tint of it. The pattern is picked from the company's slug,
// so each company always gets the same one. Pure CSS, so it follows light and dark mode.
import type { CSSProperties } from "react";
import { useBrandColor } from "@/lib/brand";
import { cn } from "@/lib/utils";
import type { Company } from "@/mock/data";

const hash = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

// Each pattern uses --ink (the brand colour) over --tint (a wash of it on the card colour).
const PATTERNS: ((ink: string) => string)[] = [
  // Diagonal stripes
  (ink) => `repeating-linear-gradient(135deg, ${ink} 0 3px, transparent 3px 16px)`,
  // Polka dots
  (ink) => `radial-gradient(${ink} 2.5px, transparent 3px) 0 0 / 18px 18px, radial-gradient(${ink} 2.5px, transparent 3px) 9px 9px / 18px 18px`,
  // Grid
  (ink) => `linear-gradient(${ink} 2px, transparent 2px) 0 0 / 22px 22px, linear-gradient(90deg, ${ink} 2px, transparent 2px) 0 0 / 22px 22px`,
  // Zigzag
  (ink) => `linear-gradient(135deg, ${ink} 25%, transparent 25%) -12px 0 / 24px 24px, linear-gradient(225deg, ${ink} 25%, transparent 25%) -12px 0 / 24px 24px`,
  // Offset bricks of stripes and dots
  (ink) => `repeating-linear-gradient(45deg, ${ink} 0 2px, transparent 2px 12px), radial-gradient(${ink} 2px, transparent 2.5px) 0 0 / 24px 24px`,
];

export function BrandBanner({ company, className }: { company: Pick<Company, "id" | "color" | "logoUrl">; className?: string }) {
  const color = useBrandColor(company);
  const pattern = PATTERNS[hash(company.id) % PATTERNS.length]!;
  const ink = `color-mix(in oklab, ${color} 55%, transparent)`;
  const style: CSSProperties = {
    background: `${pattern(ink)}, color-mix(in oklab, ${color} 16%, var(--card))`,
  };
  return <div aria-hidden="true" className={cn("relative", className)} style={style}>
    {/* A solid band of the brand colour along the bottom edge ties the pattern to the logo. */}
    <div className="absolute inset-x-0 bottom-0 h-1.5" style={{ background: color }} />
  </div>;
}
