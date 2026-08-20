import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadStandingsSnapshotInputs } from "./load-snapshot-inputs";

// Golden values hand-derived per issue #23's D2: gameweeks.match_1_id/
// match_2_id are the only link from a gameweek to its matches (no
// matches.gameweek_id column); a Skipped Slot's null match id contributes
// nothing; the roster and its scores are scoped to one competition, never
// trusting match_id alone (src/lib/competitions/scope.ts's convention).

interface Row {
  [key: string]: unknown;
}

function filterable(rows: Row[]): {
  eq: (col: string, val: unknown) => ReturnType<typeof filterable>;
  lte: (col: string, val: number) => ReturnType<typeof filterable>;
  in: (col: string, vals: readonly unknown[]) => ReturnType<typeof filterable>;
  then: (resolve: (result: { data: Row[]; error: null }) => void) => void;
} {
  return {
    eq: (col, val) => filterable(rows.filter((r) => r[col] === val)),
    lte: (col, val) =>
      filterable(rows.filter((r) => (r[col] as number) <= val)),
    in: (col, vals) => filterable(rows.filter((r) => vals.includes(r[col]))),
    then: (resolve) => resolve({ data: rows, error: null }),
  };
}

function fakeSupabase(tables: {
  players: Row[];
  gameweeks: Row[];
  scores: Row[];
}) {
  return {
    from: (table: keyof typeof tables) => ({
      select: (_cols: string) => filterable(tables[table]),
    }),
    // Mirrors score_totals_for_matches (issue #182): group scores by
    // player_id, restricted to the asked-for player and match ids -- the
    // same filtering `.in()`/`.in()` did before the query moved into SQL.
    rpc: (
      fn: string,
      args: { p_player_ids: string[]; p_match_ids: string[] },
    ) => {
      if (fn !== "score_totals_for_matches") {
        return Promise.resolve({
          data: null,
          error: new Error(`unexpected rpc: ${fn}`),
        });
      }
      const totals = new Map<string, number>();
      for (const row of tables.scores) {
        const playerId = row.player_id as string;
        const matchId = row.match_id as string;
        if (
          !args.p_player_ids.includes(playerId) ||
          !args.p_match_ids.includes(matchId)
        ) {
          continue;
        }
        totals.set(
          playerId,
          (totals.get(playerId) ?? 0) + (row.points as number),
        );
      }
      const data = [...totals.entries()].map(([player_id, points]) => ({
        player_id,
        points,
      }));
      return Promise.resolve({ data, error: null });
    },
  } as unknown as SupabaseClient;
}

const COMPETITION = "comp-1";
const SEASON = "season-1";

describe("loadStandingsSnapshotInputs", () => {
  it("scopes the roster to this competition only", async () => {
    const supabase = fakeSupabase({
      players: [
        { id: "alice", competition_id: COMPETITION },
        { id: "other-comp-player", competition_id: "comp-2" },
      ],
      gameweeks: [],
      scores: [],
    });

    const result = await loadStandingsSnapshotInputs(
      supabase,
      COMPETITION,
      SEASON,
      1,
    );

    expect(result.players.length).toBe(1);
    expect(result.players[0].playerId).toBe("alice");
  });

  it("resolves gameweek_score rows to just the target gameweek's two matches", async () => {
    const supabase = fakeSupabase({
      players: [{ id: "alice", competition_id: COMPETITION }],
      gameweeks: [
        {
          number: 1,
          match_1_id: "m1",
          match_2_id: "m2",
          competition_id: COMPETITION,
          season_id: SEASON,
        },
        {
          number: 2,
          match_1_id: "m3",
          match_2_id: "m4",
          competition_id: COMPETITION,
          season_id: SEASON,
        },
      ],
      scores: [
        { player_id: "alice", match_id: "m1", points: 3 },
        { player_id: "alice", match_id: "m2", points: 4 },
        { player_id: "alice", match_id: "m3", points: 7 },
      ],
    });

    const result = await loadStandingsSnapshotInputs(
      supabase,
      COMPETITION,
      SEASON,
      1,
    );

    expect(result.gameweekScoreRows.length).toBe(2);
    const total = result.gameweekScoreRows.reduce(
      (sum, r) => sum + r.points,
      0,
    );
    expect(total).toBe(7);
  });

  it("resolves season rows cumulatively across every gameweek up to and including the target", async () => {
    const supabase = fakeSupabase({
      players: [{ id: "alice", competition_id: COMPETITION }],
      gameweeks: [
        {
          number: 1,
          match_1_id: "m1",
          match_2_id: "m2",
          competition_id: COMPETITION,
          season_id: SEASON,
        },
        {
          number: 2,
          match_1_id: "m3",
          match_2_id: "m4",
          competition_id: COMPETITION,
          season_id: SEASON,
        },
      ],
      scores: [
        { player_id: "alice", match_id: "m1", points: 3 },
        { player_id: "alice", match_id: "m2", points: 4 },
        { player_id: "alice", match_id: "m3", points: 7 },
      ],
    });

    const result = await loadStandingsSnapshotInputs(
      supabase,
      COMPETITION,
      SEASON,
      2,
    );

    // Aggregated in SQL (issue #182): one row per player, not one row per
    // scored match -- alice's three matches (3+4+7) collapse to a single
    // 14-point row instead of three raw rows.
    expect(result.seasonScoreRows.length).toBe(1);
    const total = result.seasonScoreRows.reduce((sum, r) => sum + r.points, 0);
    expect(total).toBe(14);
  });

  it("excludes a Skipped Slot's null match id -- nothing to query, nothing contributed", async () => {
    const supabase = fakeSupabase({
      players: [{ id: "alice", competition_id: COMPETITION }],
      gameweeks: [
        {
          number: 1,
          match_1_id: "m1",
          match_2_id: null,
          competition_id: COMPETITION,
          season_id: SEASON,
        },
      ],
      scores: [{ player_id: "alice", match_id: "m1", points: 5 }],
    });

    const result = await loadStandingsSnapshotInputs(
      supabase,
      COMPETITION,
      SEASON,
      1,
    );

    expect(result.gameweekScoreRows.length).toBe(1);
    expect(result.gameweekScoreRows[0].points).toBe(5);
  });

  it("never includes a later gameweek's matches in the season cumulative", async () => {
    const supabase = fakeSupabase({
      players: [{ id: "alice", competition_id: COMPETITION }],
      gameweeks: [
        {
          number: 1,
          match_1_id: "m1",
          match_2_id: null,
          competition_id: COMPETITION,
          season_id: SEASON,
        },
        {
          number: 2,
          match_1_id: "m2",
          match_2_id: null,
          competition_id: COMPETITION,
          season_id: SEASON,
        },
      ],
      scores: [
        { player_id: "alice", match_id: "m1", points: 3 },
        { player_id: "alice", match_id: "m2", points: 100 },
      ],
    });

    const result = await loadStandingsSnapshotInputs(
      supabase,
      COMPETITION,
      SEASON,
      1,
    );

    expect(result.seasonScoreRows.length).toBe(1);
    expect(result.seasonScoreRows[0].points).toBe(3);
  });

  // Issue #182: the old seasonScoreRows query selected one raw `scores` row
  // per scored match per player, growing unbounded across a season. A full
  // season is ~76 gameweek slots; this proves the aggregate collapses that
  // to one row per player, not 76.
  it("returns one row per player for a full season's worth of gameweeks, not one row per match", async () => {
    const gameweekCount = 38;
    const gameweeks = Array.from({ length: gameweekCount }, (_, i) => ({
      number: i + 1,
      match_1_id: `m${i * 2 + 1}`,
      match_2_id: `m${i * 2 + 2}`,
      competition_id: COMPETITION,
      season_id: SEASON,
    }));
    const scores = gameweeks.flatMap((gw) => [
      { player_id: "alice", match_id: gw.match_1_id, points: 3 },
      { player_id: "alice", match_id: gw.match_2_id, points: 4 },
    ]);
    const supabase = fakeSupabase({
      players: [{ id: "alice", competition_id: COMPETITION }],
      gameweeks,
      scores,
    });

    const result = await loadStandingsSnapshotInputs(
      supabase,
      COMPETITION,
      SEASON,
      gameweekCount,
    );

    expect(result.seasonScoreRows.length).toBe(1);
    expect(result.seasonScoreRows[0].points).toBe(gameweekCount * (3 + 4));
  });

  it("returns empty inputs for a competition with no players, without erroring", async () => {
    const supabase = fakeSupabase({ players: [], gameweeks: [], scores: [] });

    const result = await loadStandingsSnapshotInputs(
      supabase,
      COMPETITION,
      SEASON,
      1,
    );

    expect(result.players.length).toBe(0);
    expect(result.gameweekScoreRows.length).toBe(0);
    expect(result.seasonScoreRows.length).toBe(0);
  });
});
