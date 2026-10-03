// Renders sample link-preview cards to PNG files so the design can be checked without deploying.
// Run: cd backend && npx tsx scripts/og-preview.ts [output-folder]   (sample text only, no database)
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { companyCard, siteCard, storyCard } from "../src/og.js";

const out = process.argv[2] ?? ".";
const site = "https://ghosted-platform.vercel.app";
writeFileSync(join(out, "og-story.png"), await storyCard({ title: "Ghosted after the final round, waited over 2 months", company: "Example Corp", outcome: "Ghosted", wait: "over 2 months", score: 13, quick: true, relatable: 3 }, site));
writeFileSync(join(out, "og-company.png"), await companyCard({ name: "Example Corp", stories: 4, score: 38, ghosted: 2, avgWait: 34, city: "Bengaluru" }, site));
writeFileSync(join(out, "og-site.png"), await siteCard(site));
console.log(`Wrote og-story.png, og-company.png and og-site.png to ${out}`);
