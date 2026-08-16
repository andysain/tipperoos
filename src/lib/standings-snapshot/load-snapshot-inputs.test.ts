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

    expect(result.seasonScoreRows.length).toBe(3);
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
