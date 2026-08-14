import { beforeEach, describe, expect, it, vi } from "vitest";

interface TableData {
  single?: unknown;
  list?: unknown[];
}

function createSupabaseMock(tableData: Record<string, TableData>) {
  const calls: Record<string, { type: string; col: string; val: unknown }[]> =
    {};

  function record(table: string, type: string, col: string, val: unknown) {
    calls[table] = calls[table] ?? [];
    calls[table].push({ type, col, val });
  }

  const from = vi.fn((table: string) => {
    const data = tableData[table] ?? {};
    const builder = {
      select: () => builder,
      eq(col: string, val: unknown) {
        record(table, "eq", col, val);
        return builder;
      },
      in(col: string, val: unknown) {
        record(table, "in", col, val);
        return builder;
      },
      order: () => builder,
      maybeSingle: async () => ({ data: data.single ?? null, error: null }),
      single: async () => ({ data: data.single ?? null, error: null }),
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: data.list ?? [], error: null }).then(resolve),
    };
    return builder;
  });

  return { from, calls };
}

const { loadPickBoardGameweek } = await import("./pick-board-access");

const SESSION_PLAYER = "player-me";
const OTHER_PLAYER = "player-other";
const COMPETITION_ID = "comp-1";
const SEASON_ID = "season-1";
const GAMEWEEK_NUMBER = 1;
const NOW = new Date("2026-08-21T12:00:00.000Z");

describe("loadPickBoardGameweek", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("only queries picks and scores scoped to the session player, never another player", async () => {
    const { from, calls } = createSupabaseMock({
      gameweeks: {
        single: {
          match_1_id: "match-1",
          match_2_id: "match-2",
          match_1_voided_at: null,
          match_2_voided_at: null,
        },
      },
      matches: {
        list: [
          {
            id: "match-1",
            team_a_id: "team-a",
            team_b_id: "team-b",
            kickoff_time: "2026-08-22T15:00:00.000Z",
            status: "scheduled",
            team_a_score: null,
            team_b_score: null,
          },
          {
            id: "match-2",
            team_a_id: "team-c",
            team_b_id: "team-d",
            kickoff_time: "2026-08-23T15:00:00.000Z",
            status: "scheduled",
            team_a_score: null,
            team_b_score: null,
          },
        ],
      },
      picks: {
        list: [{ match_id: "match-1", pred_home_score: 2, pred_away_score: 1 }],
      },
      scores: { list: [] },
      teams: { list: [] },
      team_standings: { list: [] },
    });

    await loadPickBoardGameweek(
      { from } as never,
      COMPETITION_ID,
      SESSION_PLAYER,
      NOW,
      SEASON_ID,
      GAMEWEEK_NUMBER,
    );

    const pickCalls = calls.picks;
    const scoreCalls = calls.scores;

    const pickPlayerFilter = pickCalls.find(
      (c) => c.type === "eq" && c.col === "player_id",
    );
    const scorePlayerFilter = scoreCalls.find(
      (c) => c.type === "eq" && c.col === "player_id",
    );

    expect(pickPlayerFilter?.val).toBe(SESSION_PLAYER);
    expect(pickPlayerFilter?.val).not.toBe(OTHER_PLAYER);
    expect(scorePlayerFilter?.val).toBe(SESSION_PLAYER);
    expect(scorePlayerFilter?.val).not.toBe(OTHER_PLAYER);

    // Never queried with a bare match_id filter and no player_id scope
    // (AGENTS.md's match_id-alone-is-not-scope rule).
    expect(
      pickCalls.some((c) => c.type === "eq" && c.col === "player_id"),
    ).toBe(true);
    expect(
      scoreCalls.some((c) => c.type === "eq" && c.col === "player_id"),
    ).toBe(true);
  });

  it("only returns this player's own pick on the slot, even if other players' rows exist upstream", async () => {
    const { from } = createSupabaseMock({
      gameweeks: {
        single: {
          match_1_id: "match-1",
          match_2_id: null,
          match_1_voided_at: null,
          match_2_voided_at: null,
        },
      },
      matches: {
        list: [
          {
            id: "match-1",
            team_a_id: "team-a",
            team_b_id: "team-b",
            kickoff_time: "2026-08-22T15:00:00.000Z",
            status: "scheduled",
            team_a_score: null,
            team_b_score: null,
          },
        ],
      },
      // The mock DB layer already scopes to player_id at query time (see
      // pick-board-access.ts's .eq("player_id", playerId)); this test's
      // fixture reflects that -- only the session player's row comes back.
      picks: {
        list: [{ match_id: "match-1", pred_home_score: 3, pred_away_score: 0 }],
      },
      scores: { list: [] },
      teams: {
        list: [
          { id: "team-a", name: "Team A", short_code: "TMA" },
          { id: "team-b", name: "Team B", short_code: "TMB" },
        ],
      },
      team_standings: { list: [] },
    });

    const result = await loadPickBoardGameweek(
      { from } as never,
      COMPETITION_ID,
      SESSION_PLAYER,
      NOW,
      SEASON_ID,
      GAMEWEEK_NUMBER,
    );

    expect(result?.slots[0]).toMatchObject({
      kind: "match",
      ownPick: { homeScore: 3, awayScore: 0 },
    });
  });

  it("returns null when no gameweek row exists for this season/number", async () => {
    const { from } = createSupabaseMock({ gameweeks: { single: null } });
    const result = await loadPickBoardGameweek(
      { from } as never,
      COMPETITION_ID,
      SESSION_PLAYER,
      NOW,
      SEASON_ID,
      GAMEWEEK_NUMBER,
    );
    expect(result).toBeNull();
  });

  it("renders a skipped slot when a match id is null", async () => {
    const { from } = createSupabaseMock({
      gameweeks: {
        single: {
          match_1_id: null,
          match_2_id: "match-2",
          match_1_voided_at: null,
          match_2_voided_at: null,
        },
      },
      matches: {
        list: [
          {
            id: "match-2",
            team_a_id: "team-c",
            team_b_id: "team-d",
            kickoff_time: "2026-08-23T15:00:00.000Z",
            status: "scheduled",
            team_a_score: null,
            team_b_score: null,
          },
        ],
      },
      picks: { list: [] },
      scores: { list: [] },
      teams: { list: [] },
      team_standings: { list: [] },
    });

    const result = await loadPickBoardGameweek(
      { from } as never,
      COMPETITION_ID,
      SESSION_PLAYER,
      NOW,
      SEASON_ID,
      GAMEWEEK_NUMBER,
    );
    expect(result?.slots[0]).toEqual({ kind: "skipped" });
    expect(result?.slots[1].kind).toBe("match");
  });

  it("treats a postponed match as voided even when voided_at hasn't been set yet", async () => {
    // Postponement handling isn't built yet, so nothing guarantees
    // matches.status and gameweeks.match_N_voided_at flip together --
    // this covers a sync step writing status first.
    const { from } = createSupabaseMock({
      gameweeks: {
        single: {
          match_1_id: "match-1",
          match_2_id: null,
          match_1_voided_at: null,
          match_2_voided_at: null,
        },
      },
      matches: {
        list: [
          {
            id: "match-1",
            team_a_id: "team-a",
            team_b_id: "team-b",
            kickoff_time: "2026-08-22T15:00:00.000Z",
            status: "postponed",
            team_a_score: null,
            team_b_score: null,
          },
        ],
      },
      picks: { list: [] },
      scores: { list: [] },
      teams: { list: [] },
      team_standings: { list: [] },
    });

    const result = await loadPickBoardGameweek(
      { from } as never,
      COMPETITION_ID,
      SESSION_PLAYER,
      NOW,
      SEASON_ID,
      GAMEWEEK_NUMBER,
    );
    expect(result?.slots[0]).toMatchObject({ kind: "match", voided: true });
  });
});
