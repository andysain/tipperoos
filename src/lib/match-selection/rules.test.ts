import { describe, expect, it } from "vitest";
import {
  PROMOTED_CLUB_SENTINEL_POSITION,
  chooseRankSource,
  selectMatch2,
  selectTopMatchup,
  type ClubPlayedCount,
  type ClubPosition,
  type SelectionFixture,
} from "./rules";

// Golden values hand-derived from docs/adr/0006-auto-selected-tipped-matches.md
// -> "Decision" -> "Match 1 — the top-ranked matchup" and "Rank source, by
// phase". Team ids below are plain strings standing in for club uuids --
// this module never touches the database.

function fixture(
  id: string,
  teamAId: string,
  teamBId: string,
  kickoffTime: string,
  providerMatchId: string,
): SelectionFixture {
  return {
    id,
    teamAId,
    teamBId,
    kickoffTime: new Date(kickoffTime),
    providerMatchId,
  };
}

function pos(teamId: string, position: number | null): ClubPosition {
  return { teamId, position };
}

function played(teamId: string, played: number): ClubPlayedCount {
  return { teamId, played };
}

describe("selectTopMatchup", () => {
  it("picks the fixture with the lowest average league position", () => {
    const fixtures = [
      fixture("m1", "arsenal", "villa", "2026-08-15T14:00:00Z", "100"),
      fixture("m2", "wolves", "burnley", "2026-08-15T14:00:00Z", "101"),
    ];
    const positions = [
      pos("arsenal", 1),
      pos("villa", 4),
      pos("wolves", 15),
      pos("burnley", 18),
    ];

    const result = selectTopMatchup({
      fixtures,
      positions,
      previousMatch1TeamIds: [],
    });

    expect(fixtures.length).toBe(2);
    expect(result?.id).toBe("m1");
  });

  it("breaks a tie on average position by the matchup containing the single highest-ranked club", () => {
    // arsenal(1)+villa(9) avg 5; city(3)+everton(7) avg 5 -- city(3) beats arsenal(1)? No:
    // lowest position number = highest rank, so arsenal(1) is the single highest-ranked
    // club overall and its matchup should win the tie.
    const fixtures = [
      fixture("m1", "arsenal", "villa", "2026-08-15T14:00:00Z", "100"),
      fixture("m2", "city", "everton", "2026-08-15T14:00:00Z", "101"),
    ];
    const positions = [
      pos("arsenal", 1),
      pos("villa", 9),
      pos("city", 3),
      pos("everton", 7),
    ];

    const result = selectTopMatchup({
      fixtures,
      positions,
      previousMatch1TeamIds: [],
    });

    expect(positions[0].position).toBe(1);
    expect(positions[2].position).toBe(3);
    expect(result?.id).toBe("m1");
  });

  it("falls through to the deterministic final tiebreak (earliest kickoff) when both averages and best-club tie", () => {
    // arsenal(1)+villa(9) avg 5, best club position 1
    // spurs(1)+forest(9) avg 5, best club position 1 -- identical on both prior stages
    const fixtures = [
      fixture("m2", "spurs", "forest", "2026-08-15T16:00:00Z", "200"),
      fixture("m1", "arsenal", "villa", "2026-08-15T12:00:00Z", "100"),
    ];
    const positions = [
      pos("arsenal", 1),
      pos("villa", 9),
      pos("spurs", 1),
      pos("forest", 9),
    ];

    const result = selectTopMatchup({
      fixtures,
      positions,
      previousMatch1TeamIds: [],
    });

    expect(fixtures.length).toBe(2);
    expect(result?.id).toBe("m1");
  });

  it("falls through to provider_match_id, compared numerically, when kickoff times also tie", () => {
    // "99" < "100" numerically but not lexicographically -- this proves the
    // tiebreak isn't comparing provider_match_id as a plain string.
    const fixtures = [
      fixture("m2", "spurs", "forest", "2026-08-15T12:00:00Z", "100"),
      fixture("m1", "arsenal", "villa", "2026-08-15T12:00:00Z", "99"),
    ];
    const positions = [
      pos("arsenal", 1),
      pos("villa", 9),
      pos("spurs", 1),
      pos("forest", 9),
    ];

    const result = selectTopMatchup({
      fixtures,
      positions,
      previousMatch1TeamIds: [],
    });

    expect(result?.id).toBe("m1");
  });

  it("treats a promoted club (no previous-season position) as position 21", () => {
    const fixtures = [
      // sunderland promoted -- (21 + 10) / 2 = 15.5, worse than city's matchup
      fixture("m1", "sunderland", "brentford", "2026-08-15T14:00:00Z", "100"),
      fixture("m2", "city", "fulham", "2026-08-15T14:00:00Z", "101"),
    ];
    const positions = [
      pos("sunderland", null),
      pos("brentford", 10),
      pos("city", 2),
      pos("fulham", 12),
    ];

    const result = selectTopMatchup({
      fixtures,
      positions,
      previousMatch1TeamIds: [],
    });

    expect(result?.id).toBe("m2");
    expect(PROMOTED_CLUB_SENTINEL_POSITION).toBe(21);
  });

  it("excludes any club that appeared in the previous gameweek's Match 1", () => {
    const fixtures = [
      // arsenal+villa is the best matchup on paper but arsenal played last week's Match 1
      fixture("m1", "arsenal", "villa", "2026-08-15T14:00:00Z", "100"),
      fixture("m2", "city", "fulham", "2026-08-15T14:00:00Z", "101"),
    ];
    const positions = [
      pos("arsenal", 1),
      pos("villa", 2),
      pos("city", 3),
      pos("fulham", 4),
    ];

    const result = selectTopMatchup({
      fixtures,
      positions,
      previousMatch1TeamIds: ["arsenal"],
    });

    expect(result?.id).toBe("m2");
  });

  it("falls back to the unexcluded pool when exclusion would empty it (degenerate case)", () => {
    const fixtures = [
      fixture("m1", "arsenal", "villa", "2026-08-15T14:00:00Z", "100"),
    ];
    const positions = [pos("arsenal", 1), pos("villa", 2)];

    const result = selectTopMatchup({
      fixtures,
      positions,
      previousMatch1TeamIds: ["arsenal", "villa"],
    });

    expect(fixtures.length).toBe(1);
    expect(result?.id).toBe("m1");
  });

  it("returns null when there are no fixtures to choose from", () => {
    const result = selectTopMatchup({
      fixtures: [],
      positions: [],
      previousMatch1TeamIds: [],
    });

    expect(result).toBe(null);
  });

  it("is deterministic: the same inputs always produce the same winner, regardless of pool order", () => {
    const fixtures = [
      fixture("m1", "arsenal", "villa", "2026-08-15T14:00:00Z", "100"),
      fixture("m2", "wolves", "burnley", "2026-08-15T14:00:00Z", "101"),
      fixture("m3", "city", "everton", "2026-08-15T14:00:00Z", "102"),
    ];
    const positions = [
      pos("arsenal", 1),
      pos("villa", 4),
      pos("wolves", 15),
      pos("burnley", 18),
      pos("city", 3),
      pos("everton", 7),
    ];

    const forward = selectTopMatchup({
      fixtures,
      positions,
      previousMatch1TeamIds: [],
    });
    const reversed = selectTopMatchup({
      fixtures: [...fixtures].reverse(),
      positions,
      previousMatch1TeamIds: [],
    });

    expect(forward?.id).toBe(reversed?.id);
    expect(forward?.id).toBe("m1");
  });
});

// Returns a `random` stub that yields the given sequence in order, one call
// per draw -- lets a test pin exactly which pool index selectMatch2 lands on
// without depending on Math.random.
function stubRandom(...sequence: readonly number[]): () => number {
  let i = 0;
  return () => {
    const value = sequence[i];
    i += 1;
    return value;
  };
}

describe("selectMatch2", () => {
  const now = new Date("2026-08-15T00:00:00Z");

  it("draws the fixture at the index implied by a stubbed random value", () => {
    const fixtures = [
      fixture("m1", "arsenal", "villa", "2026-08-15T14:00:00Z", "100"),
      fixture("m2", "wolves", "burnley", "2026-08-15T14:00:00Z", "101"),
      fixture("m3", "city", "everton", "2026-08-15T14:00:00Z", "102"),
    ];

    const result = selectMatch2({
      fixtures,
      match1FixtureId: "m1",
      now,
      random: stubRandom(0.5),
    });

    // pool after excluding m1 is [m2, m3]; floor(0.5 * 2) = 1 -> m3
    expect(fixtures.length).toBe(3);
    expect(result?.id).toBe("m3");
  });

  it("excludes the Match 1 fixture id from the pool", () => {
    const fixtures = [
      fixture("m1", "arsenal", "villa", "2026-08-15T14:00:00Z", "100"),
      fixture("m2", "wolves", "burnley", "2026-08-15T14:00:00Z", "101"),
    ];

    const result = selectMatch2({
      fixtures,
      match1FixtureId: "m1",
      now,
      random: stubRandom(0),
    });

    expect(result?.id).toBe("m2");
  });

  it("excludes a fixture that has already kicked off", () => {
    const fixtures = [
      // already kicked off relative to `now`
      fixture("m1", "arsenal", "villa", "2026-08-14T10:00:00Z", "100"),
      fixture("m2", "wolves", "burnley", "2026-08-15T14:00:00Z", "101"),
    ];

    const result = selectMatch2({
      fixtures,
      match1FixtureId: null,
      now,
      random: stubRandom(0),
    });

    expect(result?.id).toBe("m2");
  });

  it("treats a fixture kicking off at exactly `now` as already kicked off", () => {
    const fixtures = [
      fixture("m1", "arsenal", "villa", "2026-08-15T00:00:00Z", "100"),
      fixture("m2", "wolves", "burnley", "2026-08-15T14:00:00Z", "101"),
    ];

    const result = selectMatch2({
      fixtures,
      match1FixtureId: null,
      now,
      random: stubRandom(0),
    });

    expect(result?.id).toBe("m2");
  });

  it("applies both exclusions together", () => {
    const fixtures = [
      fixture("m1", "arsenal", "villa", "2026-08-15T14:00:00Z", "100"),
      fixture("m2", "wolves", "burnley", "2026-08-14T10:00:00Z", "101"),
      fixture("m3", "city", "everton", "2026-08-15T16:00:00Z", "102"),
    ];

    const result = selectMatch2({
      fixtures,
      match1FixtureId: "m1",
      now,
      random: stubRandom(0),
    });

    expect(fixtures.length).toBe(3);
    expect(result?.id).toBe("m3");
  });

  it("returns null when the only fixture is Match 1", () => {
    const fixtures = [
      fixture("m1", "arsenal", "villa", "2026-08-15T14:00:00Z", "100"),
    ];

    const result = selectMatch2({
      fixtures,
      match1FixtureId: "m1",
      now,
      random: stubRandom(0),
    });

    expect(result).toBe(null);
  });

  it("returns null when every remaining fixture has already kicked off", () => {
    const fixtures = [
      fixture("m1", "arsenal", "villa", "2026-08-15T14:00:00Z", "100"),
      fixture("m2", "wolves", "burnley", "2026-08-14T10:00:00Z", "101"),
    ];

    const result = selectMatch2({
      fixtures,
      match1FixtureId: "m1",
      now,
      random: stubRandom(0),
    });

    expect(result).toBe(null);
  });

  it("returns null on an empty fixture pool", () => {
    const result = selectMatch2({
      fixtures: [],
      match1FixtureId: null,
      now,
      random: stubRandom(0),
    });

    expect(result).toBe(null);
  });

  it("is uniform: every pool member is reachable, each at the position its stubbed draw implies", () => {
    const fixtures = [
      fixture("m1", "arsenal", "villa", "2026-08-15T14:00:00Z", "100"),
      fixture("m2", "wolves", "burnley", "2026-08-15T14:00:00Z", "101"),
      fixture("m3", "city", "everton", "2026-08-15T14:00:00Z", "102"),
      fixture("m4", "spurs", "forest", "2026-08-15T14:00:00Z", "103"),
    ];

    // Draw indices 0, 1, 2, 3 of a 4-fixture pool via evenly spaced [0, 1)
    // values -- every pool member must be reachable, not just the first/last.
    const draws = [0, 0.25, 0.5, 0.75].map((value) =>
      selectMatch2({
        fixtures,
        match1FixtureId: null,
        now,
        random: stubRandom(value),
      }),
    );

    expect(draws.map((d) => d?.id)).toEqual(["m1", "m2", "m3", "m4"]);
  });

  it("defaults to Math.random when no generator is provided", () => {
    const fixtures = [
      fixture("m1", "arsenal", "villa", "2026-08-15T14:00:00Z", "100"),
    ];

    const result = selectMatch2({
      fixtures,
      match1FixtureId: null,
      now,
    });

    expect(result?.id).toBe("m1");
  });
});

describe("chooseRankSource", () => {
  it("uses last season's table while any club has played fewer than 10 matches", () => {
    const result = chooseRankSource({
      playedCounts: [
        played("arsenal", 9),
        played("villa", 10),
        played("city", 10),
      ],
      liveStandingsAvailable: true,
    });

    expect(result).toBe("previous_season");
  });

  it("switches to live standings once every club has played exactly 10", () => {
    const result = chooseRankSource({
      playedCounts: [
        played("arsenal", 10),
        played("villa", 10),
        played("city", 10),
      ],
      liveStandingsAvailable: true,
    });

    expect(result).toBe("live");
  });

  it("stays on live standings once every club has played more than 10", () => {
    const result = chooseRankSource({
      playedCounts: [
        played("arsenal", 11),
        played("villa", 14),
        played("city", 12),
      ],
      liveStandingsAvailable: true,
    });

    expect(result).toBe("live");
  });

  it("falls back to last season's table when live standings are stale or unavailable, even past the threshold", () => {
    const result = chooseRankSource({
      playedCounts: [
        played("arsenal", 12),
        played("villa", 15),
        played("city", 10),
      ],
      liveStandingsAvailable: false,
    });

    expect(result).toBe("previous_season");
  });

  it("uses last season's table when no played counts are known yet (season not started)", () => {
    const result = chooseRankSource({
      playedCounts: [],
      liveStandingsAvailable: true,
    });

    expect(result).toBe("previous_season");
  });
});
