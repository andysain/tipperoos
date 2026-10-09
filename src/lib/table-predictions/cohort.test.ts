import { describe, expect, it } from "vitest";
import { fakeSupabase, type Row } from "../../../vitest/fake-supabase";
import { loadScoredCohort } from "./cohort";
import { TABLE_BANDS as RULE_BANDS } from "./rules";

// Golden values for issue #214 D1's shared cohort read: the same cohort as
// recompute-cohort.test.ts (hand-derived there for #157), now read as one
// embedded-select query and scored without writing. The page and the
// recompute must agree on exactly who is in the cohort -- non-bot players in
// this competition with a submitted, non-skipped table -- or the page's
// totals stop matching the leaderboard's (issue D3).

const SEASON_ID = "s1";
const COMPETITION_ID = "c1";
const OTHER_COMPETITION_ID = "c2";
const GW1_KICKOFF = "2026-08-15T00:00:00Z";
const BEFORE_GW1 = "2026-07-01T00:00:00Z";
const AFTER_GW1 = "2026-09-01T00:00:00Z";
const TEAM_IDS = Array.from({ length: 20 }, (_, i) => `t${String(i + 1)}`);

function bandKeyForRank(rank: number): string {
  let cursor = 0;
  for (const band of RULE_BANDS) {
    cursor += band.target;
    if (rank <= cursor) return band.key;
  }
  throw new Error(`rank ${String(rank)} out of range`);
}

function ranks(predictionId: string, bandByTeam: Map<string, string>): Row[] {
  return [...bandByTeam.entries()].map(([teamId, band]) => ({
    table_prediction_id: predictionId,
    team_id: teamId,
    band,
  }));
}

function player(id: string, joinedAt: string, extra: Row = {}): Row {
  return {
    id,
    competition_id: COMPETITION_ID,
    display_name: `Player ${id}`,
    emoji: "⚽",
    joined_at: joinedAt,
    is_bot: false,
    ...extra,
  };
}

function seed(): Record<string, Row[]> {
  const exact = new Map(
    TEAM_IDS.map((teamId, index) => [teamId, bandKeyForRank(index + 1)]),
  );
  const swapped = new Map(exact);
  swapped.set("t1", "runners_up");
  swapped.set("t2", "champion");

  return {
    seasons: [{ id: SEASON_ID, is_current: true, start_date: "2026-08-01" }],
    matches: [
      { season_id: SEASON_ID, kickoff_time: "2026-09-20T14:00:00Z" },
      { season_id: SEASON_ID, kickoff_time: GW1_KICKOFF },
    ],
    team_standings: TEAM_IDS.map((teamId, index) => ({
      team_id: teamId,
      season_id: SEASON_ID,
      position: index + 1,
      played: index === 0 ? 7 : 8,
      updated_at: "2026-10-05T10:00:00Z",
    })),
    players: [
      player("p1", BEFORE_GW1),
      player("p2", BEFORE_GW1),
      player("p3", AFTER_GW1), // Late Joiner
      player("p4", BEFORE_GW1), // skipped
      player("p5", BEFORE_GW1), // never submitted
      player("p-bot", BEFORE_GW1, { is_bot: true }),
      player("p-other", BEFORE_GW1, { competition_id: OTHER_COMPETITION_ID }),
    ],
    table_predictions: [
      {
        id: "tp1",
        player_id: "p1",
        submitted_at: "2026-08-01T00:00:00Z",
        is_skipped: false,
      },
      {
        id: "tp2",
        player_id: "p2",
        submitted_at: "2026-08-01T00:00:00Z",
        is_skipped: false,
      },
      {
        id: "tp3",
        player_id: "p3",
        submitted_at: "2026-09-02T00:00:00Z",
        is_skipped: false,
      },
      {
        id: "tp4",
        player_id: "p4",
        submitted_at: "2026-08-01T00:00:00Z",
        is_skipped: true,
      },
      { id: "tp5", player_id: "p5", submitted_at: null, is_skipped: false },
      {
        id: "tp-bot",
        player_id: "p-bot",
        submitted_at: "2026-08-01T00:00:00Z",
        is_skipped: false,
      },
      {
        id: "tp-other",
        player_id: "p-other",
        submitted_at: "2026-08-01T00:00:00Z",
        is_skipped: false,
      },
    ],
    table_prediction_ranks: [
      ...ranks("tp1", exact),
      ...ranks("tp2", swapped),
      ...ranks("tp3", exact),
      ...ranks("tp4", exact),
      ...ranks("tp-bot", exact),
      ...ranks("tp-other", exact),
    ],
  };
}

describe("loadScoredCohort", () => {
  it("scores exactly the recompute's cohort, with its hand-derived totals", async () => {
    const { client } = fakeSupabase(seed());
    const cohort = await loadScoredCohort(client, COMPETITION_ID);

    expect([...cohort.players.keys()].sort()).toEqual(["p1", "p2", "p3"]);
    expect(cohort.results.get("p1")?.totalScore).toBe(191);
    expect(cohort.results.get("p1")?.boldCallScore).toBe(6);
    expect(cohort.results.get("p2")?.totalScore).toBe(159);
    expect(cohort.results.get("p2")?.placementScore).toBe(94);
    expect(cohort.results.get("p3")?.totalScore).toBe(185);
    expect(cohort.results.get("p3")?.boldCallScore).toBe(0);
  });

  it("carries each member's identity, Late Joiner status and Bands", async () => {
    const { client } = fakeSupabase(seed());
    const cohort = await loadScoredCohort(client, COMPETITION_ID);

    expect(cohort.players.get("p3")?.isLateJoiner).toBe(true);
    expect(cohort.players.get("p1")?.isLateJoiner).toBe(false);
    expect(cohort.players.get("p1")?.displayName).toBe("Player p1");
    expect(cohort.bands.get("p2")?.get("t1")).toBe(1);
    expect(cohort.bands.get("p2")?.get("t20")).toBe(7);
  });

  it("returns the standings it scored against, and their state", async () => {
    const { client } = fakeSupabase(seed());
    const cohort = await loadScoredCohort(client, COMPETITION_ID);

    expect(cohort.actualOrder).toHaveLength(20);
    expect(cohort.actualOrder[0]).toBe("t1");
    expect(cohort.minPlayed).toBe(7);
    expect(cohort.standingsUpdatedAt?.toISOString()).toBe(
      "2026-10-05T10:00:00.000Z",
    );
    expect(cohort.gameweekOneKickoff?.toISOString()).toBe(
      "2026-08-15T00:00:00.000Z",
    );
  });

  it("scores nothing until all 20 clubs have a standing", async () => {
    const data = seed();
    data.team_standings = data.team_standings.slice(0, 5);
    const { client } = fakeSupabase(data);
    const cohort = await loadScoredCohort(client, COMPETITION_ID);

    expect(cohort.actualOrder).toHaveLength(0);
    expect(cohort.results.size).toBe(0);
    // The cohort's members are still known -- only the scoring waits.
    expect(cohort.players.size).toBe(3);
  });
});
