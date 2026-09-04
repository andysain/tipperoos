import { describe, expect, it } from "vitest";
import { rankScores, type ScoreInput } from "./rank";

// Golden values hand-derived per issue #204: standard ("skip"/"1224")
// competition ranking -- ties share a place, and the next distinct value's
// rank accounts for every tied player above it (e.g. 1, 1, 3, 4; a
// three-way tie at 1 is followed by 4, not 2), sorted by points descending.

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

  it("gives tied players the same rank, and skips ahead by the tie count", () => {
    const result = rankScores([score("a", 20), score("b", 20), score("c", 10)]);
    expect(result.find((r) => r.playerId === "a")?.rank).toBe(1);
    expect(result.find((r) => r.playerId === "b")?.rank).toBe(1);
    // Skip ranking: two players tied at 1st, so the next distinct value is
    // rank 3, not rank 2.
    expect(result.find((r) => r.playerId === "c")?.rank).toBe(3);
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
    // Skip ranking: three tied at 1st, so the next distinct value is rank 4.
    expect(result.find((r) => r.playerId === "d")?.rank).toBe(4);
  });

  // Invariant: rank is always a positive integer no greater than the
  // player count, regardless of input order or size. (Skip ranking, unlike
  // dense ranking, can legitimately reach the full player count -- e.g.
  // everyone on a distinct score -- so the bound is the roster size, not
  // the number of distinct point values.)
  it("never assigns a rank greater than the number of players", () => {
    const input = [
      score("a", 7),
      score("b", 7),
      score("c", 3),
      score("d", 9),
      score("e", 3),
    ];
    const result = rankScores(input);
    for (const row of result) {
      expect(row.rank).toBeGreaterThanOrEqual(1);
      expect(row.rank).toBeLessThanOrEqual(input.length);
    }
  });

  it("skips ahead by the tie count for a mixed tie/distinct set", () => {
    // d(9) 1st; a(7)/b(7) tied 2nd; next distinct c/e(3) is 4th, not 3rd.
    const result = rankScores([
      score("a", 7),
      score("b", 7),
      score("c", 3),
      score("d", 9),
      score("e", 3),
    ]);
    expect(result.find((r) => r.playerId === "d")?.rank).toBe(1);
    expect(result.find((r) => r.playerId === "a")?.rank).toBe(2);
    expect(result.find((r) => r.playerId === "b")?.rank).toBe(2);
    expect(result.find((r) => r.playerId === "c")?.rank).toBe(4);
    expect(result.find((r) => r.playerId === "e")?.rank).toBe(4);
  });
});
