import { describe, expect, it } from "vitest";
import { buildTableLeaderboard } from "./table-board";

// Golden values: the exact fixture docs/adr/0012-leaderboard-view.md D13
// says the rule has to survive -- "the prototype's fixture deliberately
// puts the Late Joiner top of the board on 152 with the leader on 148...
// the board shows no rank-1 collision at all, and the eligible leader is
// unambiguously 1."

const LATE_JOINER = {
  playerId: "p-late",
  displayName: "Late Larry",
  emoji: "🕐",
  isLateJoiner: true,
  totalScore: 152,
  placementScore: 100,
  bandBonusScore: 42,
  boldCallScore: 10,
};

const LEADER = {
  playerId: "p-leader",
  displayName: "Eager Ellie",
  emoji: "⚡",
  isLateJoiner: false,
  totalScore: 148,
  placementScore: 95,
  bandBonusScore: 40,
  boldCallScore: 13,
};

const SECOND_PLACE = {
  playerId: "p-second",
  displayName: "Steady Sam",
  emoji: "🐢",
  isLateJoiner: false,
  totalScore: 120,
  placementScore: 90,
  bandBonusScore: 30,
  boldCallScore: 0,
};

// A skip-rank tie: two eligible players on the same score share a place,
// and the next distinct value's rank accounts for both tied players above
// it (rank.ts's existing rule, reused rather than re-decided here).
const TIED_A = {
  playerId: "p-tied-a",
  displayName: "Tie A",
  emoji: null,
  isLateJoiner: false,
  totalScore: 90,
  placementScore: 70,
  bandBonusScore: 20,
  boldCallScore: 0,
};

const TIED_B = {
  playerId: "p-tied-b",
  displayName: "Tie B",
  emoji: null,
  isLateJoiner: false,
  totalScore: 90,
  placementScore: 60,
  bandBonusScore: 20,
  boldCallScore: 10,
};

const AFTER_TIE = {
  playerId: "p-after-tie",
  displayName: "After Tie",
  emoji: null,
  isLateJoiner: false,
  totalScore: 80,
  placementScore: 60,
  bandBonusScore: 20,
  boldCallScore: 0,
};

describe("buildTableLeaderboard", () => {
  it("gives the Late Joiner no rank despite the top score, and the eligible leader an unambiguous 1", () => {
    const rows = buildTableLeaderboard(
      [LATE_JOINER, LEADER, SECOND_PLACE],
      "p-leader",
    );

    const lateJoinerRow = rows.find((r) => r.playerId === "p-late");
    const leaderRow = rows.find((r) => r.playerId === "p-leader");
    const secondRow = rows.find((r) => r.playerId === "p-second");

    expect(lateJoinerRow?.rank).toBe(null);
    expect(lateJoinerRow?.totalScore).toBe(152);
    expect(leaderRow?.rank).toBe(1);
    expect(leaderRow?.totalScore).toBe(148);
    expect(secondRow?.rank).toBe(2);
  });

  it("keeps the Late Joiner at their true list position (top, by score) despite carrying no rank", () => {
    const rows = buildTableLeaderboard(
      [LATE_JOINER, LEADER, SECOND_PLACE],
      "p-leader",
    );

    expect(rows[0].playerId).toBe("p-late");
    expect(rows[1].playerId).toBe("p-leader");
    expect(rows[2].playerId).toBe("p-second");
  });

  it("skip-ranks a tie among eligible players, so the next distinct score skips ahead by the tie count", () => {
    const rows = buildTableLeaderboard(
      [LEADER, TIED_A, TIED_B, AFTER_TIE],
      "p-tied-a",
    );

    const tiedA = rows.find((r) => r.playerId === "p-tied-a");
    const tiedB = rows.find((r) => r.playerId === "p-tied-b");
    const afterTie = rows.find((r) => r.playerId === "p-after-tie");

    expect(tiedA?.rank).toBe(2);
    expect(tiedB?.rank).toBe(2);
    // Two players tied 2nd, so the next distinct score is 4th, not 3rd.
    expect(afterTie?.rank).toBe(4);
  });

  it("marks the viewer's own row and carries every score component through verbatim", () => {
    const rows = buildTableLeaderboard([LEADER, SECOND_PLACE], "p-second");

    const viewerRow = rows.find((r) => r.playerId === "p-second");
    const otherRow = rows.find((r) => r.playerId === "p-leader");

    expect(viewerRow?.isViewer).toBe(true);
    expect(otherRow?.isViewer).toBe(false);
    expect(viewerRow?.placementScore).toBe(90);
    expect(viewerRow?.bandBonusScore).toBe(30);
    expect(viewerRow?.boldCallScore).toBe(0);
  });

  it("has no Bots to exclude -- the caller never includes them (D13: bots don't submit a table)", () => {
    const rows = buildTableLeaderboard([LEADER], "p-leader");
    expect(rows.length).toBe(1);
  });
});
