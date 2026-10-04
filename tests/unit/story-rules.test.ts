// The story validation rules the API enforces (checkJourney in backend/src/score.ts): each journey
// accepts exactly its own ratings, and the site's journey() asks for the same set.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { checkJourney } from "../../backend/src/score";
import { journey, type Outcome } from "@/lib/score";

const schema = z.object({
  outcome: z.enum(["ghosted", "rejected", "offer", "offer_revoked", "ghost_job"]),
  joined: z.boolean().nullable().optional(),
  ratings: z.record(z.string(), z.number().nullable().optional()),
  salary: z.unknown().optional(),
}).superRefine(checkJourney as never);
const ok = (v: unknown) => schema.safeParse(v).success;
const hc = { hiring: 2, communication: 1 };

describe("checkJourney", () => {
  it("needs hiring and communication on every story", () => {
    expect(ok({ outcome: "ghosted", ratings: hc })).toBe(true);
    expect(ok({ outcome: "ghosted", ratings: { hiring: 2 } })).toBe(false);
    expect(ok({ outcome: "ghosted", ratings: { communication: 2 } })).toBe(false);
  });
  it("refuses pay, salary, culture and growth from people who were never hired", () => {
    expect(ok({ outcome: "ghosted", ratings: { ...hc, pay: 3 } })).toBe(false);
    expect(ok({ outcome: "rejected", ratings: hc, salary: { min: 5, max: 8 } })).toBe(false);
    expect(ok({ outcome: "ghost_job", ratings: { ...hc, culture: 3 } })).toBe(false);
  });
  it("only lets an offer be joined", () => {
    expect(ok({ outcome: "ghosted", joined: true, ratings: hc })).toBe(false);
    expect(ok({ outcome: "offer", joined: false, ratings: { ...hc, pay: 3 } })).toBe(true);
  });
  it("needs pay for offers and revoked offers", () => {
    expect(ok({ outcome: "offer_revoked", ratings: hc })).toBe(false);
    expect(ok({ outcome: "offer_revoked", ratings: { ...hc, pay: 2 }, salary: { min: 5, max: 8 } })).toBe(true);
  });
  it("needs culture and growth from people who joined, and refuses them otherwise", () => {
    expect(ok({ outcome: "offer", joined: true, ratings: { ...hc, pay: 4 } })).toBe(false);
    expect(ok({ outcome: "offer", joined: true, ratings: { ...hc, pay: 4, culture: 4, growth: 3 } })).toBe(true);
    expect(ok({ outcome: "offer", joined: false, ratings: { ...hc, pay: 4, growth: 3 } })).toBe(false);
  });
  it("agrees with the site: the ratings journey() asks for always pass", () => {
    const cases: [Outcome, boolean | null][] = [["ghosted", null], ["rejected", null], ["ghost_job", null], ["offer_revoked", null], ["offer", false], ["offer", true]];
    for (const [outcome, joined] of cases) {
      const ratings = Object.fromEntries(journey(outcome, joined).ratings.map((k) => [k, 3]));
      expect(ok({ outcome, ...(outcome === "offer" && { joined }), ratings })).toBe(true);
    }
  });
});
