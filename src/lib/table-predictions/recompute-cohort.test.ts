import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recomputePredictTableCohort } from "./recompute-cohort";
import { TABLE_BANDS as RULE_BANDS } from "./rules";

// Golden values hand-derived for issue #157: proven end-to-end (players /
// table_predictions / table_prediction_ranks / team_standings / seasons /
// matches reads -> scorePredictTableCohort -> table_prediction_scores
// write) against an in-memory fake that persists upserts so a repeat call
// in the same test sees them, mirroring select-next.test.ts's fake.

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
  seasons?: Row[];
  matches?: Row[];
  team_standings?: Row[];
  players?: Row[];
  table_predictions?: Row[];
  table_prediction_ranks?: Row[];
}) {
  const tables: Record<string, Row[]> = {
    seasons: seed.seasons ?? [],
    matches: seed.matches ?? [],
    team_standings: seed.team_standings ?? [],
    players: seed.players ?? [],
    table_predictions: seed.table_predictions ?? [],
    table_prediction_ranks: seed.table_prediction_ranks ?? [],
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

const SEASON_ID = "s1";
const COMPETITION_ID = "c1";
const GW1_KICKOFF = "2026-08-15T00:00:00Z";
const BEFORE_GW1 = "2026-07-01T00:00:00Z";
const AFTER_GW1 = "2026-09-01T00:00:00Z";

const TEAM_IDS = Array.from({ length: 20 }, (_, i) => `t${i + 1}`);

// 1-indexed rank -> Band key, matching TABLE_BANDS'/rules.ts's identical
// order and sizes (verified in issue #157's recon).
function bandKeyForRank(rank: number): string {
  let cursor = 0;
  for (const band of RULE_BANDS) {
    cursor += band.target;
    if (rank <= cursor) return band.key;
  }
  throw new Error(`rank ${rank} out of range`);
}

function ranksForPrediction(
  tablePredictionId: string,
  bandByTeam: Map<string, string>,
): Row[] {
  return [...bandByTeam.entries()].map(([teamId, band]) => ({
    table_prediction_id: tablePredictionId,
    team_id: teamId,
    band,
  }));
}

function seedRows() {
  const teamStandings = TEAM_IDS.map((teamId, index) => ({
    team_id: teamId,
    season_id: SEASON_ID,
    position: index + 1,
  }));

  // Exact-match prediction: every team in the Band it actually finished in.
  const exactBands = new Map(
    TEAM_IDS.map((teamId, index) => [teamId, bandKeyForRank(index + 1)]),
  );

  // p2's prediction: identical to `exactBands` except Champion/Runners Up
  // swapped (t1 predicted Runners Up, t2 predicted Champion) -- wrong by
  // one Band each, and forfeits both Bands' Bonuses.
  const swappedBands = new Map(exactBands);
  swappedBands.set("t1", "runners_up");
  swappedBands.set("t2", "champion");

  const players = [
    { id: "p1", competition_id: COMPETITION_ID, joined_at: BEFORE_GW1, is_bot: false },
    { id: "p2", competition_id: COMPETITION_ID, joined_at: BEFORE_GW1, is_bot: false },
    // Late Joiner: submits an exact-match prediction like p1, but sits
    // outside the Bold Call process in both directions (CLAUDE.md).
    { id: "p3", competition_id: COMPETITION_ID, joined_at: AFTER_GW1, is_bot: false },
    // Skipped -- has ranks (defensively) but must be excluded entirely.
    { id: "p4", competition_id: COMPETITION_ID, joined_at: BEFORE_GW1, is_bot: false },
    // Never submitted -- has a table_predictions row but submitted_at null.
    { id: "p5", competition_id: COMPETITION_ID, joined_at: BEFORE_GW1, is_bot: false },
    // No table_predictions row at all.
    { id: "p6", competition_id: COMPETITION_ID, joined_at: BEFORE_GW1, is_bot: false },
    // Bot -- excluded by is_bot regardless of any table_predictions row.
    { id: "p-bot", competition_id: COMPETITION_ID, joined_at: BEFORE_GW1, is_bot: true },
  ];

  const tablePredictions = [
    { id: "tp1", player_id: "p1", submitted_at: "2026-08-01T00:00:00Z", is_skipped: false },
    { id: "tp2", player_id: "p2", submitted_at: "2026-08-01T00:00:00Z", is_skipped: false },
    { id: "tp3", player_id: "p3", submitted_at: "2026-09-02T00:00:00Z", is_skipped: false },
    { id: "tp4", player_id: "p4", submitted_at: "2026-08-01T00:00:00Z", is_skipped: true },
    { id: "tp5", player_id: "p5", submitted_at: null, is_skipped: false },
  ];

  const ranks = [
    ...ranksForPrediction("tp1", exactBands),
    ...ranksForPrediction("tp2", swappedBands),
    ...ranksForPrediction("tp3", exactBands),
    ...ranksForPrediction("tp4", exactBands),
  ];

  return {
    seasons: [{ id: SEASON_ID, is_current: true, start_date: "2026-08-01" }],
    matches: [{ season_id: SEASON_ID, kickoff_time: GW1_KICKOFF }],
    team_standings: teamStandings,
    players,
    table_predictions: tablePredictions,
    table_prediction_ranks: ranks,
  };
}

describe("recomputePredictTableCohort", () => {
  it("writes the hand-derived golden scores for an exact-match player, an off-by-one player, and a Late Joiner", async () => {
    const { client, tables } = fakeSupabase(seedRows());

    await recomputePredictTableCohort(client, COMPETITION_ID);

    const scoresByPlayer = new Map(
      tables.table_prediction_scores.map((r) => [r.player_id, r]),
    );

    // p1: exact match on all 20 teams (placement 100, Band Bonus 85) plus
    // two Bold Calls (Champion and Runners Up, the only two placements p2
    // disagreed on, each earned by 1 of 2 eligible entries -- rare).
    expect(scoresByPlayer.get("p1")).toMatchObject({
      total_score: 191,
      placement_score: 100,
      band_bonus_score: 85,
      bold_call_score: 6,
    });

    // p2: Champion/Runners Up swapped -- distance 1 on both (2 pts each
    // instead of 5), forfeits both Bands' Bonuses (10 + 10), no Bold Calls
    // (nothing p2 got right was rare -- t3..t20 agree with p1).
    expect(scoresByPlayer.get("p2")).toMatchObject({
      total_score: 159,
      placement_score: 94,
      band_bonus_score: 65,
      bold_call_score: 0,
    });

    // p3: exact match like p1, but a Late Joiner -- earns the placement
    // and Band Bonus points but zero Bold Calls (excluded from the
    // process entirely, not just from qualifying).
    expect(scoresByPlayer.get("p3")).toMatchObject({
      total_score: 185,
      placement_score: 100,
      band_bonus_score: 85,
      bold_call_score: 0,
    });

    // p4 (skipped), p5 (never submitted), p6 (no row), p-bot (bot) all
    // stay out of the cohort entirely -- no stored row.
    expect(scoresByPlayer.has("p4")).toBe(false);
    expect(scoresByPlayer.has("p5")).toBe(false);
    expect(scoresByPlayer.has("p6")).toBe(false);
    expect(scoresByPlayer.has("p-bot")).toBe(false);
  });

  it("is idempotent -- recomputing twice produces the same stored scores, not accumulated ones", async () => {
    const { client, tables } = fakeSupabase(seedRows());

    await recomputePredictTableCohort(client, COMPETITION_ID);
    const firstPass = tables.table_prediction_scores.map((r) => ({ ...r }));

    await recomputePredictTableCohort(client, COMPETITION_ID);
    const secondPass = tables.table_prediction_scores;

    expect(secondPass.length).toBe(firstPass.length);
    for (const row of firstPass) {
      const repeat = secondPass.find((r) => r.player_id === row.player_id);
      expect(repeat).toMatchObject({
        total_score: row.total_score,
        placement_score: row.placement_score,
        band_bonus_score: row.band_bonus_score,
        bold_call_score: row.bold_call_score,
      });
    }
  });

  it("no-ops when standings don't have all 20 teams yet (pre-season / degenerate)", async () => {
    const seed = seedRows();
    seed.team_standings = seed.team_standings.slice(0, 5);
    const { client, tables } = fakeSupabase(seed);

    await recomputePredictTableCohort(client, COMPETITION_ID);

    expect(tables.table_prediction_scores.length).toBe(0);
  });
});
