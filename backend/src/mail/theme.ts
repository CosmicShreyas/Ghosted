// Emails in the reader's theme. Templates are written once, in the light palette (inline styles,
// the only thing every mail client renders reliably); for dark-mode readers the finished HTML is
// re-coloured to the site's "after hours" palette (styles.css .dark), so both stay in step.
export type EmailTheme = "light" | "dark";

// Light template colour → after-hours colour. Order matters where one colour plays two roles.
const SWAPS: [RegExp, string][] = [
  // The mustard banner keeps dark text (cream on yellow doesn't read).
  [/(background:#EDE3A6;[^"]*?)color:#141110/gi, "$1color:#1A140F"],
  [/#EDE3A6/gi, "#F4C44E"],
  // Hard shadows turn violet, like the site's dark mode.
  [/(box-shadow:[^;"]*?)#141110/gi, "$1#7C4DDE"],
  // Violet buttons: dark text on the lifted violet.
  [/(background:#6D28D9;[^"]*?)color:#fff\b/gi, "$1color:#150F1C"],
  [/#6D28D9/gi, "#9F7AEA"],
  [/#FAF7F2/gi, "#16111D"],   // page background (and inset panels) → night plum
  [/#FFFFFF\b|#fff\b/gi, "#211A2B"], // cards → dark card
  [/#141110/gi, "#F2E9D8"],   // ink: text and borders → cream
  [/#6B6560|#6B6460/gi, "#B3A8BD"], // muted text
  [/#D9D2C7/gi, "#4A3F57"],   // dividers
  [/#EF4444/gi, "#F25C5C"],   // red
];

export function themeEmail(html: string, theme: EmailTheme = "light") {
  if (theme !== "dark") return html;
  let out = html;
  for (const [re, to] of SWAPS) out = out.replace(re, to);
  // Tell mail apps it's already dark, so they don't auto-invert it into something muddy.
  return out
    .replace(/<meta name="color-scheme" content="light only">/, '<meta name="color-scheme" content="dark only"><meta name="supported-color-schemes" content="dark">')
    .replace(/<body style="/, '<body style="color-scheme:dark;');
}
