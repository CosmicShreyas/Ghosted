// The company side's safety numbers: aggregate thresholds (nothing below them reaches a company)
// and the reply pledge badge. Pure functions from the API, no database.
import { describe, expect, it } from "vitest";
import { buckets, floorCount, median, MIN_ASKS, MIN_BUCKET, monthlyAverage } from "../../backend/src/lib/aggregate";
import { pledgeBadge, PLEDGE_MIN } from "../../backend/src/lib/pledge";

describe("aggregate thresholds", () => {
  it("hides request counts below 3", () => {
    expect(MIN_ASKS).toBe(3);
    expect(floorCount(0)).toBeNull();
    expect(floorCount(2)).toBeNull();
    expect(floorCount(3)).toBe(3);
  });

  it("drops any group smaller than 3 and reports how many were hidden", () => {
    const keys = ["ghosted", "ghosted", "ghosted", "offer", "offer", "rejected"];
    const r = buckets(keys);
    expect(MIN_BUCKET).toBe(3);
    expect(r.shown).toEqual([{ key: "ghosted", count: 3 }]);
    expect(r.hidden).toBe(3);
    expect(r.shown.every((b) => b.count >= MIN_BUCKET)).toBe(true);
  });

  it("works out medians for odd and even counts", () => {
    expect(median([])).toBeNull();
    expect(median([9, 1, 5])).toBe(5);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("leaves months with fewer than 3 stories blank", () => {
    const now = new Date("2026-06-15T00:00:00Z");
    const pts = [
      { at: "2026-06-01T00:00:00Z", value: 60 }, { at: "2026-06-02T00:00:00Z", value: 70 }, { at: "2026-06-03T00:00:00Z", value: 80 },
      { at: "2026-05-01T00:00:00Z", value: 10 }, { at: "2026-05-02T00:00:00Z", value: 20 },
    ];
    const m = monthlyAverage(pts, 2, now);
    expect(m).toEqual([{ month: "2026-05", n: 2, value: null }, { month: "2026-06", n: 3, value: 70 }]);
  });
});

describe("reply pledge badge", () => {
  const made = "2026-01-01T00:00:00Z";
  const s = (outcome: string, days: number | null, at = "2026-02-01T00:00:00Z") => ({ outcome, days_waited: days, created_at: at });

  it("stays 'made' until 5 counted stories", () => {
    const r = pledgeBadge([s("rejected", 3), s("offer", 5), s("ghosted", null), s("rejected", 2)], 14, made);
    expect(PLEDGE_MIN).toBe(5);
    expect(r.badge).toBe("made");
    expect(r.stories).toBe(4);
  });

  it("ignores stories from before the pledge and ones with no wait (unless ghosted)", () => {
    const r = pledgeBadge([s("rejected", 1, "2025-12-01T00:00:00Z"), s("rejected", null), s("ghosted", null)], 7, made);
    expect(r.stories).toBe(1);
    expect(r.kept).toBe(0);
  });

  it("is 'holding' at 70% or more kept", () => {
    const r = pledgeBadge([s("rejected", 3), s("offer", 6), s("rejected", 7), s("offer", 2), s("rejected", 30), s("offer", 1), s("rejected", 4), s("ghosted", null), s("offer", 5), s("rejected", 6)], 7, made);
    expect(r.rate).toBe(80);
    expect(r.badge).toBe("holding");
  });

  it("is 'slipping' under 40%, counting ghosting and late replies as broken", () => {
    const r = pledgeBadge([s("ghosted", null), s("ghosted", 40), s("rejected", 20), s("offer", 3), s("ghost_job", null)], 14, made);
    expect(r.kept).toBe(1);
    expect(r.badge).toBe("slipping");
  });

  it("is 'mixed' in between, and 'withdrawn' always wins", () => {
    const five = [s("rejected", 2), s("offer", 3), s("ghosted", null), s("rejected", 30), s("offer", 5)];
    expect(pledgeBadge(five, 14, made).badge).toBe("mixed");
    expect(pledgeBadge(five, 14, made, true).badge).toBe("withdrawn");
  });
});
