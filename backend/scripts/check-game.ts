// Checks the Ghost Blasters score caps (backend/src/routes/game.ts).
// Run: cd backend && npx tsx scripts/check-game.ts   (no database, no network)
import { maxOffers, maxXp, offerXp } from "../src/routes/game.js";

let failed = 0;
const expect = (name: string, ok: boolean) => { console.log(`${ok ? "pass" : "FAIL"}  ${name}`); if (!ok) failed++; };

expect("no offer before 4 seconds", maxOffers(3) === 0);
expect("first offer possible at 4 seconds", maxOffers(4) === 1);
expect("then one every 7 seconds", maxOffers(11) === 2 && maxOffers(17) === 2 && maxOffers(18) === 3);
expect("offer Experience is 100 × the new level", offerXp(1) === 200 && offerXp(2) === 500 && offerXp(3) === 900);
expect("a 0-second run can't score more than the opening allowance", maxXp(0, 50) === 200);
expect("claimed offers above what time allows are ignored", maxXp(10, 99) === maxXp(10, 1));
expect("a real 60-second run with 4 offers fits under the cap", 1400 + 2000 <= maxXp(60, 4));
expect("a faked 999,999 in 30 seconds is cut down", maxXp(30, 99) < 10_000);

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log("\nAll game checks passed.");
