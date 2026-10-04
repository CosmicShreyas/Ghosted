// The Founding 50 ranking (backend/src/founding-rank.ts) and the milestones the progress bar shows
// after the first 50 (milestone in src/lib/founding.tsx).
import { describe, expect, it } from "vitest";
import { rankFounders, type FounderRow } from "../../backend/src/founding-rank";
import { milestone } from "@/lib/founding";

const row = (id: number, kind: string | null = "person"): FounderRow => ({ author: { public_id: id, kind } });

describe("rankFounders", () => {
  it("ranks authors by their first published story, oldest first", () => {
    const { ranks } = rankFounders([row(7), row(3), row(9)], 50);
    expect([ranks.get(7), ranks.get(3), ranks.get(9)]).toEqual([1, 2, 3]);
  });
  it("counts each author once, from their first story", () => {
    const { ranks, contributors } = rankFounders([row(1), row(2), row(1), row(3)], 50);
    expect(ranks.get(3)).toBe(3);
    expect(contributors).toBe(3);
  });
  it("never ranks bots or stories without an author", () => {
    const { ranks, contributors } = rankFounders([row(1, "bot"), { author: null }, row(2)], 50);
    expect(ranks.has(1)).toBe(false);
    expect(ranks.get(2)).toBe(1);
    expect(contributors).toBe(1);
  });
  it("stops ranking at the limit but keeps counting contributors", () => {
    const rows = Array.from({ length: 60 }, (_, i) => row(i + 1));
    const { ranks, contributors } = rankFounders(rows, 50);
    expect(ranks.size).toBe(50);
    expect(ranks.get(50)).toBe(50);
    expect(ranks.has(51)).toBe(false);
    expect(contributors).toBe(60);
  });
  it("treats public ids given as strings the same as numbers", () => {
    const { ranks } = rankFounders([{ author: { public_id: "123456789012345" } }, row(123456789012345)], 50);
    expect(ranks.size).toBe(1);
  });
});

describe("milestone", () => {
  it("aims at 50 first", () => { expect(milestone(0)).toEqual({ next: 50, prev: 0 }); expect(milestone(49)).toEqual({ next: 50, prev: 0 }); });
  it("moves on once a milestone is reached, so the bar never stops", () => {
    expect(milestone(50)).toEqual({ next: 100, prev: 50 });
    expect(milestone(2600)).toEqual({ next: 5000, prev: 2500 });
  });
  it("keeps going past the last named milestone in steps of 10,000", () => {
    expect(milestone(10000)).toEqual({ next: 20000, prev: 10000 });
    expect(milestone(23456)).toEqual({ next: 30000, prev: 10000 });
  });
});
