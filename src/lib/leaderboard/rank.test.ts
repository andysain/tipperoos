import { describe, expect, it } from "vitest";
import { rankScores, type ScoreInput } from "./rank";

// Golden values hand-derived per issue #90's decision 3: dense/standard
// competition ranking (ties share a place, e.g. 1, 1, 3), sorted by points
// descending. No CLAUDE.md rule exists for tie-break beyond this -- see
// issue #90's decision log for why this default was picked over
// alternatives without escalating.

function score(playerId: string, points: number): ScoreInput {
  return { playerId, points };
}

describe("rankScores", () => {
  it("ranks a simple descending set with no ties", () => {
    const result = rankScores([score("a", 10), score("b", 30), score("c", 20)]);
    expect(result.find((r) => r.playerId === "b")?.rank).toBe(1);
    expect(result.find((r) => r.playerId === "b")?.points).toBe(30);
    expect(result.find((r) => r.playerId === "c")?.rank).toBe(2);
    expect(result.find((r) => r.playerId === "c")?.points).toBe(20);
    expect(result.find((r) => r.playerId === "a")?.rank).toBe(3);
    expect(result.find((r) => r.playerId === "a")?.points).toBe(10);
  });

  it("gives tied players the same dense rank, and skips no numbers", () => {
    const result = rankScores([score("a", 20), score("b", 20), score("c", 10)]);
    expect(result.find((r) => r.playerId === "a")?.rank).toBe(1);
    expect(result.find((r) => r.playerId === "b")?.rank).toBe(1);
    // Dense ranking: the next distinct value is rank 2, not rank 3.
    expect(result.find((r) => r.playerId === "c")?.rank).toBe(2);
  });

  it("gives everyone rank 1 when all players are tied on 0", () => {
    const result = rankScores([score("a", 0), score("b", 0), score("c", 0)]);
    for (const row of result) {
      expect(row.rank).toBe(1);
    }
  });

  it("ranks a single player as rank 1", () => {
    const result = rankScores([score("solo", 42)]);
    expect(result).toHaveLength(1);
    expect(result[0].rank).toBe(1);
    expect(result[0].points).toBe(42);
  });

  it("returns an empty array for no players", () => {
    expect(rankScores([])).toEqual([]);
  });

  it("handles a three-way tie followed by a distinct next value", () => {
    const result = rankScores([
      score("a", 15),
      score("b", 15),
      score("c", 15),
      score("d", 5),
    ]);
    expect(result.find((r) => r.playerId === "a")?.rank).toBe(1);
    expect(result.find((r) => r.playerId === "b")?.rank).toBe(1);
    expect(result.find((r) => r.playerId === "c")?.rank).toBe(1);
    expect(result.find((r) => r.playerId === "d")?.rank).toBe(2);
  });

  // Invariant: rank is always a positive integer no greater than the number
  // of distinct point values, regardless of input order or size.
  it("never assigns a rank greater than the count of distinct point values", () => {
    const input = [
      score("a", 7),
      score("b", 7),
      score("c", 3),
      score("d", 9),
      score("e", 3),
    ];
    const distinctValues = new Set(input.map((s) => s.points)).size;
    const result = rankScores(input);
    for (const row of result) {
      expect(row.rank).toBeGreaterThanOrEqual(1);
      expect(row.rank).toBeLessThanOrEqual(distinctValues);
    }
  });
});
