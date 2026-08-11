import { describe, expect, it } from "vitest";
import {
  type BoardState,
  countRead,
  dropInto,
  fillTone,
  modeFor,
  rosterOrder,
  startAgain,
  tapWhileFilling,
} from "./board";

const empty: BoardState = { assignments: {}, previous: {} };

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
