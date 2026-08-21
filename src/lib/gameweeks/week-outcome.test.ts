import { describe, expect, it } from "vitest";
import { deriveWeekOutcome, type WeekEntry } from "./week-outcome";

const played = (points: number): WeekEntry => ({
  points,
  picked: true,
  calledOff: false,
});
const unplayed = (picked: boolean): WeekEntry => ({
  points: null,
  picked,
  calledOff: false,
});
const calledOff = (picked: boolean): WeekEntry => ({
  points: null,
  picked,
  calledOff: true,
});

describe("deriveWeekOutcome", () => {
  it("sums a fully played week", () => {
    expect(deriveWeekOutcome([played(7), played(3)])).toEqual({
      kind: "scored",
      total: 10,
      pending: false,
    });
  });

  // The two tipped matches routinely kick off a day apart.
  it("flags a half-played week as pending, with the partial total", () => {
    expect(deriveWeekOutcome([played(5), unplayed(true)])).toEqual({
      kind: "scored",
      total: 5,
      pending: true,
    });
  });

  it("a scored zero is 'scored', not 'no picks'", () => {
    expect(deriveWeekOutcome([played(0), played(0)])).toEqual({
      kind: "scored",
      total: 0,
      pending: false,
    });
  });

  // The bug this module exists to prevent: a week the player DID pick in,
  // reported back to them as a week they missed.
  it("a picked-but-unfinished week is 'not scored', never 'no picks'", () => {
    expect(deriveWeekOutcome([unplayed(true), unplayed(true)])).toEqual({
      kind: "not_scored",
    });
  });

  it("a called-off week is its own state, even though the player picked", () => {
    expect(deriveWeekOutcome([calledOff(true), calledOff(true)])).toEqual({
      kind: "called_off",
    });
  });

  it("only reports 'no picks' when nothing was filed", () => {
    expect(deriveWeekOutcome([unplayed(false), unplayed(false)])).toEqual({
      kind: "no_picks",
    });
  });

  it("a called-off match does not make a week pending", () => {
    expect(deriveWeekOutcome([played(4), calledOff(true)])).toEqual({
      kind: "scored",
      total: 4,
      pending: false,
    });
  });

  // The picks-record regression this module exists to prevent, at the shape
  // the call site actually produces: picksForPlayer blanks an UNLOCKED pick,
  // so a caller that derives `picked` from the blanked value reports false
  // for a week the player did file in. The guard is that such weeks never
  // reach here -- but if one does, "not scored" is the honest answer and
  // "no picks" is a false accusation.
  it("treats an unfiled-because-unlocked week as unscored, given the caller marks it so", () => {
    expect(
      deriveWeekOutcome([
        { points: null, picked: true, calledOff: false },
        { points: null, picked: false, calledOff: false },
      ]),
    ).toEqual({ kind: "not_scored" });
  });

  it("an empty week is not scored at zero", () => {
    expect(deriveWeekOutcome([])).toEqual({ kind: "no_picks" });
  });
});
