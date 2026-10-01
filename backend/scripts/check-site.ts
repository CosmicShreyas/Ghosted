// Diagnostic for "List a company": runs the website check and the auto-fill for each site and
// prints what the form would be filled with.
// Run: npx tsx scripts/check-site.ts accenture.com infosys.com zerodha.com localhost
import { inspectWebsite } from "../src/lib/site-check.js";
import { gatherFacts } from "../src/lib/company-facts.js";

for (const input of process.argv.slice(2)) {
  const t = Date.now();
  try {
    const site = await inspectWebsite(input);
    const facts = await gatherFacts(site);
    console.log(`\n${input} (${Date.now() - t} ms) readable=${site.readable} icon=${site.iconUrl ? "yes" : "no"} sources=${facts.sources.join("+") || "none"}`);
    for (const k of ["name", "industry", "size", "hqCity", "founded", "careersUrl"] as const) console.log(`  ${k.padEnd(10)} ${facts[k] ?? "–"}`);
    console.log(`  about      ${facts.about ? `[${facts.aboutSource}] ${facts.about.slice(0, 140)}…` : "–"}`);
  } catch (err) { console.log(`\n${input} → refused: ${(err as Error).message}`); }
}
