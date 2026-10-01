// A company's brand colour, read from its logo: the most common strong colour in a small copy of the
// image (white, grey and transparent pixels are ignored; an all-black logo gives ink). The logo comes
// through our API (GET /v1/companies/:slug/logo) so the page is allowed to read its pixels. Results
// are remembered in this browser. Without a logo (or the API), the listing's colour is used.
import { useEffect, useState } from "react";
import { API_URL, apiEnabled } from "@/lib/api";
import type { Company } from "@/mock/data";

const CACHE = "ghosted.brandColors";
const readCache = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(CACHE) ?? "{}") as Record<string, string>; } catch { return {}; } };
const writeCache = (slug: string, hex: string) => { try { const all = readCache(); all[slug] = hex; localStorage.setItem(CACHE, JSON.stringify(all)); } catch { /* storage blocked */ } };

const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

function dominant(img: HTMLImageElement): string | null {
  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  let dark = 0, visible = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
    if (a < 128) continue;
    visible++;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max < 60) { dark++; continue; }          // near-black
    if (max - min < 40) continue;                  // white / grey
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b; buckets.set(key, e);
  }
  // Prefer vivid colours over merely common ones (a gradient logo's bright end is its brand colour).
  const vivid = (e: { n: number; r: number; g: number; b: number }) => { const r = e.r / e.n, g = e.g / e.n, b = e.b / e.n; return e.n * (Math.max(r, g, b) - Math.min(r, g, b)); };
  const best = [...buckets.values()].sort((a, b) => vivid(b) - vivid(a))[0];
  if (best && best.n >= visible * 0.04) return toHex(best.r / best.n, best.g / best.n, best.b / best.n);
  return visible && dark / visible > 0.2 ? "#141110" : null; // a monochrome black logo
}

// Listing colour classes → their CSS variable (used when there's no logo to read).
const fallback = (c: Pick<Company, "color">) => `var(--${c.color.replace(/^bg-/, "")})`;

export function useBrandColor(company: Pick<Company, "id" | "color" | "logoUrl">) {
  const [color, setColor] = useState<string>(() => (typeof window !== "undefined" && readCache()[company.id]) || fallback(company));
  useEffect(() => {
    const cached = readCache()[company.id];
    if (cached) { setColor(cached); return; }
    setColor(fallback(company));
    if (!apiEnabled || !company.logoUrl || !API_URL) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { try { const hex = dominant(img); if (hex) { setColor(hex); writeCache(company.id, hex); } } catch { /* unreadable image: keep the fallback */ } };
    img.src = `${API_URL}/v1/companies/${company.id}/logo`;
  }, [company.id, company.logoUrl, company.color]);
  return color;
}
