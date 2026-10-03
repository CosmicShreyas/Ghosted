import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Counts shown on the site: 950 → "950", 1000 → "1k", 2500 → "2.5k", 12400 → "12k", 1250000 → "1.3M".
export const formatCount = (n: number) => {
  const v = Math.max(0, Math.round(n || 0));
  if (v < 1000) return String(v);
  if (v < 1_000_000) return `${+(v / 1000).toFixed(v < 10_000 ? 1 : 0)}k`;
  return `${+(v / 1_000_000).toFixed(v < 10_000_000 ? 1 : 0)}M`;
};
