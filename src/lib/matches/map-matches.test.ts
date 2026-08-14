import { describe, expect, it } from "vitest";
import { mapMatchesToRows, mapProviderStatus } from "./map-matches";

// Golden values hand-derived from a synthetic football-data.org
// /v4/competitions/PL/matches payload shape, and from CLAUDE.md's Stack
// section ("match on a stable external fixture ID, never team-name+date")
// and issue #11's decision log (status mapping table).
const PROVIDER_NAME = "football-data.org";
const NOW = new Date("2026-08-14T12:00:00.000Z");
const KNOWN_IDS = new Set(["100", "101", "102"]);

function payload(
  matches: Array<{
    id: number;
    utcDate: string;
    status: string;
    homeScore?: number | null;
    awayScore?: number | null;
  }>,
) {
  return {
    matches: matches.map((m) => ({
      id: m.id,
      utcDate: m.utcDate,
      status: m.status,
      homeTeam: { id: 1 },
      awayTeam: { id: 2 },
      score: {
        fullTime: {
          home: m.homeScore ?? null,
          away: m.awayScore ?? null,
        },
      },
    })),
  };
}

describe("mapProviderStatus", () => {
  it("maps FINISHED to completed", () => {
    expect(mapProviderStatus("FINISHED")).toBe("completed");
  });

  it("maps POSTPONED, SUSPENDED, and CANCELLED to postponed", () => {
    expect(mapProviderStatus("POSTPONED")).toBe("postponed");
    expect(mapProviderStatus("SUSPENDED")).toBe("postponed");
    expect(mapProviderStatus("CANCELLED")).toBe("postponed");
  });

  it("maps SCHEDULED, TIMED, IN_PLAY, PAUSED, and AWARDED to scheduled", () => {
    expect(mapProviderStatus("SCHEDULED")).toBe("scheduled");
    expect(mapProviderStatus("TIMED")).toBe("scheduled");
    expect(mapProviderStatus("IN_PLAY")).toBe("scheduled");
    expect(mapProviderStatus("PAUSED")).toBe("scheduled");
    expect(mapProviderStatus("AWARDED")).toBe("scheduled");
  });
});

describe("mapMatchesToRows", () => {
  it("maps a scheduled match with a kickoff-time change, no score written", () => {
    const result = mapMatchesToRows(
      payload([{ id: 100, utcDate: "2026-08-22T15:30:00Z", status: "TIMED" }]),
      KNOWN_IDS,
      PROVIDER_NAME,
      NOW,
    );

    expect(result.rows.length).toBe(1);
    expect(result.rows[0]).toEqual({
      provider_name: PROVIDER_NAME,
      provider_match_id: "100",
      kickoff_time: "2026-08-22T15:30:00Z",
      status: "scheduled",
      team_a_score: null,
      team_b_score: null,
      result_updated_at: null,
    });
  });

  it("writes a different final scoreline correctly (3-0)", () => {
    const result = mapMatchesToRows(
      payload([
        {
          id: 100,
          utcDate: "2026-08-22T15:00:00Z",
          status: "FINISHED",
          homeScore: 3,
          awayScore: 0,
        },
      ]),
      KNOWN_IDS,
      PROVIDER_NAME,
      NOW,
    );

    expect(result.rows[0].team_a_score).toBe(3);
    expect(result.rows[0].team_b_score).toBe(0);
  });

  it("writes fullTime score and result_updated_at only when FINISHED", () => {
    const result = mapMatchesToRows(
      payload([
        {
          id: 101,
          utcDate: "2026-08-22T15:00:00Z",
          status: "FINISHED",
          homeScore: 2,
          awayScore: 1,
        },
      ]),
      KNOWN_IDS,
      PROVIDER_NAME,
      NOW,
    );

    expect(result.rows[0].status).toBe("completed");
    expect(result.rows[0].team_a_score).toBe(2);
    expect(result.rows[0].team_b_score).toBe(1);
    expect(result.rows[0].result_updated_at).toBe(NOW.toISOString());
  });

  it("maps a postponed match to postponed status with no score", () => {
    const result = mapMatchesToRows(
      payload([
        {
          id: 102,
          utcDate: "2026-08-23T14:00:00Z",
          status: "POSTPONED",
        },
      ]),
      KNOWN_IDS,
      PROVIDER_NAME,
      NOW,
    );

    expect(result.rows[0].status).toBe("postponed");
    expect(result.rows[0].team_a_score).toBe(null);
    expect(result.rows[0].team_b_score).toBe(null);
  });

  it("skips a match whose provider id matches no seeded fixture, without dropping the rest", () => {
    const result = mapMatchesToRows(
      payload([
        { id: 100, utcDate: "2026-08-22T15:30:00Z", status: "SCHEDULED" },
        { id: 999, utcDate: "2026-08-22T17:30:00Z", status: "SCHEDULED" },
        { id: 101, utcDate: "2026-08-22T20:00:00Z", status: "SCHEDULED" },
      ]),
      KNOWN_IDS,
      PROVIDER_NAME,
      NOW,
    );

    expect(result.rows.length).toBe(2);
    expect(result.unmatchedProviderMatchIds.length).toBe(1);
    expect(result.unmatchedProviderMatchIds).toEqual(["999"]);
  });

  it("is idempotent: mapping the same payload twice with the same clock produces identical rows", () => {
    const input = payload([
      {
        id: 101,
        utcDate: "2026-08-22T15:00:00Z",
        status: "FINISHED",
        homeScore: 3,
        awayScore: 0,
      },
    ]);

    const first = mapMatchesToRows(input, KNOWN_IDS, PROVIDER_NAME, NOW);
    const second = mapMatchesToRows(input, KNOWN_IDS, PROVIDER_NAME, NOW);

    expect(second.rows).toEqual(first.rows);
  });
});
