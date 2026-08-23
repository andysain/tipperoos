import { describe, expect, it } from "vitest";
import type { CompetitionScoreTotal } from "./scope";
import {
  foldCompetitionPicks,
  isMatchLocked,
  mergeCompetitionScoreTotals,
  scoresForCompetition,
} from "./scope";

// Golden values hand-derived from CLAUDE.md:
// - Picks lock 5 minutes before kickoff ("Predictions").
// - Scoring is additive per match, upserted per (player_id, match_id)
//   ("Scoring — additive").
// - Late Joiners score 0 for gameweeks before they joined, with "no
//   special-case logic needed beyond 'no picks exist for those matches'"
//   ("Identity and auth" -> Late joiners).

describe("mergeCompetitionScoreTotals", () => {
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

  it("attaches a player's pre-aggregated total (summed in SQL, not folded here)", () => {
    const rows = mergeCompetitionScoreTotals(players, [
      {
        playerId: "p1",
        points: 12,
        matchesScored: 2,
        exactTips: 0,
        correctResults: 1,
      },
    ]);
    const alice = rows.find((r) => r.playerId === "p1")!;
    expect(alice.points).toBe(12);
    expect(alice.matchesScored).toBe(2);
  });

  it("includes a bot's total using the same merge as a human player", () => {
    const rows = mergeCompetitionScoreTotals(players, [
      {
        playerId: "p2",
        points: 5,
        matchesScored: 1,
        exactTips: 0,
        correctResults: 1,
      },
    ]);
    const bob = rows.find((r) => r.playerId === "p2")!;
    expect(bob.points).toBe(5);
    expect(bob.matchesScored).toBe(1);
  });

  it("gives a player with no total row 0 points rather than omitting them (Late Joiner)", () => {
    const rows = mergeCompetitionScoreTotals(players, [
      {
        playerId: "p1",
        points: 9,
        matchesScored: 1,
        exactTips: 1,
        correctResults: 1,
      },
    ]);
    const larry = rows.find((r) => r.playerId === "p3")!;
    expect(larry.points).toBe(0);
    expect(larry.matchesScored).toBe(0);
    expect(rows.length).toBe(3);
  });

  it("passes through exactTips/correctResults as computed by the SQL aggregate", () => {
    const rows = mergeCompetitionScoreTotals(players, [
      {
        playerId: "p1",
        points: 20,
        matchesScored: 6,
        exactTips: 1,
        correctResults: 4,
      },
    ]);
    const alice = rows.find((r) => r.playerId === "p1")!;
    expect(alice.exactTips).toBe(1);
    expect(alice.correctResults).toBe(4);
  });
});

// The {0, 1, 3, 4, 5, 7} reachable-score-set derivation that used to be
// golden-value pinned here (points = 7 <=> exact, points >= 3 <=> correct
// result) moved into the `competition_score_totals`/`score_totals_for_matches`
// SQL migration with issue #182 (supabase/migrations/20260818020000_score_totals_aggregate.sql),
// which carries the same reasoning in comment form. Not re-pinned by Vitest:
// this repo has no SQL test runner, and other RPC-backed business logic
// (e.g. `table_prediction_lock_status`) is likewise verified only at the
// caller boundary (mocking `.rpc()`), not by re-deriving the SQL's own
// arithmetic in TS.

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
// assertions (breaking the code on purpose to check the test notices), and
// unchanged by the move to a SQL aggregate (issue #182):
//
//   `mergeCompetitionScoreTotals` is ROSTER-driven -- it maps over the
//   players array and looks each player's total up by id. A foreign
//   competition's total therefore can't attach to one of this competition's
//   players, and can't appear as an extra row. So the single point of
//   failure is the `players` query's competition_id filter: drop that and
//   the other competition walks onto the leaderboard. The
//   `p_player_ids` argument to the `competition_score_totals` RPC call is
//   defence-in-depth and a smaller response, NOT the thing holding the
//   boundary -- removing it alone changes no output, the same finding the
//   pre-SQL-aggregate version of this test made against the raw
//   `.in("player_id", ...)` filter it replaced.
describe("scoresForCompetition competition scoping", () => {
  const COMP_A = "comp-a";

  /**
   * Mock that honours `.eq()` on `players` and filters the RPC response by
   * the args actually passed, rather than returning fixed rows, so dropping
   * a filter in the implementation actually changes the result.
   */
  function createFilteringSupabase() {
    const seen: { call: string; args: unknown }[] = [];
    const players: Record<string, unknown>[] = [
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
    ];
    // Both competitions' players tipped the SAME global match, in the same season.
    const totalsByPlayerId: Record<
      string,
      {
        player_id: string;
        points: number;
        matches_scored: number;
        exact_tips: number;
        correct_results: number;
      }
    > = {
      a1: {
        player_id: "a1",
        points: 7,
        matches_scored: 1,
        exact_tips: 1,
        correct_results: 1,
      },
      b1: {
        player_id: "b1",
        points: 3,
        matches_scored: 1,
        exact_tips: 0,
        correct_results: 1,
      },
    };

    const from = (table: string) => {
      let data = [...(table === "players" ? players : [])];
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq(col: string, val: unknown) {
          seen.push({ call: `${table}.eq.${col}`, args: val });
          data = data.filter((row) => row[col] === val);
          return builder;
        },
        then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
          Promise.resolve({ data, error: null }).then(resolve),
      };
      return builder;
    };

    const rpc = (
      fn: string,
      args: { p_player_ids: string[]; p_season_id: string },
    ) => {
      seen.push({ call: fn, args });
      const data =
        fn === "competition_score_totals" && args.p_season_id === "season-1"
          ? args.p_player_ids
              .filter((id) => id in totalsByPlayerId)
              .map((id) => totalsByPlayerId[id])
          : [];
      return Promise.resolve({ data, error: null });
    };

    return { client: { from, rpc } as never, seen };
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
          call.call === "players.eq.competition_id" && call.args === COMP_A,
      ),
    ).toBe(true);
  });

  it("narrows the score-totals RPC call to this competition's player ids, never match_id alone", async () => {
    const { client, seen } = createFilteringSupabase();
    await scoresForCompetition(client, COMP_A, "season-1");
    const rpcCall = seen.find(
      (call) => call.call === "competition_score_totals",
    ) as
      | { call: string; args: { p_player_ids: string[]; p_season_id: string } }
      | undefined;
    expect(rpcCall).toBeDefined();
    expect(rpcCall!.args.p_player_ids).toEqual(["a1"]);
  });

  it("scopes the score-totals RPC call by season too, so two seasons never blend", async () => {
    const { client, seen } = createFilteringSupabase();
    await scoresForCompetition(client, COMP_A, "season-1");
    const rpcCall = seen.find(
      (call) => call.call === "competition_score_totals",
    ) as
      | { call: string; args: { p_player_ids: string[]; p_season_id: string } }
      | undefined;
    expect(rpcCall!.args.p_season_id).toBe("season-1");
  });
});

// Issue #182: the old scoresForCompetition selected one raw `scores` row per
// scored match per player -- ~76 scored matches/season means the response
// crossed Supabase's configured 1,000-row cap (supabase/config.toml) at 14
// players, truncating silently with no `.order()` to make it deterministic.
// The SQL aggregate returns one row PER PLAYER, not per match, so response
// size is roster-bound regardless of season length -- this proves that
// structurally, not just by asserting the new query shape looks right.
describe("scoresForCompetition response size (issue #182)", () => {
  it("returns exactly one row per player even when a full season's worth of points is aggregated behind it", async () => {
    const rosterSize = 25; // above the 14-player crossing point the old query hit
    const players = Array.from({ length: rosterSize }, (_, i) => ({
      id: `p${i}`,
      display_name: `Player ${i}`,
      emoji: null,
      is_bot: false,
      joined_at: "2026-08-01T00:00:00Z",
    }));
    // Each total represents a full season's worth of scored matches (~76)
    // already summed server-side -- what the old query would have needed
    // ~76 raw rows per player to represent is now one row per player.
    const totals: CompetitionScoreTotal[] = players.map((p) => ({
      playerId: p.id,
      points: 76 * 3,
      matchesScored: 76,
      exactTips: 10,
      correctResults: 40,
    }));

    const client = {
      from: (table: string) => {
        if (table !== "players") throw new Error(`unexpected table: ${table}`);
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: () => builder,
          then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
            Promise.resolve({ data: players, error: null }).then(resolve),
        };
        return builder;
      },
      rpc: () =>
        Promise.resolve({
          data: totals.map((t) => ({
            player_id: t.playerId,
            points: t.points,
            matches_scored: t.matchesScored,
            exact_tips: t.exactTips,
            correct_results: t.correctResults,
          })),
          error: null,
        }),
    } as never;

    const result = await scoresForCompetition(client, "comp-a", "season-1");
    expect(result.length).toBe(rosterSize);
    expect(result.every((r) => r.matchesScored === 76)).toBe(true);
  });
});

// DST-transition golden values, hand-derived for issue #37 using the same
// IANA tzdata shifts already pinned in src/lib/dates/kickoff-format.test.ts:
//
//   UK BST->GMT 2026-10-25: clocks fall back at 02:00 BST, so the transition
//     instant is 2026-10-25T02:00:00+01:00 = 2026-10-25T01:00:00Z. The local
//     hour 01:00 then occurs twice; capturing the second (GMT) occurrence
//     with the stale BST offset attached (+01:00) would store it an hour
//     early (2026-10-25T00:00:00Z) — the issue's naive-local-time failure
//     mode — so the discriminating value is a kickoff at the true instant
//     while `now` crosses it.
//   Sydney AEST->AEDT 2026-10-04: clocks spring forward at 02:00 AEST, so
//     the transition instant is 2026-10-04T02:00:00+10:00 = 2026-10-03T16:00:00Z.
//
// Locking is pure epoch-millisecond math on the stored UTC instant, so the
// 5-minute window must land identically whether `now` falls on the pre- or
// post-transition side of either change.
describe("isMatchLocked across DST transitions", () => {
  const ukTransitionKickoff = new Date("2026-10-25T01:00:00Z");
  const sydneyTransitionKickoff = new Date("2026-10-03T16:00:00Z");

  it("UK: not locked at T-6min on the pre-transition side", () => {
    expect(
      isMatchLocked(ukTransitionKickoff, new Date("2026-10-25T00:54:00Z")),
    ).toBe(false);
  });

  it("UK: locks exactly at T-5min on the pre-transition side", () => {
    expect(
      isMatchLocked(ukTransitionKickoff, new Date("2026-10-25T00:55:00Z")),
    ).toBe(true);
  });

  it("UK: locked at kickoff, which is the transition instant itself", () => {
    expect(
      isMatchLocked(ukTransitionKickoff, new Date("2026-10-25T01:00:00Z")),
    ).toBe(true);
  });

  it("UK: stays locked post-kickoff on the post-transition side", () => {
    expect(
      isMatchLocked(ukTransitionKickoff, new Date("2026-10-25T01:30:00Z")),
    ).toBe(true);
  });

  it("Sydney: not locked at T-6min on the pre-transition side", () => {
    expect(
      isMatchLocked(sydneyTransitionKickoff, new Date("2026-10-03T15:54:00Z")),
    ).toBe(false);
  });

  it("Sydney: locks exactly at T-5min on the pre-transition side", () => {
    expect(
      isMatchLocked(sydneyTransitionKickoff, new Date("2026-10-03T15:55:00Z")),
    ).toBe(true);
  });

  it("Sydney: locked at kickoff, which is the transition instant itself", () => {
    expect(
      isMatchLocked(sydneyTransitionKickoff, new Date("2026-10-03T16:00:00Z")),
    ).toBe(true);
  });

  it("Sydney: stays locked post-kickoff on the post-transition side", () => {
    expect(
      isMatchLocked(sydneyTransitionKickoff, new Date("2026-10-03T16:30:00Z")),
    ).toBe(true);
  });
});
