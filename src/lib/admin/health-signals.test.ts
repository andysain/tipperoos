import { describe, expect, it } from "vitest";
import {
  MATCH_SYNC_GREEN_WITHIN_MS,
  MATCH_SYNC_RED_AFTER_MS,
  MATCH_SYNC_THRESHOLDS,
  NEXT_GAMEWEEK_SELECTION_RED_WINDOW_MS,
  SEASON_GAMEWEEK_COUNT,
  STANDINGS_SYNC_GREEN_WITHIN_MS,
  STANDINGS_SYNC_RED_AFTER_MS,
  STANDINGS_SYNC_THRESHOLDS,
  lockedOutState,
  nextGameweekSelectionState,
  syncFreshnessState,
} from "./health-signals";

// Golden values are docs/admin-ui-spec.md §5's freshness table -- match sync
// green within 60 min / red after 6 h, standings green within 24 h / red
// after 72 h, and the "next gameweek selected" red window of 48 h before the
// first fixture. A wrong constant here means the admin never sees a stale
// sync, which means picks lock against a drifted kickoff -- the exact
// failure this surface exists to prevent, so the numbers get pinned
// literally (TESTING_STANDARD.md §1).

const T0 = new Date("2026-09-05T12:00:00.000Z");
const ago = (ms: number) => new Date(T0.getTime() - ms);
const fromNow = (ms: number) => new Date(T0.getTime() + ms);

describe("freshness thresholds (spec §5)", () => {
  it("pins the match-sync window: green ≤ 60 min, red > 6 h", () => {
    expect(MATCH_SYNC_GREEN_WITHIN_MS).toBe(3_600_000);
    expect(MATCH_SYNC_RED_AFTER_MS).toBe(21_600_000);
    expect(MATCH_SYNC_RED_AFTER_MS / MATCH_SYNC_GREEN_WITHIN_MS).toBe(6);
  });

  it("pins the standings-sync window: green ≤ 24 h, red > 72 h", () => {
    expect(STANDINGS_SYNC_GREEN_WITHIN_MS).toBe(86_400_000);
    expect(STANDINGS_SYNC_RED_AFTER_MS).toBe(259_200_000);
    expect(STANDINGS_SYNC_RED_AFTER_MS / STANDINGS_SYNC_GREEN_WITHIN_MS).toBe(
      3,
    );
  });

  it("pins the next-gameweek-selection red window at 48 h", () => {
    expect(NEXT_GAMEWEEK_SELECTION_RED_WINDOW_MS).toBe(172_800_000);
    expect(NEXT_GAMEWEEK_SELECTION_RED_WINDOW_MS / 3_600_000).toBe(48);
  });

  it("pins the season length at 38 gameweeks", () => {
    expect(SEASON_GAMEWEEK_COUNT).toBe(38);
  });

  it("exposes the same numbers on the grouped threshold objects", () => {
    expect(MATCH_SYNC_THRESHOLDS.greenWithinMs).toBe(3_600_000);
    expect(MATCH_SYNC_THRESHOLDS.redAfterMs).toBe(21_600_000);
    expect(STANDINGS_SYNC_THRESHOLDS.greenWithinMs).toBe(86_400_000);
    expect(STANDINGS_SYNC_THRESHOLDS.redAfterMs).toBe(259_200_000);
  });
});

describe("syncFreshnessState", () => {
  it("is red when there has never been a successful sync", () => {
    expect(syncFreshnessState(null, T0, MATCH_SYNC_THRESHOLDS)).toBe("red");
  });

  it("is green exactly on the green boundary and red exactly past the red one", () => {
    expect(
      syncFreshnessState(
        ago(MATCH_SYNC_GREEN_WITHIN_MS),
        T0,
        MATCH_SYNC_THRESHOLDS,
      ),
    ).toBe("green");
    expect(
      syncFreshnessState(
        ago(MATCH_SYNC_GREEN_WITHIN_MS + 1),
        T0,
        MATCH_SYNC_THRESHOLDS,
      ),
    ).toBe("amber");
    expect(
      syncFreshnessState(
        ago(MATCH_SYNC_RED_AFTER_MS),
        T0,
        MATCH_SYNC_THRESHOLDS,
      ),
    ).toBe("amber");
    expect(
      syncFreshnessState(
        ago(MATCH_SYNC_RED_AFTER_MS + 1),
        T0,
        MATCH_SYNC_THRESHOLDS,
      ),
    ).toBe("red");
  });

  it("treats a last-success instant in the future (clock skew) as green", () => {
    expect(
      syncFreshnessState(fromNow(60_000), T0, STANDINGS_SYNC_THRESHOLDS),
    ).toBe("green");
  });

  it("uses the standings window independently of the match window", () => {
    // 30 h old: amber for standings (green ≤ 24 h, red > 72 h)...
    expect(
      syncFreshnessState(ago(30 * 3_600_000), T0, STANDINGS_SYNC_THRESHOLDS),
    ).toBe("amber");
    // ...but that same age would be long red on the match window.
    expect(
      syncFreshnessState(ago(30 * 3_600_000), T0, MATCH_SYNC_THRESHOLDS),
    ).toBe("red");
  });
});

describe("nextGameweekSelectionState", () => {
  const base = {
    hasNextGameweek: true,
    match1Id: null,
    firstFixtureKickoff: null,
    now: T0,
  };

  it("is green when there is no next gameweek at all (end of season)", () => {
    expect(
      nextGameweekSelectionState({ ...base, hasNextGameweek: false }),
    ).toBe("green");
  });

  it("is green once Match 1 is chosen, whatever the kickoff distance", () => {
    expect(
      nextGameweekSelectionState({
        ...base,
        match1Id: "m1",
        firstFixtureKickoff: fromNow(3_600_000),
      }),
    ).toBe("green");
  });

  it("is amber when unselected and the first fixture is not yet scheduled", () => {
    expect(nextGameweekSelectionState(base)).toBe("amber");
  });

  it("is amber when unselected and the first fixture is more than 48 h away", () => {
    expect(
      nextGameweekSelectionState({
        ...base,
        firstFixtureKickoff: fromNow(
          NEXT_GAMEWEEK_SELECTION_RED_WINDOW_MS + 60_000,
        ),
      }),
    ).toBe("amber");
  });

  it("is red when unselected and the first fixture is inside 48 h or already past", () => {
    expect(
      nextGameweekSelectionState({
        ...base,
        firstFixtureKickoff: fromNow(NEXT_GAMEWEEK_SELECTION_RED_WINDOW_MS),
      }),
    ).toBe("red");
    expect(
      nextGameweekSelectionState({
        ...base,
        firstFixtureKickoff: ago(3_600_000),
      }),
    ).toBe("red");
  });
});

describe("lockedOutState", () => {
  it("is green with nobody locked and red with anyone locked", () => {
    expect(lockedOutState(0)).toBe("green");
    expect(lockedOutState(1)).toBe("red");
    expect(lockedOutState(4)).toBe("red");
  });
});
