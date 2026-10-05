// Link-preview images (1200×630), like GitHub's repo cards: what shows when a story or company page
// is shared on LinkedIn, X, WhatsApp or Slack. Drawn with @vercel/og (satori + resvg in WebAssembly).
// A story card shows its title, company, outcome, wait and Flag Score, never the story text or who
// wrote it. Fonts are fetched once per server instance and cached.
// satori lays the card out as SVG; resvg's WebAssembly build turns it into a PNG.
// Nothing is read from disk, because Vercel doesn't ship .wasm files with the function:
//   - satori is pinned to 0.32 (0.33+ loads harfbuzzjs/hb.wasm from disk, and when that fails it
//     crashes the whole function); its layout engine, yoga-layout 3, embeds its WebAssembly in code
//   - resvg's WebAssembly is fetched once per server instance from a pinned CDN copy
import satori from "satori";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { EMAIL_LOGO_BASE64 } from "./mail/logo.js";

type Node = { type: string; props: Record<string, unknown> & { children?: unknown } };
const h = (type: string, style: Record<string, unknown>, ...children: unknown[]): Node => ({ type, props: { style: { display: "flex", ...style }, children: children.length <= 1 ? children[0] : children } });

const INK = "#141110", CREAM = "#FAF7F2", VIOLET = "#6D28D9", ACCENT = "#EDE3A6";
const tone = (s: number) => (s >= 70 ? "#16A34A" : s >= 40 ? "#D97706" : "#DC2626");
const word = (s: number) => (s >= 70 ? "Green flag" : s >= 40 ? "Mixed signals" : "Red flag");

let fonts: { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }[] | null = null;
async function loadFonts() {
  if (fonts) return fonts;
  const get = async (url: string) => (await fetch(url, { signal: AbortSignal.timeout(5000) })).arrayBuffer();
  const [display, body, bodyBold, mono, monoBold] = await Promise.all([
    get("https://cdn.jsdelivr.net/fontsource/fonts/space-grotesk@latest/latin-700-normal.woff"),
    get("https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.woff"),
    get("https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.woff"),
    get("https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono@latest/latin-400-normal.woff"),
    get("https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono@latest/latin-700-normal.woff"),
  ]);
  fonts = [{ name: "Display", data: display, weight: 700, style: "normal" }, { name: "Body", data: body, weight: 400, style: "normal" }, { name: "Body", data: bodyBold, weight: 700, style: "normal" },
    { name: "Mono", data: mono, weight: 400, style: "normal" }, { name: "Mono", data: monoBold, weight: 700, style: "normal" }];
  return fonts;
}

// The ghost mark, the same embedded copy the emails use (files don't always ship with the function).
const ghost = () => `data:image/png;base64,${EMAIL_LOGO_BASE64}`;

const brand = (site: string) => h("div", { alignItems: "center", justifyContent: "space-between", width: "100%" },
  h("div", { alignItems: "center", gap: 14, fontFamily: "Display", fontSize: 40, color: INK }, ...(ghost() ? [{ type: "img", props: { src: ghost(), width: 56, height: 56 } }] : []), "Ghosted."),
  h("div", { fontFamily: "Body", fontSize: 24, color: "#6B6560" }, site.replace(/^https?:\/\//, "")));

const pill = (text: string, bg: string, fg = INK) => h("div", { border: `3px solid ${INK}`, borderRadius: 999, background: bg, color: fg, padding: "8px 20px", fontFamily: "Body", fontWeight: 700, fontSize: 24, textTransform: "uppercase" }, text);

const scoreBox = (score: number, label: string) => h("div", { flexDirection: "column", alignItems: "center", justifyContent: "center", border: `4px solid ${INK}`, borderRadius: 28, background: "#fff", padding: "22px 34px", boxShadow: `8px 8px 0 ${INK}` },
  h("div", { fontFamily: "Display", fontSize: 96, color: tone(score), lineHeight: 1 }, String(score)),
  h("div", { fontFamily: "Body", fontWeight: 700, fontSize: 22, color: tone(score), marginTop: 6 }, word(score)),
  h("div", { fontFamily: "Body", fontSize: 18, color: "#6B6560", marginTop: 4 }, label));

const frame = (site: string, ...children: unknown[]) => h("div", { width: 1200, height: 630, background: CREAM, padding: 36 },
  h("div", { flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", border: `4px solid ${INK}`, borderRadius: 36, background: "#fff", padding: "40px 52px", boxShadow: `12px 12px 0 ${INK}` },
    brand(site), ...children));

// The renderer's WebAssembly (same version as package.json), fetched once per server instance.
// A failed fetch is retried on the next image instead of being cached.
const RESVG_WASM = "https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.2/index_bg.wasm";
let wasmReady: Promise<void> | null = null;
const ensureWasm = () => (wasmReady ??= fetch(RESVG_WASM, { signal: AbortSignal.timeout(8000) })
  .then((r) => { if (!r.ok) throw new Error(`resvg wasm ${r.status}`); return r.arrayBuffer(); })
  .then((buf) => initWasm(buf))
  .catch((e: Error) => { wasmReady = null; throw e; }));

async function render(node: Node): Promise<Buffer> {
  const [, loaded] = await Promise.all([ensureWasm(), loadFonts()]);
  const svg = await satori(node as never, { width: 1200, height: 630, fonts: loaded });
  return Buffer.from(new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng());
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export async function storyCard(s: { title: string; company: string; outcome: string; wait: string | null; score: number | null; quick: boolean; relatable: number }, site: string) {
  return render(frame(site,
    h("div", { alignItems: "center", justifyContent: "space-between", gap: 40, width: "100%" },
      h("div", { flexDirection: "column", gap: 22, flex: 1 },
        h("div", { gap: 12 }, pill(s.outcome, ACCENT), ...(s.quick ? [pill("Quick story", "#fff")] : [])),
        h("div", { fontFamily: "Display", fontSize: s.title.length > 60 ? 50 : 60, color: INK, lineHeight: 1.08 }, clip(s.title, 90)),
        h("div", { fontFamily: "Body", fontSize: 28, color: "#3F3A36" }, `A hiring story about ${s.company}${s.wait && !s.title.includes(s.wait) ? ` · waited ${s.wait}` : ""}`)),
      ...(s.score != null ? [scoreBox(s.score, "from this story")] : [])),
    h("div", { justifyContent: "space-between", alignItems: "center", width: "100%", fontFamily: "Body", fontSize: 24, color: "#6B6560" },
      h("div", {}, `${s.relatable} found it relatable · shared anonymously`),
      h("div", { color: VIOLET, fontWeight: 700 }, "#GhostedReceipts"))));
}

// The story preview as a thermal receipt (same lines as the share card in
// src/components/dashboard/share-card.tsx): rounds, days waited, pay, replies and "Time lost", with
// a barcode of the site address and a torn bottom edge. Lines that aren't known are left off.
const ROUNDS: Record<string, number> = { application: 0, screening: 1, technical: 2, final: 3, offer: 3 };
const FINAL_REPLY: Record<string, string> = { ghosted: "0", ghost_job: "0", rejected: "1 (no)", offer: "1 (yes)", offer_revoked: "1, then taken back" };
const PAPER = "#FFFDF7";
// A zigzag strip as an SVG image (satori can't draw border triangles).
const teeth = (w: number, n: number) => {
  const step = w / n;
  const pts = Array.from({ length: n }, (_, i) => `${i * step},0 ${i * step + step / 2},14`).join(" ") + ` ${w},0`;
  return `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="18" viewBox="0 0 ${w} 18"><polygon points="0,0 ${pts}" fill="${PAPER}"/><polyline points="2,0 ${pts.replace(new RegExp(`${w},0$`), `${w - 2},0`)}" fill="none" stroke="${INK}" stroke-width="4" stroke-linejoin="miter"/></svg>`).toString("base64")}`;
};
const bars = (text: string) => { let x = 2166136261; return Array.from({ length: 52 }, (_, i) => { x = Math.imul(x ^ text.charCodeAt(i % text.length), 16777619); return 2 + ((x >>> 0) % 4); }); };

export async function receiptCard(s: { id: string; title: string; company: string; outcome: string; outcomeKey: string; stage: string | null; days: number | null; salary: { min: number; max: number } | null; score: number | null; relatable: number }, site: string) {
  const host = site.replace(/^https?:\/\//, "");
  const rows: [string, string][] = [
    ...(s.stage ? [["Rounds", String(ROUNDS[s.stage] ?? 0)] as [string, string]] : []),
    ...(s.days != null ? [["Days waited", String(s.days)] as [string, string]] : []),
    ...(s.salary ? [["Pay offered", `Rs ${s.salary.min}-${s.salary.max} LPA`] as [string, string]] : []),
    ...(FINAL_REPLY[s.outcomeKey] ? [["Replies received", FINAL_REPLY[s.outcomeKey]!] as [string, string]] : []),
  ];
  const lost = s.days != null ? `${s.days} ${s.days === 1 ? "day" : "days"}` : s.outcome;
  const line = (k: string, v: string) => h("div", { justifyContent: "space-between", width: "100%", fontFamily: "Mono", fontSize: 22, color: INK, padding: "3px 0" }, h("div", {}, k), h("div", { fontWeight: 700 }, v));
  const receipt = h("div", { flexDirection: "column", width: 440, transform: "rotate(2deg)", marginTop: -10 },
    h("div", { flexDirection: "column", alignItems: "center", background: PAPER, border: `4px solid ${INK}`, borderBottom: "none", padding: "26px 30px 14px" },
      h("div", { fontFamily: "Mono", fontWeight: 700, fontSize: 24, color: INK }, "HIRING RECEIPT"),
      h("div", { fontFamily: "Mono", fontSize: 16, color: "#6B6560", marginTop: 2 }, "kept anonymously"),
      h("div", { width: "100%", borderTop: `2px dashed ${INK}`, marginTop: 14, marginBottom: 10 }),
      ...rows.map(([k, v]) => line(k, v)),
      h("div", { justifyContent: "space-between", width: "100%", borderTop: `3px solid ${INK}`, marginTop: 10, paddingTop: 8, fontFamily: "Mono", fontWeight: 700, fontSize: 28, color: INK }, h("div", {}, "Time lost"), h("div", {}, lost)),
      h("div", { fontFamily: "Mono", fontSize: 15, color: "#6B6560", marginTop: 12 }, "No refunds. No feedback. No reply."),
      h("div", { gap: 3, height: 46, marginTop: 12, alignItems: "stretch" }, ...bars(site + s.id).map((w, i) => h("div", { width: w, background: i % 2 ? "transparent" : INK }))),
      h("div", { fontFamily: "Mono", fontWeight: 700, fontSize: 15, color: INK, marginTop: 4, letterSpacing: 2 }, host)),
    // Torn edge: paper teeth along the bottom, outlined in ink like the sides.
    { type: "img", props: { src: teeth(440, 22), width: 440, height: 18 } });
  return render(h("div", { width: 1200, height: 630, background: CREAM, padding: "44px 60px", justifyContent: "space-between", alignItems: "center", gap: 48 },
    h("div", { flexDirection: "column", justifyContent: "space-between", height: "100%", flex: 1 },
      h("div", { alignItems: "center", gap: 14, fontFamily: "Display", fontSize: 40, color: INK }, { type: "img", props: { src: ghost(), width: 56, height: 56 } }, "Ghosted."),
      h("div", { flexDirection: "column", gap: 20 },
        h("div", { gap: 12 }, pill(s.outcome, ACCENT), ...(s.score != null ? [pill(`Flag Score ${s.score}`, "#fff", tone(s.score))] : [])),
        h("div", { fontFamily: "Display", fontSize: s.title.length > 50 ? 48 : 58, color: INK, lineHeight: 1.08 }, clip(s.title, 90)),
        h("div", { fontFamily: "Body", fontSize: 26, color: "#3F3A36" }, `A hiring story about ${clip(s.company, 40)}`)),
      h("div", { gap: 20, fontFamily: "Body", fontSize: 22, color: "#6B6560" }, h("div", {}, `${s.relatable} found it relatable`), h("div", { color: VIOLET, fontWeight: 700 }, "#GhostedReceipts"))),
    receipt));
}

// A member's page: avatar, name, level badge and title, and their numbers. Never anything private.
export async function personCard(p: { name: string; avatarUrl: string; level: number; title: string; color: { bg: string; fg: string; image?: string }; stories: number; relatable: number; followers: number; anonymous: boolean }, site: string) {
  const stat = (n: number, label: string) => h("div", { flexDirection: "column", border: `3px solid ${INK}`, borderRadius: 20, background: CREAM, padding: "14px 22px", minWidth: 170 },
    h("div", { fontFamily: "Display", fontSize: 48, color: INK, lineHeight: 1 }, String(n)),
    h("div", { fontFamily: "Body", fontWeight: 700, fontSize: 20, color: "#6B6560", marginTop: 6 }, label));
  return render(frame(site,
    h("div", { alignItems: "center", gap: 40, width: "100%" },
      h("div", { width: 190, height: 190, borderRadius: 999, border: `5px solid ${INK}`, background: "#E9E2FF", overflow: "hidden" }, { type: "img", props: { src: p.avatarUrl, width: 180, height: 180 } }),
      h("div", { flexDirection: "column", gap: 14, flex: 1 },
        h("div", { gap: 12, alignItems: "center" },
          h("div", { border: `4px solid ${INK}`, borderRadius: 999, background: p.color.bg, ...(p.color.image && { backgroundImage: p.color.image }), color: p.color.fg, padding: "8px 22px", fontFamily: "Display", fontSize: 34, boxShadow: `5px 5px 0 ${INK}` }, `LV ${p.level}`),
          pill(p.title, "#fff"),
          ...(p.anonymous ? [pill("Anonymous", "#22C55E", "#fff")] : [])),
        h("div", { fontFamily: "Display", fontSize: p.name.length > 22 ? 56 : 72, color: INK, lineHeight: 1.05 }, clip(p.name, 32)))),
    h("div", { gap: 16, width: "100%" }, stat(p.stories, p.stories === 1 ? "story" : "stories"), stat(p.relatable, "found relatable"), stat(p.followers, p.followers === 1 ? "follower" : "followers"))));
}

export async function companyCard(c: { name: string; stories: number; score: number | null; ghosted: number; avgWait: number | null; city: string | null }, site: string) {
  const facts = [`${c.stories} ${c.stories === 1 ? "candidate experience" : "candidate experiences"}`, ...(c.avgWait != null ? [`average wait ${c.avgWait} days`] : []), ...(c.ghosted ? [`${c.ghosted} ghosted`] : [])];
  return render(frame(site,
    h("div", { alignItems: "center", justifyContent: "space-between", gap: 40, width: "100%" },
      h("div", { flexDirection: "column", gap: 18, flex: 1 },
        h("div", {}, pill("Hiring experiences", ACCENT)),
        h("div", { fontFamily: "Display", fontSize: c.name.length > 22 ? 64 : 84, color: INK, lineHeight: 1 }, clip(c.name, 40)),
        h("div", { fontFamily: "Body", fontSize: 30, color: "#3F3A36" }, c.stories ? facts.join(" · ") : "No stories yet. Know something? Share it anonymously.")),
      ...(c.score != null && c.stories ? [scoreBox(c.score, "Flag Score")] : [])),
    h("div", { justifyContent: "space-between", alignItems: "center", width: "100%", fontFamily: "Body", fontSize: 24, color: "#6B6560" },
      h("div", {}, `Interview rounds, waiting time, offers and ghosting${c.city ? ` · ${c.city}` : ""}`),
      h("div", { color: VIOLET, fontWeight: 700 }, "Know before you apply"))));
}

export async function siteCard(site: string) {
  return render(frame(site,
    h("div", { flexDirection: "column", gap: 18 },
      h("div", { fontFamily: "Display", fontSize: 88, color: INK, lineHeight: 1 }, "Know what happened"),
      h("div", { fontFamily: "Display", fontSize: 88, color: VIOLET, lineHeight: 1 }, "before you apply."),
      h("div", { fontFamily: "Body", fontSize: 30, color: "#3F3A36", marginTop: 8 }, "Real candidate experiences in India. Anonymous by default. Searchable by company.")),
    h("div", { fontFamily: "Body", fontSize: 24, color: "#6B6560" }, "Interview rounds · Waiting time · Communication · Offers · Ghosting")));
}
