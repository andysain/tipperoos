import { describe, expect, it } from "vitest";
import { type BandKey } from "./rules";
import {
  bandMemberOrder,
  bandPosition,
  type BandCounts,
  type BoardState,
  championWasNamed,
  countRead,
  countsOf,
  demotePlaced,
  fillTone,
  firstIncorrectlyFilledBand,
  nextOutTeam,
  nextUnfilledBand,
  planTapRequests,
  planUndoRequests,
  resolveTapOutcome,
  rosterOrder,
  startAgain,
  tapWithEviction,
  type TapSnapshot,
} from "./board";

const empty: BoardState = { assignments: {}, previous: {} };

// Test-side constructor for the branded BandCounts shape -- countsOf is the
// only production constructor, but tests want to write literals.
function bandCounts(counts: Partial<Record<BandKey, number>>): BandCounts {
  return counts as BandCounts;
}

// A Band can never exceed its target. Tapping a club into a full Band
// swaps it in for that Band's "next out" club -- last in, first out --
// which returns to the roster.
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

  it("never over-fills via toggle-revert into a Band that refilled meanwhile", () => {
    // The capacity rule has to hold on the revert path too, or the headline
    // invariant is breakable: move a club out of a full Band, refill that
    // Band, then toggle the club back. Europe holds 3; `a` leaves for
    // Champion; `d` takes the free slot; toggling `a` must not make it 4.
    let state: {
      assignments: Record<string, BandKey>;
      previous: Record<string, BandKey | null>;
      placedAt: Record<string, number>;
    } = {
      assignments: { a: "europe", b: "europe", c: "europe" },
      previous: {},
      placedAt: { a: 0, b: 1, c: 2 },
    };
    const step = (
      teamId: string,
      band: BandKey,
      target: number,
      seq: number,
    ) => {
      const result = tapWithEviction(state, teamId, band, target, seq);
      state = {
        assignments: result.assignments,
        previous: result.previous,
        placedAt: result.placedAt,
      };
      return result;
    };

    step("a", "champion", 1, 3);
    step("d", "europe", 3, 4);
    const reverted = step("a", "champion", 1, 5);

    expect(
      Object.values(reverted.assignments).filter((band) => band === "europe"),
    ).toHaveLength(3);
    // No room to go back to, so it returns to the roster rather than
    // evicting a third club the player was never warned about.
    expect(reverted.assignments.a).toBeUndefined();
    expect(reverted.evicted).toBeNull();
  });

  it("still toggle-reverts into the old Band when it kept its free slot", () => {
    const state = {
      assignments: { a: "champion", b: "europe" } as Record<string, BandKey>,
      previous: { a: "europe" as BandKey },
      placedAt: { a: 1, b: 0 },
    };
    const result = tapWithEviction(state, "a", "champion", 1, 2);
    expect(result.assignments.a).toBe("europe");
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

// The flow-level wiring around a tap: which HTTP requests it implies
// (planTapRequests), and what the board shows once those requests settle
// (resolveTapOutcome). PredictTableFlow's persistTap is built from exactly
// these two functions, so testing them pins the two things that were only
// checkable by reading the component before: an eviction fires both an
// assign and an unassign, and a failed save rolls the whole tap back.
describe("planTapRequests", () => {
  it("plans a single assign for a plain placement, no eviction", () => {
    const result = {
      assignments: { arsenal: "europe" } as Record<string, BandKey>,
      evicted: null,
    };
    expect(planTapRequests("arsenal", result)).toEqual([
      { teamId: "arsenal", band: "europe" },
    ]);
  });

  it("plans an unassign for a toggle-revert to unplaced", () => {
    const result = { assignments: {}, evicted: null };
    expect(planTapRequests("arsenal", result)).toEqual([
      { teamId: "arsenal", band: null },
    ]);
  });

  it("plans BOTH an assign for the tapped club and an unassign for the evicted club", () => {
    const result = {
      assignments: { chelsea: "champion" } as Record<string, BandKey>,
      evicted: { teamId: "arsenal", from: "champion" as BandKey },
    };
    expect(planTapRequests("chelsea", result)).toEqual([
      { teamId: "chelsea", band: "champion" },
      { teamId: "arsenal", band: null },
    ]);
  });
});

describe("resolveTapOutcome", () => {
  const before = {
    assignments: { arsenal: "champion" } as Record<string, BandKey>,
    previous: {},
    placedAt: { arsenal: 0 },
  };
  const afterEviction = {
    assignments: { chelsea: "champion" } as Record<string, BandKey>,
    previous: { chelsea: null, arsenal: "champion" as BandKey },
    placedAt: { chelsea: 1 },
  };

  it("keeps the tap's result when every request succeeded", () => {
    expect(resolveTapOutcome(before, afterEviction, true)).toEqual(
      afterEviction,
    );
  });

  it("rolls the board back to its pre-tap state when a request failed -- an eviction's two requests are all-or-nothing, never half-applied", () => {
    expect(resolveTapOutcome(before, afterEviction, false)).toEqual(before);
  });
});

// The undo affordance replays a *snapshot* taken before the tap, not an
// inverse move -- see planUndoRequests's docstring for why dropInto-style
// replay is illegal for an eviction (the vacated Band is full again by the
// time undo runs). These tests pin that both the tapped and the evicted
// club come back, from the snapshot's recorded Bands.
describe("planUndoRequests", () => {
  it("restores a plain move to its pre-tap Band", () => {
    const snapshot: TapSnapshot = {
      assignments: { arsenal: "europe" },
      previous: {},
      placedAt: { arsenal: 0 },
      teamIds: ["arsenal"],
    };
    expect(planUndoRequests(snapshot)).toEqual([
      { teamId: "arsenal", band: "europe" },
    ]);
  });

  it("restores BOTH clubs from an eviction -- the evicted club back to its Band, the tapped club back to unplaced", () => {
    // Pre-tap snapshot: arsenal held champion (the only slot), chelsea was
    // unplaced. The tap put chelsea in and evicted arsenal.
    const snapshot: TapSnapshot = {
      assignments: { arsenal: "champion" },
      previous: {},
      placedAt: { arsenal: 0 },
      teamIds: ["chelsea", "arsenal"],
    };
    expect(planUndoRequests(snapshot)).toEqual([
      { teamId: "chelsea", band: null },
      { teamId: "arsenal", band: "champion" },
    ]);
  });

  it("reads the target Band from the snapshot, not from a live re-tap -- so undo works even though champion is full again at the moment undo runs", () => {
    // If undo tried to replay an inverse tap (tapWithEviction(state,
    // "arsenal", "champion", ...)) instead, it would itself trigger a
    // second eviction, since chelsea currently occupies champion's one
    // slot. planUndoRequests never calls tapWithEviction -- it just reads
    // snapshot.assignments -- so this can't happen.
    const liveState = {
      assignments: { chelsea: "champion" } as Record<string, BandKey>,
      previous: { chelsea: null as BandKey | null },
      placedAt: { chelsea: 1 },
    };
    const snapshot: TapSnapshot = {
      assignments: { arsenal: "champion" },
      previous: {},
      placedAt: { arsenal: 0 },
      teamIds: ["chelsea", "arsenal"],
    };
    const requests = planUndoRequests(snapshot);
    // Both requests are plain assign/unassign calls, independent of
    // `liveState` -- nothing about the live board's current occupancy
    // changes what gets requested.
    expect(requests).toEqual([
      { teamId: "chelsea", band: null },
      { teamId: "arsenal", band: "champion" },
    ]);
    expect(liveState.assignments.chelsea).toBe("champion");
  });
});

// Order inside a Band is alphabetical and carries no meaning -- see
// bandMemberOrder for why a stack under a "3-5" badge would otherwise
// assert a ranking this feature never records or scores.
describe("bandMemberOrder", () => {
  const clubs = [
    { displayName: "Man United" },
    { displayName: "Aston Villa" },
    { displayName: "Liverpool" },
  ];

  it("lists a Band's members alphabetically, not in the order they were placed", () => {
    expect(bandMemberOrder(clubs).map((c) => c.displayName)).toEqual([
      "Aston Villa",
      "Liverpool",
      "Man United",
    ]);
  });

  it("does not mutate the input", () => {
    const input = [...clubs];
    bandMemberOrder(input);
    expect(input.map((c) => c.displayName)).toEqual([
      "Man United",
      "Aston Villa",
      "Liverpool",
    ]);
  });

  it("is stable for a single member and an empty Band", () => {
    expect(bandMemberOrder([{ displayName: "Arsenal" }])).toEqual([
      { displayName: "Arsenal" },
    ]);
    expect(bandMemberOrder([])).toEqual([]);
  });
});

// Already-placed clubs sink to the bottom of the roster, but the re-group
// is deferred to a Band change -- these tests pin the grouping, and
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

  // PredictTableFlow's `handleOpenBand` is the *only* call site for
  // demotePlaced -- a plain tap never calls it. These tests model that
  // exact two-entry-point contract (a "tap" step that only ever touches
  // assignments/previous/placedAt, and an "open a Band" step that's the
  // sole thing allowed to call demotePlaced) to pin the ordering guarantee
  // without needing to render PredictTableFlow itself: a roster grouping
  // captured before a run of taps must still equal what demotePlaced would
  // return for the assignments *at capture time*, not for whatever the taps
  // moved on to since.
  it("stays frozen across a run of taps, and only reflects new placements once re-grouped", () => {
    const teams = roster.map((t) => ({ ...t }));

    // Snapshot at the start: nothing placed, so grouping is a no-op.
    let demoted = demotePlaced(teams, {});
    const capturedAtStart = demoted.ordered.map((t) => t.id);

    // Two taps land, exactly as handleTeamTap would apply them --
    // `demoted` is deliberately never touched here, mirroring the real
    // component only ever calling demotePlaced from handleOpenBand.
    let state = { assignments: {}, previous: {}, placedAt: {} };
    state = { ...state, ...tapWithEviction(state, "b", "champion", 1, 0) };
    state = { ...state, ...tapWithEviction(state, "d", "europe", 3, 1) };

    // The grouping captured before the taps is untouched by them -- this
    // is the guarantee the "never on a tap" rule buys.
    expect(demoted.ordered.map((t) => t.id)).toEqual(capturedAtStart);

    // Only a simulated "open a Band" step (the sole caller of demotePlaced
    // in the real component) advances the grouping to match.
    demoted = demotePlaced(teams, state.assignments);
    expect(demoted.ordered.map((t) => t.id)).toEqual(["a", "c", "e", "b", "d"]);
    expect(demoted.demotedFrom).toBe(3);
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
