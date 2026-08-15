import { describe, expect, it } from "vitest";
import { type BandKey } from "./rules";
import {
  bandPosition,
  type BandCounts,
  type BoardState,
  championWasNamed,
  countRead,
  countsOf,
  demotePlaced,
  dropInto,
  fillTone,
  firstIncorrectlyFilledBand,
  modeFor,
  nextOutTeam,
  nextUnfilledBand,
  rosterOrder,
  startAgain,
  swapBands,
  tapWhileFilling,
  tapWithEviction,
} from "./board";

const empty: BoardState = { assignments: {}, previous: {} };

// Test-side constructor for the branded BandCounts shape -- countsOf is the
// only production constructor, but tests want to write literals.
function bandCounts(counts: Partial<Record<BandKey, number>>): BandCounts {
  return counts as BandCounts;
}

// PROTOTYPE (proto/predict-table-rethink): a Band can never exceed its
// target. Tapping a club into a full Band swaps it in for that Band's "next
// out" club -- last in, first out -- which returns to the roster.
describe("nextOutTeam", () => {
  it("is the most recently placed club in the Band", () => {
    const assignments = { arsenal: "europe", chelsea: "europe" } as const;
    expect(nextOutTeam(assignments, { arsenal: 0, chelsea: 1 }, "europe")).toBe(
      "chelsea",
    );
    expect(nextOutTeam(assignments, { arsenal: 5, chelsea: 1 }, "europe")).toBe(
      "arsenal",
    );
  });

  it("ignores clubs in other Bands", () => {
    expect(
      nextOutTeam(
        { arsenal: "europe", chelsea: "mid_table" },
        { arsenal: 0, chelsea: 9 },
        "europe",
      ),
    ).toBe("arsenal");
  });

  it("is null for an empty Band", () => {
    expect(nextOutTeam({}, {}, "champion")).toBeNull();
  });

  it("breaks a tie on team id, so a server-loaded board still answers", () => {
    // Assignments restored from the server share a sequence; the answer has
    // to be stable rather than dependent on object key order.
    const assignments = { arsenal: "europe", chelsea: "europe" } as const;
    expect(nextOutTeam(assignments, {}, "europe")).toBe("chelsea");
  });
});

describe("tapWithEviction", () => {
  const emptyWithSeq = { ...empty, placedAt: {} };

  it("places into a Band that still has room, evicting nobody", () => {
    const result = tapWithEviction(emptyWithSeq, "arsenal", "europe", 3, 0);
    expect(result.assignments).toEqual({ arsenal: "europe" });
    expect(result.evicted).toBeNull();
    expect(result.placedAt).toEqual({ arsenal: 0 });
  });

  it("swaps the tapped club in for the next-out club when the Band is full", () => {
    const state = {
      assignments: { arsenal: "champion" } as Record<string, BandKey>,
      previous: {},
      placedAt: { arsenal: 0 },
    };
    const result = tapWithEviction(state, "chelsea", "champion", 1, 1);

    expect(result.assignments).toEqual({ chelsea: "champion" });
    expect(result.evicted).toEqual({ teamId: "arsenal", from: "champion" });
    // The evicted club is unplaced, not re-homed somewhere it wasn't put.
    expect(result.assignments.arsenal).toBeUndefined();
    expect(result.placedAt.arsenal).toBeUndefined();
    expect(result.previous.arsenal).toBe("champion");
  });

  it("never lets a Band exceed its target, however many clubs are tapped in", () => {
    let state = { ...emptyWithSeq };
    ["a", "b", "c", "d", "e"].forEach((teamId, index) => {
      const result = tapWithEviction(state, teamId, "europe", 3, index);
      state = {
        assignments: result.assignments,
        previous: result.previous,
        placedAt: result.placedAt,
      };
    });
    const inEurope = Object.values(state.assignments).filter(
      (band) => band === "europe",
    );
    expect(inEurope).toHaveLength(3);
    // Last-in-first-out means a full Band behaves as settled slots plus one
    // revolving door: "a" and "b" -- the picks made first, and so the ones
    // the player was most sure of -- survive every later tap, while the
    // third slot churns. FIFO would do the opposite and quietly dismantle
    // the confident picks, which is why the rule is LIFO.
    expect(Object.keys(state.assignments).sort()).toEqual(["a", "b", "e"]);
  });

  it("toggle-reverts a club already in the open Band without evicting anyone", () => {
    const state = {
      assignments: { arsenal: "champion", chelsea: "europe" } as Record<
        string,
        BandKey
      >,
      previous: { arsenal: "europe" as BandKey },
      placedAt: { arsenal: 1, chelsea: 0 },
    };
    const result = tapWithEviction(state, "arsenal", "champion", 1, 2);
    expect(result.assignments.arsenal).toBe("europe");
    expect(result.evicted).toBeNull();
  });

  it("unplaces a club with no prior Band on toggle-revert", () => {
    const state = {
      assignments: { arsenal: "champion" } as Record<string, BandKey>,
      previous: { arsenal: null },
      placedAt: { arsenal: 0 },
    };
    const result = tapWithEviction(state, "arsenal", "champion", 1, 1);
    expect(result.assignments).toEqual({});
    expect(result.placedAt).toEqual({});
    expect(result.evicted).toBeNull();
  });

  it("moving a club between Bands frees its old Band's slot", () => {
    // Champion is full with arsenal; moving arsenal to Europe must not
    // evict arsenal from Champion as a side effect of its own move.
    const state = {
      assignments: { arsenal: "champion" } as Record<string, BandKey>,
      previous: {},
      placedAt: { arsenal: 0 },
    };
    const result = tapWithEviction(state, "arsenal", "europe", 3, 1);
    expect(result.assignments).toEqual({ arsenal: "europe" });
    expect(result.evicted).toBeNull();
    expect(result.movedFrom).toBe("champion");
  });
});

// PROTOTYPE: already-placed clubs sink to the bottom of the roster, but the
// re-group is deferred to a Band change -- these tests pin the grouping, and
// PredictTableFlow's handleOpenBand is the only thing that calls it.
describe("demotePlaced", () => {
  const roster = [
    { id: "a" },
    { id: "b" },
    { id: "c" },
    { id: "d" },
    { id: "e" },
  ];

  it("keeps the roster untouched when nothing is placed", () => {
    const result = demotePlaced(roster, {});
    expect(result.ordered.map((t) => t.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(result.demotedFrom).toBe(5);
  });

  it("sinks placed clubs below the unplaced ones", () => {
    const result = demotePlaced(roster, {
      b: "champion",
      d: "europe",
    } as Record<string, BandKey>);
    expect(result.ordered.map((t) => t.id)).toEqual(["a", "c", "e", "b", "d"]);
    expect(result.demotedFrom).toBe(3);
  });

  it("preserves last season's order inside each group -- regrouped, never re-sorted", () => {
    const result = demotePlaced(roster, {
      a: "champion",
      b: "europe",
    } as Record<string, BandKey>);
    // c,d,e keep their relative order, and so do a,b.
    expect(result.ordered.map((t) => t.id)).toEqual(["c", "d", "e", "a", "b"]);
  });

  it("demotes everything once all 20 are placed, leaving no unplaced group", () => {
    const all = Object.fromEntries(
      roster.map((t) => [t.id, "champion"]),
    ) as Record<string, BandKey>;
    const result = demotePlaced(roster, all);
    expect(result.demotedFrom).toBe(0);
    expect(result.ordered.map((t) => t.id)).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("tapWhileFilling", () => {
  it("places an unplaced team into the open band", () => {
    const result = tapWhileFilling(empty, "arsenal", "champion");
    expect(result.assignments).toEqual({ arsenal: "champion" });
    expect(Object.keys(result.assignments).length).toBe(1);
    expect(result.previous).toEqual({ arsenal: null });
    expect(result.movedFrom).toBeNull();
  });

  it("moves a team from one band directly into the open band, recording where it came from", () => {
    const state: BoardState = {
      assignments: { arsenal: "europe" },
      previous: { arsenal: null },
    };
    const result = tapWhileFilling(state, "arsenal", "champion");
    expect(result.assignments).toEqual({ arsenal: "champion" });
    expect(Object.keys(result.assignments).length).toBe(1);
    expect(result.previous).toEqual({ arsenal: "europe" });
    expect(result.movedFrom).toBe("europe");
  });

  it("tapping a team already in the open band reverts it to its prior band", () => {
    const state: BoardState = {
      assignments: { arsenal: "champion" },
      previous: { arsenal: "europe" },
    };
    const result = tapWhileFilling(state, "arsenal", "champion");
    expect(result.assignments).toEqual({ arsenal: "europe" });
    expect(Object.keys(result.assignments).length).toBe(1);
    expect(result.movedFrom).toBeNull();
  });

  it("tapping a team already in the open band with no prior band reverts it to unplaced", () => {
    const state: BoardState = {
      assignments: { arsenal: "champion" },
      previous: { arsenal: null },
    };
    const result = tapWhileFilling(state, "arsenal", "champion");
    expect(result.assignments).toEqual({});
    expect(Object.keys(result.assignments).length).toBe(0);
    expect(result.movedFrom).toBeNull();
  });
});

describe("dropInto", () => {
  it("moves the lifted team into the target band and records where it came from", () => {
    const state: BoardState = {
      assignments: { arsenal: "europe" },
      previous: { arsenal: null },
    };
    const result = dropInto(state, "arsenal", "champion");
    expect(result.assignments).toEqual({ arsenal: "champion" });
    expect(Object.keys(result.assignments).length).toBe(1);
    expect(result.previous).toEqual({ arsenal: "europe" });
    expect(result.movedFrom).toBe("europe");
  });
});

describe("swapBands", () => {
  it("exchanges two placed teams' bands", () => {
    const state: BoardState = {
      assignments: { arsenal: "champion", chelsea: "europe" },
      previous: { arsenal: null, chelsea: null },
    };
    const result = swapBands(state, "arsenal", "chelsea");
    expect(result.assignments).toEqual({
      arsenal: "europe",
      chelsea: "champion",
    });
    expect(Object.keys(result.assignments).length).toBe(2);
    expect(result.swapped[0]).toEqual({
      teamId: "arsenal",
      movedFrom: "champion",
    });
    expect(result.swapped[1]).toEqual({
      teamId: "chelsea",
      movedFrom: "europe",
    });
  });

  it("records each team's prior band, for the swap undo affordance", () => {
    const state: BoardState = {
      assignments: { arsenal: "champion", chelsea: "europe" },
      previous: { arsenal: null, chelsea: null },
    };
    const result = swapBands(state, "arsenal", "chelsea");
    expect(result.previous.arsenal).toBe("champion");
    expect(result.previous.chelsea).toBe("europe");
  });

  it("swapping the same pair twice restores their original bands", () => {
    const state: BoardState = {
      assignments: { arsenal: "champion", chelsea: "europe" },
      previous: { arsenal: null, chelsea: null },
    };
    const first = swapBands(state, "arsenal", "chelsea");
    const second = swapBands(
      { assignments: first.assignments, previous: first.previous },
      "arsenal",
      "chelsea",
    );
    expect(second.assignments).toEqual({
      arsenal: "champion",
      chelsea: "europe",
    });
    expect(Object.keys(second.assignments).length).toBe(2);
  });
});

describe("startAgain", () => {
  it("clears every assignment and history", () => {
    const state: BoardState = {
      assignments: { arsenal: "champion", chelsea: "europe" },
      previous: { arsenal: null, chelsea: "mid_table" },
    };
    expect(startAgain()).toEqual(empty);
    expect(Object.keys(startAgain().assignments).length).toBe(0);
    // starAgain doesn't read the passed-in state at all -- confirm it's a
    // pure reset, not an accidental no-op.
    expect(state.assignments).not.toEqual({});
    expect(Object.keys(state.assignments).length).toBe(2);
  });
});

describe("fillTone / countRead", () => {
  it("reads under-filled", () => {
    expect(fillTone(3, 4)).toBe("under");
    expect(countRead(3, 4)).toBe("3/4 · 1 to go");
  });

  it("reads exactly right", () => {
    expect(fillTone(4, 4)).toBe("ok");
    expect(countRead(4, 4)).toBe("✓ 4/4");
  });

  it("reads over-filled", () => {
    expect(fillTone(5, 4)).toBe("over");
    expect(countRead(5, 4)).toBe("5/4 · 1 over");
  });
});

describe("modeFor", () => {
  it("is filling until every team is placed", () => {
    expect(modeFor(19, 20)).toBe("filling");
  });

  it("is review once every team is placed", () => {
    expect(modeFor(20, 20)).toBe("review");
  });
});

describe("nextUnfilledBand", () => {
  it("finds the next Band ahead that's still under target", () => {
    expect(nextUnfilledBand("champion", {})).toBe("runners_up");
  });

  it("skips over Bands that are already exactly filled", () => {
    expect(
      nextUnfilledBand("champion", {
        runners_up: 1,
        champions_league: 3,
        europe: 1,
      }),
    ).toBe("europe");
  });

  it("skips over Bands that are over-filled -- not 'unfilled'", () => {
    expect(
      nextUnfilledBand("champion", { runners_up: 1, champions_league: 5 }),
    ).toBe("europe");
  });

  it("never looks backward, even if an earlier Band is still empty", () => {
    // Champion itself unfilled doesn't matter -- search starts after it.
    expect(nextUnfilledBand("europe", {})).toBe("mid_table");
  });

  it("returns null once every Band ahead is exactly filled", () => {
    expect(nextUnfilledBand("relegation_battle", { relegated: 3 })).toBeNull();
  });

  it("returns null from the last Band -- nothing ahead to search", () => {
    expect(nextUnfilledBand("relegated", {})).toBeNull();
  });
});

describe("bandPosition", () => {
  it("is 1-based, in canonical table order", () => {
    expect(bandPosition("champion")).toBe(1);
    expect(bandPosition("runners_up")).toBe(2);
    expect(bandPosition("europe")).toBe(4);
    expect(bandPosition("relegated")).toBe(8);
  });
});

describe("countsOf", () => {
  it("counts teams per band, from assignments", () => {
    expect(
      countsOf({
        arsenal: "champion",
        chelsea: "champions_league",
        liverpool: "champions_league",
      }),
    ).toEqual({ champion: 1, champions_league: 2 });
  });

  it("is empty for an empty board", () => {
    expect(countsOf({})).toEqual({});
  });
});

describe("firstIncorrectlyFilledBand", () => {
  it("lands an empty board on Champion", () => {
    expect(firstIncorrectlyFilledBand(bandCounts({}))).toBe("champion");
  });

  it("lands on the first Band under target", () => {
    expect(
      firstIncorrectlyFilledBand(
        bandCounts({ champion: 1, runners_up: 1, champions_league: 2 }),
      ),
    ).toBe("champions_league");
  });

  it("skips Bands that are exactly filled", () => {
    expect(
      firstIncorrectlyFilledBand(
        bandCounts({ champion: 1, runners_up: 1, champions_league: 3 }),
      ),
    ).toBe("europe");
  });

  it("lands on an over-filled Band -- that is work in filling mode", () => {
    expect(firstIncorrectlyFilledBand(bandCounts({ champion: 2 }))).toBe(
      "champion",
    );
  });

  it("returns null when every Band is exactly filled", () => {
    expect(
      firstIncorrectlyFilledBand(
        bandCounts({
          champion: 1,
          runners_up: 1,
          champions_league: 3,
          europe: 3,
          mid_table: 3,
          lower_table: 3,
          relegation_battle: 3,
          relegated: 3,
        }),
      ),
    ).toBeNull();
  });
});

describe("championWasNamed", () => {
  it("is true only when the champion count moves from 0 to 1", () => {
    expect(championWasNamed(bandCounts({}), bandCounts({ champion: 1 }))).toBe(
      true,
    );
    expect(
      championWasNamed(
        bandCounts({ champion: 0 }),
        bandCounts({ champion: 1 }),
      ),
    ).toBe(true);
  });

  it("is false when the champion was already named", () => {
    expect(
      championWasNamed(
        bandCounts({ champion: 1 }),
        bandCounts({ champion: 1 }),
      ),
    ).toBe(false);
    expect(
      championWasNamed(
        bandCounts({ champion: 1 }),
        bandCounts({ champion: 2 }),
      ),
    ).toBe(false);
  });

  it("is false when no champion was named", () => {
    expect(championWasNamed(bandCounts({}), bandCounts({ champion: 0 }))).toBe(
      false,
    );
    expect(
      championWasNamed(
        bandCounts({ champion: 1 }),
        bandCounts({ champion: 0 }),
      ),
    ).toBe(false);
  });

  it("is false when a different Band got a team", () => {
    expect(championWasNamed(bandCounts({}), bandCounts({ europe: 1 }))).toBe(
      false,
    );
  });
});

describe("rosterOrder", () => {
  it("orders by last season's finishing position", () => {
    const teams = [
      { id: "b", previousSeasonPosition: 5 },
      { id: "a", previousSeasonPosition: 1 },
    ];
    expect(rosterOrder(teams).map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("places promoted clubs (no previous position) last", () => {
    const teams = [
      { id: "promoted", previousSeasonPosition: null },
      { id: "veteran", previousSeasonPosition: 20 },
    ];
    expect(rosterOrder(teams).map((t) => t.id)).toEqual([
      "veteran",
      "promoted",
    ]);
  });
});
