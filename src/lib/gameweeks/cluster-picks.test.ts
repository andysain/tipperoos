import { describe, expect, it } from "vitest";
import {
  clusterPicks,
  isWrongWayRound,
  type ClusterInput,
} from "./cluster-picks";

// Golden values hand-derived from
// docs/adr/0013-match-centre-tense-and-axes.md D13 and CLAUDE.md -> Scoring.

const pick = (
  playerId: string,
  homeScore: number | null,
  awayScore: number | null,
  points: number | null,
  isBot = false,
): ClusterInput => ({
  playerId,
  displayName: playerId,
  emoji: null,
  isBot,
  homeScore,
  awayScore,
  points,
});

describe("clusterPicks", () => {
  it("collapses identical scorelines into one cluster", () => {
    const clusters = clusterPicks(
      [pick("a", 2, 1, 7), pick("b", 2, 1, 7), pick("c", 1, 1, 0)],
      "a",
    );
    expect(clusters).toHaveLength(2);
    expect(clusters[0].members.map((m) => m.playerId)).toEqual(["a", "b"]);
  });

  it("orders correct-first, then by crowd size", () => {
    const clusters = clusterPicks(
      [
        pick("a", 1, 1, 0),
        pick("b", 1, 1, 0),
        pick("c", 1, 1, 0),
        pick("d", 2, 1, 7),
      ],
      "z",
    );
    // The three-strong cluster is bigger, but the single correct one leads.
    expect(clusters[0].homeScore).toBe(2);
    expect(clusters[1].members).toHaveLength(3);
  });

  // Before a result exists every cluster scores null, so ordering falls
  // through to crowd size -- the list must reshuffle exactly once.
  it("falls through to crowd size when nothing is scored yet", () => {
    const clusters = clusterPicks(
      [pick("a", 3, 0, null), pick("b", 1, 1, null), pick("c", 1, 1, null)],
      "z",
    );
    expect(clusters[0].members).toHaveLength(2);
  });

  it("puts the viewer first, then people alphabetically, then bots", () => {
    const clusters = clusterPicks(
      [
        pick("bot", 1, 1, 0, true),
        pick("zoe", 1, 1, 0),
        pick("andy", 1, 1, 0),
        pick("me", 1, 1, 0),
      ],
      "me",
    );
    expect(clusters[0].members.map((m) => m.playerId)).toEqual([
      "me",
      "andy",
      "zoe",
      "bot",
    ]);
  });

  it("excludes players who filed no pick", () => {
    const clusters = clusterPicks(
      [pick("a", 2, 1, 7), pick("b", null, null, null)],
      "a",
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0].members).toHaveLength(1);
  });

  it("returns nothing when nobody picked", () => {
    expect(clusterPicks([pick("a", null, null, null)], "a")).toEqual([]);
  });
});

describe("isWrongWayRound", () => {
  it("fires on the exact scoreline reversed", () => {
    expect(isWrongWayRound(2, 1, 1, 2)).toBe(true);
  });

  // A reversed draw is the same scoreline, so it can never fire on one.
  it("never fires on a draw", () => {
    expect(isWrongWayRound(1, 1, 1, 1)).toBe(false);
  });

  it("does not fire on a merely wrong pick", () => {
    expect(isWrongWayRound(2, 1, 3, 0)).toBe(false);
  });

  it("does not fire before a result exists", () => {
    expect(isWrongWayRound(2, 1, null, null)).toBe(false);
  });
});
