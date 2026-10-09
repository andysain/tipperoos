import { describe, expect, it } from "vitest";
import type { TableLeaderboardRow } from "@/lib/leaderboard/table-board";
import { toTableCardRow } from "./table-card-row";

// Issue #214 D5 and done-when 6: the Predict the Table row's panel link.
// The repo has no component-testing library, so the list component's whole
// decision -- the row it hands LeaderboardRowCard -- lives in this pure
// mapping and is tested here.

function row(overrides: Partial<TableLeaderboardRow>): TableLeaderboardRow {
  return {
    playerId: "p-sam",
    displayName: "Sam",
    emoji: null,
    isLateJoiner: false,
    rank: 2,
    totalScore: 152,
    placementScore: 90,
    bandBonusScore: 50,
    boldCallScore: 12,
    isViewer: false,
    ...overrides,
  };
}

describe("toTableCardRow -- panelLink", () => {
  it("links another player's row to their comparison once tables are visible", () => {
    expect(toTableCardRow(row({}), true).panelLink).toEqual({
      href: "/predict-table/p-sam",
      label: "See Sam's table",
    });
  });

  it("offers no peer link before the deadline -- absent, never a dead link", () => {
    expect(toTableCardRow(row({}), false).panelLink).toBe(null);
  });

  it("always links your own row to your own table, before and after the deadline", () => {
    const own = row({ playerId: "p-me", isViewer: true });
    const expected = { href: "/predict-table", label: "See your table" };
    expect(toTableCardRow(own, false).panelLink).toEqual(expected);
    expect(toTableCardRow(own, true).panelLink).toEqual(expected);
  });
});

describe("toTableCardRow -- the rest of the card is unchanged", () => {
  it("shows the total and its three parts against their maximums", () => {
    const card = toTableCardRow(row({}), true);
    expect(card.pointsDisplay).toBe("152/200");
    expect(card.panelStats.map((s) => s.value)).toEqual([
      "90/100",
      "50/85",
      "12/15",
    ]);
  });

  it("marks a Late Joiner Late instead of a rank", () => {
    const card = toTableCardRow(row({ isLateJoiner: true, rank: null }), true);
    expect(card.ineligibleLabel).toBe("Late");
    expect(card.rank).toBe(null);
  });
});
