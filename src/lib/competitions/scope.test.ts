import { describe, expect, it } from "vitest";
import {
  foldCompetitionPicks,
  foldCompetitionScores,
  isMatchLocked,
  scoresForCompetition,
} from "./scope";

// Golden values hand-derived from CLAUDE.md:
// - Picks lock 5 minutes before kickoff ("Predictions").
// - Scoring is additive per match, upserted per (player_id, match_id)
//   ("Scoring — additive").
// - Late Joiners score 0 for gameweeks before they joined, with "no
//   special-case logic needed beyond 'no picks exist for those matches'"
//   ("Identity and auth" -> Late joiners).

describe("foldCompetitionScores", () => {
  const players = [
    {
      id: "p1",
      displayName: "Alice",
      emoji: "🦊",
      isBot: false,
      joinedAt: "2026-08-01T00:00:00Z",
    },
    {
      id: "p2",
      displayName: "Bot Bob",
      emoji: null,
      isBot: true,
      joinedAt: "2026-08-01T00:00:00Z",
    },
    {
      id: "p3",
      displayName: "Late Larry",
      emoji: null,
      isBot: false,
      joinedAt: "2026-10-01T00:00:00Z",
    },
  ];

  it("sums a player's points across multiple scored matches", () => {
    const rows = foldCompetitionScores(players, [
      { playerId: "p1", points: 9 },
      { playerId: "p1", points: 3 },
    ]);
    const alice = rows.find((r) => r.playerId === "p1")!;
    expect(alice.points).toBe(12);
    expect(alice.matchesScored).toBe(2);
  });

  it("includes a bot's points using the same fold as a human player", () => {
    const rows = foldCompetitionScores(players, [
      { playerId: "p2", points: 5 },
    ]);
    const bob = rows.find((r) => r.playerId === "p2")!;
    expect(bob.points).toBe(5);
    expect(bob.matchesScored).toBe(1);
  });

  it("gives a player with no score rows 0 points rather than omitting them (Late Joiner)", () => {
    const rows = foldCompetitionScores(players, [
      { playerId: "p1", points: 9 },
    ]);
    const larry = rows.find((r) => r.playerId === "p3")!;
    expect(larry.points).toBe(0);
    expect(larry.matchesScored).toBe(0);
    expect(rows.length).toBe(3);
  });

  it("counts a voided match's score row (writer zeroes it, but it's still a real scored match)", () => {
    const rows = foldCompetitionScores(players, [
      { playerId: "p1", points: 9 },
      { playerId: "p1", points: 0 }, // voided match, recompute already zeroed it
    ]);
    const alice = rows.find((r) => r.playerId === "p1")!;
    expect(alice.points).toBe(9);
    expect(alice.matchesScored).toBe(2);
  });
});

// Golden values hand-derived from CLAUDE.md -> Scoring and
// docs/adr/0009-match-scoring-formula-and-title-eligibility.md:
//
//   result 3 | goal difference 2 | each team score 1, only on a correct
//   result | Wrong Way Round 1, mutually exclusive with all of the above.
//
// Reachable per-match scores are therefore exactly {0, 1, 3, 4, 5, 7}, and
// each one is here with the outcome that produces it:
//
//   0  nothing right
//   1  Wrong Way Round (called 2-1, finished 1-2) -- result wrong
//   3  result only              (called 3-0, finished 1-0)
//   4  result + one team score  (called 2-0, finished 2-1)
//   5  result + goal difference (called 2-1, finished 3-2)
//   7  exact scoreline          (called 2-1, finished 2-1)
//
// so `exactTips` counts 7s and `correctResults` counts >= 3.
describe("foldCompetitionScores derived counts", () => {
  const solo = [
    {
      id: "p1",
      displayName: "Alice",
      emoji: "🦊",
      isBot: false,
      joinedAt: "2026-08-01T00:00:00Z",
    },
  ];

  const everyReachableScore = [0, 1, 3, 4, 5, 7].map((points) => ({
    playerId: "p1",
    points,
  }));

  it("counts one exact tip and four correct results across the whole reachable set", () => {
    const alice = foldCompetitionScores(solo, everyReachableScore)[0];
    expect(alice.matchesScored).toBe(6);
    expect(alice.points).toBe(20);
    expect(alice.exactTips).toBe(1);
    expect(alice.correctResults).toBe(4);
  });

  it("treats Wrong Way Round as neither exact nor a correct result", () => {
    const alice = foldCompetitionScores(solo, [
      { playerId: "p1", points: 1 },
    ])[0];
    expect(alice.exactTips).toBe(0);
    expect(alice.correctResults).toBe(0);
  });

  it("counts an exact scoreline as a correct result too, not instead of one", () => {
    const alice = foldCompetitionScores(solo, [
      { playerId: "p1", points: 7 },
      { playerId: "p1", points: 7 },
    ])[0];
    expect(alice.exactTips).toBe(2);
    expect(alice.correctResults).toBe(2);
  });

  it("counts a voided match (0) as neither", () => {
    const alice = foldCompetitionScores(solo, [
      { playerId: "p1", points: 0 },
      { playerId: "p1", points: 5 },
    ])[0];
    expect(alice.matchesScored).toBe(2);
    expect(alice.exactTips).toBe(0);
    expect(alice.correctResults).toBe(1);
  });

  it("gives a player with no score rows zero of both rather than omitting them", () => {
    const alice = foldCompetitionScores(solo, [])[0];
    expect(alice.exactTips).toBe(0);
    expect(alice.correctResults).toBe(0);
  });
});

describe("foldCompetitionPicks", () => {
  const players = [
    { id: "p1", displayName: "Alice", emoji: "🦊", isBot: false },
    { id: "p2", displayName: "Bot Bob", emoji: null, isBot: true },
    { id: "p3", displayName: "Nopick Nora", emoji: null, isBot: false },
  ];

  it("attaches a player's submitted pick", () => {
    const rows = foldCompetitionPicks(players, [
      { playerId: "p1", predHomeScore: 2, predAwayScore: 1 },
    ]);
    const alice = rows.find((r) => r.playerId === "p1")!;
    expect(alice.predHomeScore).toBe(2);
    expect(alice.predAwayScore).toBe(1);
  });

  it("includes a bot's pick alongside human players, no special-casing", () => {
    const rows = foldCompetitionPicks(players, [
      { playerId: "p2", predHomeScore: 1, predAwayScore: 1 },
    ]);
    const bob = rows.find((r) => r.playerId === "p2")!;
    expect(bob.predHomeScore).toBe(1);
    expect(bob.predAwayScore).toBe(1);
  });

  it("keeps a non-picker in the roster with null pick fields instead of dropping them", () => {
    const rows = foldCompetitionPicks(players, [
      { playerId: "p1", predHomeScore: 2, predAwayScore: 1 },
    ]);
    const nora = rows.find((r) => r.playerId === "p3")!;
    expect(nora.predHomeScore).toBe(null);
    expect(nora.predAwayScore).toBe(null);
    expect(rows.length).toBe(3);
  });
});

describe("isMatchLocked", () => {
  const kickoff = new Date("2026-08-15T15:00:00Z");

  it("is not locked more than 5 minutes before kickoff", () => {
    expect(isMatchLocked(kickoff, new Date("2026-08-15T14:54:00Z"))).toBe(
      false,
    );
  });

  it("is locked exactly 5 minutes before kickoff", () => {
    expect(isMatchLocked(kickoff, new Date("2026-08-15T14:55:00Z"))).toBe(true);
  });

  it("stays locked after kickoff", () => {
    expect(isMatchLocked(kickoff, new Date("2026-08-15T15:30:00Z"))).toBe(true);
  });
});

// The reason this module exists at all (issue #71, and
// docs/adr/0004-multi-competition-foundational-scope.md's sharpest
// finding): `scores` is keyed by match_id, and `matches` is deliberately
// global, so two competitions can legitimately tip the same real fixture.
// A read that isn't scoped to one competition silently blends their points.
//
// Where the boundary actually lives, established by mutation-testing these
// assertions (breaking the code on purpose to check the test notices):
//
//   `foldCompetitionScores` is ROSTER-driven -- it maps over the players
//   array and looks each player's score rows up by id. A foreign
//   competition's score rows therefore can't attach to one of this
//   competition's players, and can't appear as an extra row. So the single
//   point of failure is the `players` query's competition_id filter: drop
//   that and the other competition walks onto the leaderboard. The
//   `.in("player_id", ...)` filter on `scores` is defence-in-depth and a
//   smaller query, NOT the thing holding the boundary -- removing it alone
//   changes no output, which is why the first draft of this test passed
//   against deliberately broken code and had to be rewritten.
describe("scoresForCompetition competition scoping", () => {
  const COMP_A = "comp-a";
  const SHARED_MATCH = "match-shared";

  /**
   * Mock that honours `.eq()` and `.in()` rather than returning fixed rows,
   * so dropping a filter in the implementation actually changes the result.
   */
  function createFilteringSupabase() {
    const seen: { table: string; col: string; val: unknown }[] = [];
    const rows: Record<string, Record<string, unknown>[]> = {
      players: [
        {
          id: "a1",
          display_name: "Comp A One",
          emoji: "\u{1F98A}",
          is_bot: false,
          joined_at: "2026-08-01T00:00:00Z",
          competition_id: COMP_A,
        },
        {
          id: "b1",
          display_name: "Comp B One",
          emoji: "\u{1F427}",
          is_bot: false,
          joined_at: "2026-08-01T00:00:00Z",
          competition_id: "comp-b",
        },
      ],
      // Both competitions' players tipped the SAME global match.
      scores: [
        {
          player_id: "a1",
          points: 7,
          match_id: SHARED_MATCH,
          matches: { season_id: "season-1" },
        },
        {
          player_id: "b1",
          points: 3,
          match_id: SHARED_MATCH,
          matches: { season_id: "season-1" },
        },
      ],
    };

    const from = (table: string) => {
      let data = [...(rows[table] ?? [])];
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq(col: string, val: unknown) {
          seen.push({ table, col, val });
          const key = col.includes(".") ? col.split(".").pop()! : col;
          data = data.filter((row) =>
            key === "season_id"
              ? (row.matches as { season_id: string }).season_id === val
              : row[key] === val,
          );
          return builder;
        },
        in(col: string, vals: unknown[]) {
          seen.push({ table, col, val: vals });
          data = data.filter((row) => vals.includes(row[col]));
          return builder;
        },
        then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
          Promise.resolve({ data, error: null }).then(resolve),
      };
      return builder;
    };

    return { client: { from } as never, seen };
  }

  it("returns only the asked-for competition's players when both tip the same global match", async () => {
    const { client } = createFilteringSupabase();
    const result = await scoresForCompetition(client, COMP_A, "season-1");
    expect(result.length).toBe(1);
    expect(result[0].displayName).toBe("Comp A One");
    expect(result[0].points).toBe(7);
    expect(result[0].matchesScored).toBe(1);
    expect(result[0].exactTips).toBe(1);
  });

  it("scopes the roster read by competition_id -- the filter the boundary rests on", async () => {
    const { client, seen } = createFilteringSupabase();
    await scoresForCompetition(client, COMP_A, "season-1");
    expect(
      seen.some(
        (call) =>
          call.table === "players" &&
          call.col === "competition_id" &&
          call.val === COMP_A,
      ),
    ).toBe(true);
  });

  it("narrows the scores read to this competition's player ids, never match_id alone", async () => {
    const { client, seen } = createFilteringSupabase();
    await scoresForCompetition(client, COMP_A, "season-1");
    const playerFilter = seen.find(
      (call) => call.table === "scores" && call.col === "player_id",
    );
    expect(playerFilter).toBeDefined();
    expect(playerFilter!.val).toEqual(["a1"]);
  });

  it("scopes the scores read by season too, so two seasons never blend", async () => {
    const { client, seen } = createFilteringSupabase();
    await scoresForCompetition(client, COMP_A, "season-1");
    expect(
      seen.some(
        (call) =>
          call.table === "scores" &&
          call.col === "matches.season_id" &&
          call.val === "season-1",
      ),
    ).toBe(true);
  });
});
