// Quick stories (src/lib/quick-story.ts) are random by design, so these run every combination many
// times and check what must always hold: built only from the taps, no leftover placeholders, no
// names, and the house style (no em dashes).
import { describe, expect, it } from "vitest";
import { quickStory, type QuickInput } from "@/lib/quick-story";
import type { Outcome } from "@/lib/score";

const OUTCOMES: Outcome[] = ["ghosted", "rejected", "ghost_job", "offer_revoked", "offer"];
const base = (o: Partial<QuickInput>): QuickInput => ({ outcome: "ghosted", company: "Acme", stage: "technical", days: null, joined: null, role: null, ratings: { hiring: 2, communication: 1 }, ...o });
const runs = (q: QuickInput, n = 60) => Array.from({ length: n }, () => quickStory(q));

describe("quickStory", () => {
  it("always mentions the company and never leaves a {placeholder} or 'undefined'", () => {
    for (const outcome of OUTCOMES) for (const joined of [true, false, null]) for (const s of runs(base({ outcome, joined, days: 20, role: "Backend Engineer" }))) {
      expect(s).toContain("Acme");
      expect(s).not.toMatch(/\{\w+\}/);
      expect(s).not.toMatch(/undefined|null|NaN/);
    }
  });
  it("never uses em dashes", () => {
    for (const outcome of OUTCOMES) for (const s of runs(base({ outcome, days: 45 }))) expect(s).not.toContain("—");
  });
  it("puts the stage in words, and falls back when there's no stage", () => {
    expect(runs(base({ outcome: "rejected", stage: "final" })).some((s) => s.includes("final round"))).toBe(true);
    for (const s of runs(base({ outcome: "ghosted", stage: null }))) expect(s).not.toMatch(/\bthe\s+(\.|,)/);
  });
  it("describes the wait only when days were given", () => {
    const withWait = runs(base({ outcome: "ghosted", days: 45 }), 120);
    expect(withWait.some((s) => /a month or two/.test(s))).toBe(true);
    for (const s of runs(base({ outcome: "ghosted", days: null }))) expect(s).not.toMatch(/a month or two|a week or two|more than two months/);
  });
  it("includes the role only when one was given", () => {
    expect(runs(base({ role: "Data Analyst" })).every((s) => s.includes("Data Analyst"))).toBe(true);
  });
  it("is varied: the same taps don't always give the same story", () => {
    expect(new Set(runs(base({ days: 10 }), 40)).size).toBeGreaterThan(5);
  });
  it("has two or three short paragraphs", () => {
    for (const s of runs(base({}))) { const p = s.split("\n\n").length; expect(p).toBeGreaterThanOrEqual(2); expect(p).toBeLessThanOrEqual(3); }
  });
});
