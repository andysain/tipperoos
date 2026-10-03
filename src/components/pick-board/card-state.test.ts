import { describe, expect, it } from "vitest";
import { isLockedWithoutPick, resolveCardStateAt } from "./card-state";

describe("resolveCardStateAt", () => {
  it("leaves pre-lock states alone before the lock instant", () => {
    expect(resolveCardStateAt({ kind: "entry" }, false)).toEqual({
      kind: "entry",
    });
  });

  it("flips an unfiled card to locked with no pick", () => {
    expect(resolveCardStateAt({ kind: "entry" }, true)).toEqual({
      kind: "locked",
      ownHomeScore: null,
      ownAwayScore: null,
    });
  });

  it("flips a filed card to locked, keeping the pick", () => {
    expect(
      resolveCardStateAt(
        { kind: "filed", ownHomeScore: 2, ownAwayScore: 1 },
        true,
      ),
    ).toEqual({ kind: "locked", ownHomeScore: 2, ownAwayScore: 1 });
  });

  it("never touches a finished card", () => {
    const finished = {
      kind: "finished" as const,
      homeScore: 1,
      awayScore: 1,
      ownHomeScore: null,
      ownAwayScore: null,
      points: 0,
    };
    expect(resolveCardStateAt(finished, true)).toBe(finished);
  });
});

describe("isLockedWithoutPick", () => {
  it("is true for a locked card with no pick", () => {
    expect(
      isLockedWithoutPick({
        kind: "locked",
        ownHomeScore: null,
        ownAwayScore: null,
      }),
    ).toBe(true);
    expect(
      isLockedWithoutPick({ kind: "locked", ownHomeScore: 0, ownAwayScore: 0 }),
    ).toBe(false);
    expect(isLockedWithoutPick({ kind: "entry" })).toBe(false);
  });

  it("is also true for a live match with no pick", () => {
    expect(
      isLockedWithoutPick({
        kind: "live",
        homeScore: 1,
        awayScore: 0,
        ownHomeScore: null,
        ownAwayScore: null,
      }),
    ).toBe(true);
    expect(
      isLockedWithoutPick({
        kind: "live",
        homeScore: 1,
        awayScore: 0,
        ownHomeScore: 1,
        ownAwayScore: 0,
      }),
    ).toBe(false);
  });
});
