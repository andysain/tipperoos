import { describe, expect, it } from "vitest";
import { mapStandingsToRows } from "./map-standings";

// Golden values hand-derived from a synthetic football-data.org
// /v4/competitions/PL/standings payload shape. Only the TOTAL group is ever
// read -- HOME/AWAY splits exist in the real payload and must be ignored
// (issue #88 decision log).
const SEASON_ID = "season-1";
const NOW = new Date("2026-08-09T12:00:00.000Z");

const TEAM_ID_BY_PROVIDER_ID = new Map([
  ["1", "team-arsenal"],
  ["2", "team-city"],
  ["3", "team-united"],
]);

function payload(
  table: Array<{ position: number; teamId: string; playedGames: number }>,
) {
  return {
    standings: [
      {
        type: "HOME",
        table: [{ position: 1, team: { id: 1 }, playedGames: 99 }],
      },
      {
        type: "TOTAL",
        table: table.map((row) => ({
          position: row.position,
          team: { id: Number(row.teamId) },
          playedGames: row.playedGames,
        })),
      },
      {
        type: "AWAY",
        table: [{ position: 1, team: { id: 1 }, playedGames: 88 }],
      },
    ],
  };
}

describe("mapStandingsToRows", () => {
  it("maps TOTAL table entries to standings rows, ignoring HOME/AWAY", () => {
    const result = mapStandingsToRows(
      payload([
        { position: 1, teamId: "2", playedGames: 10 },
        { position: 2, teamId: "1", playedGames: 10 },
      ]),
      TEAM_ID_BY_PROVIDER_ID,
      SEASON_ID,
      NOW,
    );

    expect(result.rows.length).toBe(2);
    expect(result.rows[0]).toEqual({
      team_id: "team-city",
      season_id: SEASON_ID,
      position: 1,
      played: 10,
      updated_at: NOW.toISOString(),
    });
    expect(result.rows[1].position).toBe(2);
    expect(result.rows[1].played).toBe(10);
    expect(result.unmatchedProviderTeamIds.length).toBe(0);
  });

  it("skips an entry whose provider team id matches no known team, without dropping the rest", () => {
    const result = mapStandingsToRows(
      payload([
        { position: 1, teamId: "2", playedGames: 5 },
        { position: 2, teamId: "999", playedGames: 5 },
        { position: 3, teamId: "3", playedGames: 5 },
      ]),
      TEAM_ID_BY_PROVIDER_ID,
      SEASON_ID,
      NOW,
    );

    expect(result.rows.length).toBe(2);
    expect(result.unmatchedProviderTeamIds).toEqual(["999"]);
  });

  it("returns an empty result when the payload has no TOTAL group", () => {
    const result = mapStandingsToRows(
      { standings: [{ type: "HOME", table: [] }] },
      TEAM_ID_BY_PROVIDER_ID,
      SEASON_ID,
      NOW,
    );

    expect(result.rows.length).toBe(0);
    expect(result.unmatchedProviderTeamIds.length).toBe(0);
    expect(result.degenerate).toBe(false);
  });

  it("flags a degenerate pre-season placeholder (every team at position 1, 0 played) while still mapping the rows", () => {
    const result = mapStandingsToRows(
      payload([
        { position: 1, teamId: "2", playedGames: 0 },
        { position: 1, teamId: "1", playedGames: 0 },
        { position: 1, teamId: "3", playedGames: 0 },
      ]),
      TEAM_ID_BY_PROVIDER_ID,
      SEASON_ID,
      NOW,
    );

    expect(result.degenerate).toBe(true);
    expect(result.rows.length).toBe(3);
    expect(result.rows[0].position).toBe(1);
    expect(result.rows[1].position).toBe(1);
    expect(result.unmatchedProviderTeamIds.length).toBe(0);
  });

  it("does not flag a real table with distinct positions", () => {
    const result = mapStandingsToRows(
      payload([
        { position: 1, teamId: "2", playedGames: 10 },
        { position: 2, teamId: "1", playedGames: 10 },
        { position: 3, teamId: "3", playedGames: 9 },
      ]),
      TEAM_ID_BY_PROVIDER_ID,
      SEASON_ID,
      NOW,
    );

    expect(result.degenerate).toBe(false);
    expect(result.rows.length).toBe(3);
    expect(result.rows[0].position).toBe(1);
    expect(result.rows[1].position).toBe(2);
    expect(result.rows[2].position).toBe(3);
  });

  it("flags a degenerate table even when some teams are unmatched", () => {
    const result = mapStandingsToRows(
      payload([
        { position: 1, teamId: "2", playedGames: 0 },
        { position: 1, teamId: "999", playedGames: 0 },
      ]),
      TEAM_ID_BY_PROVIDER_ID,
      SEASON_ID,
      NOW,
    );

    expect(result.degenerate).toBe(true);
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].team_id).toBe("team-city");
    expect(result.unmatchedProviderTeamIds).toEqual(["999"]);
  });

  it("does not flag an empty TOTAL table as degenerate", () => {
    const result = mapStandingsToRows(
      { standings: [{ type: "TOTAL", table: [] }] },
      TEAM_ID_BY_PROVIDER_ID,
      SEASON_ID,
      NOW,
    );

    expect(result.degenerate).toBe(false);
    expect(result.rows.length).toBe(0);
  });

  it("is idempotent: mapping the same payload twice with the same clock produces identical rows", () => {
    const input = payload([
      { position: 1, teamId: "2", playedGames: 10 },
      { position: 2, teamId: "1", playedGames: 10 },
      { position: 3, teamId: "3", playedGames: 9 },
    ]);

    const first = mapStandingsToRows(
      input,
      TEAM_ID_BY_PROVIDER_ID,
      SEASON_ID,
      NOW,
    );
    const second = mapStandingsToRows(
      input,
      TEAM_ID_BY_PROVIDER_ID,
      SEASON_ID,
      NOW,
    );

    expect(second.rows).toEqual(first.rows);
    expect(second.rows.length).toBe(3);
  });
});
