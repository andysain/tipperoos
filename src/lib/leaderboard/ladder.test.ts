import { describe, expect, it } from "vitest";
import { buildLadder, type LadderInput } from "./ladder";

// Golden values hand-derived from docs/adr/0012-leaderboard-view.md D12
// (bots are ranked past, not ranked) and docs/adr/0013 D15.

const p = (playerId: string, points: number, isBot = false): LadderInput => ({
  playerId,
  displayName: playerId,
  emoji: null,
  isBot,
  points,
});

// Literal golden values for the ranks themselves, per TESTING_STANDARD.md
// 1a.2. Dense ranking with bots excluded BEFORE ranking is the property
// docs/adr/0012 D12 turns on, and asserting only row order would pass on a
// ladder that numbered them wrongly.
describe("buildLadder ranks", () => {
  it("numbers a clean field 1, 2, 3", () => {
    const l = buildLadder([p("a", 30), p("me", 20), p("c", 10)], "me");
    expect(l[0].rank).toBe(1);
    expect(l[1].rank).toBe(2);
    expect(l[2].rank).toBe(3);
  });

  it("ranks past a bot rather than counting it", () => {
    const l = buildLadder([p("a", 30), p("bot", 25, true), p("me", 20)], "me");
    expect(l.length).toBe(2);
    expect(l[1].rank).toBe(2);
  });

  // Dense ranking: a tie shares a place and the NEXT place is not skipped.
  it("does not skip a place after a tie", () => {
    const l = buildLadder([p("a", 20), p("me", 20), p("c", 10)], "me");
    expect(l[1].rank).toBe(1);
    expect(l[2].rank).toBe(2);
  });

  it("windows to exactly three rows in a long field", () => {
    const l = buildLadder(
      [p("a", 60), p("b", 50), p("me", 40), p("d", 30), p("e", 20)],
      "me",
    );
    expect(l.length).toBe(3);
    expect(l[1].points).toBe(40);
  });
});

describe("buildLadder", () => {
  // The guarantee inherited from loadSeasonStats, which this supersedes.
  it("ranks past a bot sitting between two humans", () => {
    const ladder = buildLadder(
      [p("top", 30), p("bot", 20, true), p("me", 10)],
      "me",
    );
    expect(ladder.map((r) => [r.playerId, r.rank])).toEqual([
      ["top", 1],
      ["me", 2],
    ]);
  });

  it("windows to the viewer and one either side", () => {
    const ladder = buildLadder(
      [p("a", 50), p("b", 40), p("me", 30), p("d", 20), p("e", 10)],
      "me",
    );
    expect(ladder.map((r) => r.playerId)).toEqual(["b", "me", "d"]);
  });

  // Three rows wherever the viewer sits -- the block must not change shape.
  it("shows the two below when the viewer is top", () => {
    const ladder = buildLadder(
      [p("me", 50), p("b", 40), p("c", 30), p("d", 20)],
      "me",
    );
    expect(ladder.map((r) => r.playerId)).toEqual(["me", "b", "c"]);
  });

  it("shows the two above when the viewer is bottom", () => {
    const ladder = buildLadder(
      [p("a", 50), p("b", 40), p("c", 30), p("me", 20)],
      "me",
    );
    expect(ladder.map((r) => r.playerId)).toEqual(["b", "c", "me"]);
  });

  it("returns everyone when the competition is smaller than the window", () => {
    const ladder = buildLadder([p("a", 20), p("me", 10)], "me");
    expect(ladder.map((r) => r.playerId)).toEqual(["a", "me"]);
  });

  // Dense ranking: a tie shares a place and the next place is not skipped.
  it("gives tied players the same rank", () => {
    const ladder = buildLadder([p("a", 20), p("me", 20), p("c", 10)], "me");
    expect(ladder.map((r) => r.rank)).toEqual([1, 1, 2]);
  });

  it("is empty when the competition is all bots", () => {
    expect(buildLadder([p("bot", 10, true)], "me")).toEqual([]);
  });
});
