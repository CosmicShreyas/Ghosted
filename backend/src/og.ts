// Link-preview images (1200×630), like GitHub's repo cards: what shows when a story or company page
// is shared on LinkedIn, X, WhatsApp or Slack. Drawn with satori (layout to SVG) and resvg (to PNG).
// A story card shows its title, company, outcome, wait and Flag Score, never the story text or who
// wrote it. Fonts are fetched once per server instance and cached.
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
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
  const [display, body, bodyBold] = await Promise.all([
    get("https://cdn.jsdelivr.net/fontsource/fonts/space-grotesk@latest/latin-700-normal.woff"),
    get("https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.woff"),
    get("https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.woff"),
  ]);
  fonts = [{ name: "Display", data: display, weight: 700, style: "normal" }, { name: "Body", data: body, weight: 400, style: "normal" }, { name: "Body", data: bodyBold, weight: 700, style: "normal" }];
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

async function render(node: Node) {
  const svg = await satori(node as never, { width: 1200, height: 630, fonts: await loadFonts() });
  return new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
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
