// Checks the invite level unlocks (backend/src/referral.ts) and the Waiting Room nudge rule
// (backend/src/nudges.ts). Run: cd backend && npx tsx scripts/check-growth.ts   (no database, no network)
import { unlockedFlairs } from "../src/referral.js";
import { isGhosted } from "../src/nudges.js";

let failed = 0;
const expect = (name: string, ok: boolean) => { console.log(`${ok ? "pass" : "FAIL"}  ${name}`); if (!ok) failed++; };
const has = (f: string[], ...want: string[]) => want.every((w) => f.includes(w));
const flairs = (voices: number, completed = 0, joinedViaInviteWithStory = false) => unlockedFlairs({ voices, completed, joinedViaInviteWithStory });

expect("nothing at zero", flairs(0).length === 0);
expect("Level 1 at one voice", has(flairs(1), "sunrise") && !has(flairs(1), "gold"));
expect("invited member with a story gets Level 1", has(flairs(0, 0, true), "sunrise"));
expect("Level 2 at three voices", has(flairs(3), "sunrise", "gold") && !has(flairs(3), "cosmic"));
expect("two voices is not Level 2", !has(flairs(2), "gold"));
expect("Level 3 at ten voices", has(flairs(10), "sunrise", "gold", "cosmic"));
expect("nine voices is not Level 3", !has(flairs(9), "cosmic"));
expect("violet ring at three missions", has(flairs(0, 3), "violet") && !has(flairs(0, 3), "mint"));
expect("mint ring at six missions", has(flairs(0, 6), "violet", "mint"));

expect("29 days is never ghosted", !isGhosted(29, 3));
expect("30 days with a short usual wait is ghosted", isGhosted(30, 7));
expect("under twice the usual is not ghosted", !isGhosted(39, 20));
expect("twice the usual is ghosted", isGhosted(40, 20));
expect("no benchmark falls back to 14 days (30 minimum)", isGhosted(30, null) && !isGhosted(29, null));

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log("\nAll growth checks passed.");
