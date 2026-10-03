// Checks the journey rules and the Flag Score formula (backend/src/score.ts).
// Run: cd backend && npx tsx scripts/check-score.ts   (no database, no network)
import { z } from "zod";
import { checkJourney, storyScore } from "../src/score.js";

const schema = z.object({ outcome: z.enum(["ghosted", "rejected", "offer", "offer_revoked", "ghost_job"]), joined: z.boolean().nullable().optional(), ratings: z.record(z.number().nullable().optional()), salary: z.unknown().optional() }).superRefine(checkJourney as never);
let failed = 0;
const expect = (name: string, ok: boolean) => { console.log(`${ok ? "pass" : "FAIL"}  ${name}`); if (!ok) failed++; };
const valid = (v: unknown) => schema.safeParse(v).success;

const hc = { hiring: 2, communication: 1 };
expect("ghosted with hiring + communication", valid({ outcome: "ghosted", ratings: hc }));
expect("ghosted missing communication is rejected", !valid({ outcome: "ghosted", ratings: { hiring: 2 } }));
expect("ghosted with pay is rejected", !valid({ outcome: "ghosted", ratings: { ...hc, pay: 3 } }));
expect("rejected with salary is rejected", !valid({ outcome: "rejected", ratings: hc, salary: { min: 5, max: 8 } }));
expect("ghost job with culture is rejected", !valid({ outcome: "ghost_job", ratings: { ...hc, culture: 3 } }));
expect("ghosted with joined is rejected", !valid({ outcome: "ghosted", joined: true, ratings: hc }));
expect("offer revoked needs pay", !valid({ outcome: "offer_revoked", ratings: hc }));
expect("offer revoked with pay and salary", valid({ outcome: "offer_revoked", ratings: { ...hc, pay: 2 }, salary: { min: 5, max: 8 } }));
expect("offer revoked with growth is rejected", !valid({ outcome: "offer_revoked", ratings: { ...hc, pay: 2, growth: 4 } }));
expect("offer, didn't join, three ratings", valid({ outcome: "offer", joined: false, ratings: { ...hc, pay: 4 } }));
expect("offer, didn't join, culture is rejected", !valid({ outcome: "offer", joined: false, ratings: { ...hc, pay: 4, culture: 4 } }));
expect("offer, joined, all five", valid({ outcome: "offer", joined: true, ratings: { ...hc, pay: 4, culture: 4, growth: 5 } }));
expect("offer, joined, missing growth is rejected", !valid({ outcome: "offer", joined: true, ratings: { ...hc, pay: 4, culture: 4 } }));

// Formula: identical to the old (sum - 5) * 5 when all five exist; skips missing ones.
const all = { hiring: 4, communication: 2, culture: 5, pay: 3, growth: 1 };
expect("all five matches the old formula", storyScore(all) === Math.round((4 + 2 + 5 + 3 + 1 - 5) * 5));
expect("two ratings: mean of those two", storyScore({ hiring: 1, communication: 3, culture: null }) === 25);
expect("no ratings: null, never a fake 50", storyScore({}) === null);

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log("\nAll checks passed.");
