import { describe, expect, it } from "vitest";
import { getMatchBreakdown } from "./match-breakdown";

describe("getMatchBreakdown", () => {
  it("shows every matching scoring term", () => {
    const result = getMatchBreakdown(2, 1, 2, 1);

    expect(result.wrongWayRound).toBe(false);
    expect(result.rows.map((row) => row.points)).toEqual([3, 2, 1, 1]);
    expect(result.total).toBe(7);
  });

  it("uses the named Wrong Way Round state", () => {
    const result = getMatchBreakdown(2, 1, 1, 2);

    expect(result.wrongWayRound).toBe(true);
    expect(result.rows).toEqual([]);
    expect(result.total).toBe(1);
  });

  it("keeps non-scoring terms visible", () => {
    const result = getMatchBreakdown(1, 0, 2, 0);

    expect(result.rows.map((row) => row.points)).toEqual([3, null, null, 1]);
    expect(result.total).toBe(4);
  });

  it("returns the separate missing-pick state", () => {
    const result = getMatchBreakdown(null, null, 2, 0);

    expect(result.rows).toEqual([]);
    expect(result.total).toBe(0);
  });
});
