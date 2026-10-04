// The Flag Score formula and journeys (src/lib/score.ts), and that the API's copy agrees with it.
import { describe, expect, it } from "vitest";
import { dimensionScore, journey, storyScore } from "@/lib/score";
import * as api from "../../backend/src/score";

describe("dimensionScore", () => {
  it("maps 1 to 5 stars onto 0 to 100", () => {
    expect([1, 2, 3, 4, 5].map(dimensionScore)).toEqual([0, 25, 50, 75, 100]);
  });
  it("is null when the rating is missing", () => {
    expect(dimensionScore(null)).toBeNull();
    expect(dimensionScore(undefined)).toBeNull();
  });
});

describe("storyScore", () => {
  it("is null with no ratings", () => {
    expect(storyScore({})).toBeNull();
    expect(storyScore({ hiring: null, communication: undefined })).toBeNull();
  });
  it("averages only the ratings a story has (missing ones are skipped, not zero)", () => {
    expect(storyScore({ hiring: 5, communication: 1 })).toBe(50);
    expect(storyScore({ hiring: 5, communication: 1, pay: null })).toBe(50);
    expect(storyScore({ hiring: 4 })).toBe(75);
  });
  it("rounds to a whole number", () => {
    // (4 + 4 + 5) / 3 = 4.33 → (4.33 - 1) × 25 = 83.3
    expect(storyScore({ hiring: 4, communication: 4, pay: 5 })).toBe(83);
  });
  it("matches the API's formula for every combination of two ratings", () => {
    for (let a = 1; a <= 5; a++) for (let b = 1; b <= 5; b++) expect(storyScore({ hiring: a, communication: b })).toBe(api.storyScore({ hiring: a, communication: b }));
  });
});

describe("journey", () => {
  it("asks people who were never hired only about hiring and communication", () => {
    for (const o of ["ghosted", "rejected", "ghost_job"] as const) expect(journey(o, null)).toEqual({ ratings: ["hiring", "communication"], salary: false });
  });
  it("adds pay and salary for offers that weren't joined, and revoked offers", () => {
    expect(journey("offer", false)).toEqual({ ratings: ["hiring", "communication", "pay"], salary: true });
    expect(journey("offer_revoked", null)).toEqual({ ratings: ["hiring", "communication", "pay"], salary: true });
  });
  it("adds culture and growth only for people who joined", () => {
    expect(journey("offer", true).ratings).toEqual(["hiring", "communication", "pay", "culture", "growth"]);
    expect(journey("rejected", true).ratings).not.toContain("culture");
  });
});
