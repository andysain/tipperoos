import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Issue #157's "Done when": submitting/assigning/unassigning triggers a
// fresh cohort-wide recompute, not just a recompute of the mutating
// player's own score -- proven here by checking that a second player's
// Bold Call score moves too. `waitUntil` is mocked so the test can await
// the background work instead of racing it (in production it runs after
// the response ships; see the trigger's own doc comment for why).

let capturedWaitUntilPromise: Promise<unknown> | null = null;
vi.mock("@vercel/functions", () => ({
  waitUntil: (promise: Promise<unknown>) => {
    capturedWaitUntilPromise = promise;
  },
}));

const { scheduleCohortRecomputeForPlayer } = await import(
  "./predict-table-recompute-trigger"
);

interface Row {
  [key: string]: unknown;
}

function filterable(rows: Row[]): {
  eq: (col: string, val: unknown) => ReturnType<typeof filterable>;
  in: (col: string, vals: readonly unknown[]) => ReturnType<typeof filterable>;
  order: () => ReturnType<typeof filterable>;
  limit: (n: number) => ReturnType<typeof filterable>;
  maybeSingle: () => Promise<{ data: Row | null; error: null }>;
  then: (resolve: (result: { data: Row[]; error: null }) => void) => void;
} {
  return {
    eq: (col, val) => filterable(rows.filter((r) => r[col] === val)),
    in: (col, vals) => filterable(rows.filter((r) => vals.includes(r[col]))),
    order: () => filterable(rows),
    limit: (n) => filterable(rows.slice(0, n)),
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    then: (resolve) => resolve({ data: rows, error: null }),
  };
}

function fakeSupabase(seed: {
  seasons: Row[];
  matches: Row[];
  team_standings: Row[];
  players: Row[];
  table_predictions: Row[];
  table_prediction_ranks: Row[];
}) {
  const tables: Record<string, Row[]> = {
    ...seed,
    table_prediction_scores: [],
  };
  const client = {
    from: (table: string) => ({
      select: (_cols: string) => filterable(tables[table]),
      upsert: (rows: Row[], _options: { onConflict: string }) => {
        for (const row of rows) {
          const index = tables[table].findIndex(
            (r) => r.player_id === row.player_id,
          );
          if (index >= 0) tables[table][index] = { ...row };
          else tables[table].push({ ...row });
        }
        return Promise.resolve({ error: null });
      },
    }),
  } as unknown as SupabaseClient;
  return { client, tables };
}

const TEAM_IDS = Array.from({ length: 20 }, (_, i) => `t${i + 1}`);
// t1 = Champion, t2 = Runners Up, t3-5 = Champions League, rest irrelevant
// to this test's assertions.
const BAND_BY_INDEX = [
  "champion",
  "runners_up",
  "champions_league",
  "champions_league",
  "champions_league",
  "europe",
  "europe",
  "europe",
  "mid_table",
  "mid_table",
  "mid_table",
  "lower_table",
  "lower_table",
  "lower_table",
  "relegation_battle",
  "relegation_battle",
  "relegation_battle",
  "relegated",
  "relegated",
  "relegated",
];

function exactBands(): Row[] {
  return TEAM_IDS.map((teamId, index) => ({ team_id: teamId, band: BAND_BY_INDEX[index] }));
}

/**
 * Exact-match bands, except Champion is predicted for `championTeamId`
 * instead of the real Champion (`t1`) -- `t1` is dropped (left unplaced)
 * rather than also keeping its natural Band, so no team ends up assigned
 * to two Bands in the same prediction.
 */
function bandsWithChampionOverride(championTeamId: string): Row[] {
  return exactBands()
    .filter((row) => row.team_id !== "t1" && row.team_id !== championTeamId)
    .concat([{ team_id: championTeamId, band: "champion" }]);
}

function seed(p3PredictsChampion: string, p2PredictsChampion: string) {
  const teamStandings = TEAM_IDS.map((teamId, index) => ({
    team_id: teamId,
    season_id: "s1",
    position: index + 1,
  }));

  const p3Bands = bandsWithChampionOverride(p3PredictsChampion);
  const p2Bands = bandsWithChampionOverride(p2PredictsChampion);

  return {
    seasons: [{ id: "s1", is_current: true, start_date: "2026-08-01" }],
    matches: [{ season_id: "s1", kickoff_time: "2026-08-15T00:00:00Z" }],
    team_standings: teamStandings,
    players: [
      { id: "p1", competition_id: "c1", joined_at: "2026-07-01T00:00:00Z", is_bot: false },
      { id: "p2", competition_id: "c1", joined_at: "2026-07-01T00:00:00Z", is_bot: false },
      { id: "p3", competition_id: "c1", joined_at: "2026-07-01T00:00:00Z", is_bot: false },
    ],
    table_predictions: [
      { id: "tp1", player_id: "p1", submitted_at: "2026-08-01T00:00:00Z", is_skipped: false },
      { id: "tp2", player_id: "p2", submitted_at: "2026-08-01T00:00:00Z", is_skipped: false },
      { id: "tp3", player_id: "p3", submitted_at: "2026-08-01T00:00:00Z", is_skipped: false },
    ],
    table_prediction_ranks: [
      ...exactBands().map((r) => ({ table_prediction_id: "tp1", team_id: r.team_id, band: r.band })),
      ...p3Bands.map((r) => ({ table_prediction_id: "tp3", team_id: r.team_id, band: r.band })),
      // p2's assign call is what triggers the recompute under test; its
      // own Champion prediction also differs from p1's, so p1's t1 pick
      // is the *only* eligible one left, making it a genuine Bold Call.
      ...p2Bands.map((r) => ({ table_prediction_id: "tp2", team_id: r.team_id, band: r.band })),
    ],
  };
}

describe("scheduleCohortRecomputeForPlayer", () => {
  it("recomputes the whole competition's cohort, not just the mutating player's own score", async () => {
    // p3 predicts a *different* team as Champion, so p1's correct t1-as-
    // Champion pick is the only one among 3 eligible players (agreement
    // count 1 of 3, well under the rarity threshold) -- a genuine Bold
    // Call. All three players agree on every other team, so nothing else
    // qualifies.
    const { client, tables } = fakeSupabase(seed("t5", "t6"));

    scheduleCohortRecomputeForPlayer(client, "p2");
    await capturedWaitUntilPromise;

    const scoresByPlayer = new Map(
      tables.table_prediction_scores.map((r) => [r.player_id, r]),
    );

    // The route that called this only mutated p2 -- yet p1's Bold Call
    // score reflects the whole cohort's agreement, proving the recompute
    // wasn't scoped to p2 alone.
    expect(scoresByPlayer.get("p1")?.bold_call_score).toBe(3);
    expect(scoresByPlayer.has("p2")).toBe(true);
    expect(scoresByPlayer.has("p3")).toBe(true);
  });

  it("is a no-op (not a throw) when the player can't be found", async () => {
    const { client, tables } = fakeSupabase(seed("t5", "t6"));

    scheduleCohortRecomputeForPlayer(client, "does-not-exist");
    await capturedWaitUntilPromise;

    expect(tables.table_prediction_scores.length).toBe(0);
  });
});
