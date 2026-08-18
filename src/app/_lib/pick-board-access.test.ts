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

  // Mirrors competition_score_totals (issue #182): scoresForCompetition now
  // fetches pre-aggregated per-player totals via RPC instead of raw `scores`
  // rows. Fixtures still describe `scores` as one row per scored match (the
  // fixture's intent stays readable); this groups them by player_id the
  // same way the SQL aggregate does, restricted to the asked-for player ids.
  const rpc = vi.fn((fn: string, args: { p_player_ids: string[] }) => {
    if (fn !== "competition_score_totals") {
      return Promise.resolve({
        data: null,
        error: new Error(`unexpected rpc: ${fn}`),
      });
    }
    const rows = (tableData.scores?.list ?? []) as {
      player_id: string;
      points: number;
    }[];
    const byPlayer = new Map<
      string,
      { points: number; matches_scored: number; exact_tips: number; correct_results: number }
    >();
    for (const row of rows) {
      if (!args.p_player_ids.includes(row.player_id)) continue;
      const agg = byPlayer.get(row.player_id) ?? {
        points: 0,
        matches_scored: 0,
        exact_tips: 0,
        correct_results: 0,
      };
      agg.points += row.points;
      agg.matches_scored += 1;
      if (row.points === 7) agg.exact_tips += 1;
      if (row.points >= 3) agg.correct_results += 1;
      byPlayer.set(row.player_id, agg);
    }
    const data = [...byPlayer.entries()].map(([player_id, agg]) => ({
      player_id,
      ...agg,
    }));
    return Promise.resolve({ data, error: null });
  });

  return { from, rpc, calls };
}

const { loadPickBoardGameweek, loadSeasonStats } =
  await import("./pick-board-access");

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

  it("renders a skipped slot after the remaining match (kickoff display order)", async () => {
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
    expect(result?.slots[0].kind).toBe("match");
    expect(result?.slots[1]).toEqual({ kind: "skipped" });
  });

  it("shows the random pick on top when it kicks off before the marquee (kickoff display order)", async () => {
    // DB keeps the sourced slots (match_1 = marquee, match_2 = random); the
    // board renders by kickoff, the marquee only breaking a kickoff tie
    // (Option B). Here match_2 (random) kicks off 22 Aug, match_1 (marquee)
    // 23 Aug -- the random pick must render on top, keeping its provenance.
    const { from } = createSupabaseMock({
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
            kickoff_time: "2026-08-23T15:00:00.000Z",
            status: "scheduled",
            team_a_score: null,
            team_b_score: null,
          },
          {
            id: "match-2",
            team_a_id: "team-c",
            team_b_id: "team-d",
            kickoff_time: "2026-08-22T15:00:00.000Z",
            status: "scheduled",
            team_a_score: null,
            team_b_score: null,
          },
        ],
      },
      picks: { list: [] },
      scores: { list: [] },
      teams: {
        list: [
          { id: "team-a", name: "Team A", short_code: "TMA" },
          { id: "team-b", name: "Team B", short_code: "TMB" },
          { id: "team-c", name: "Team C", short_code: "TMC" },
          { id: "team-d", name: "Team D", short_code: "TMD" },
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

    expect(result?.slots[0].kind).toBe("match");
    expect((result?.slots[0] as { match: { id: string } }).match.id).toBe(
      "match-2",
    );
    expect((result?.slots[0] as { provenance: string }).provenance).toBe(
      "random_pick",
    );
    expect((result?.slots[1] as { match: { id: string } }).match.id).toBe(
      "match-1",
    );
    expect((result?.slots[1] as { provenance: string }).provenance).toBe(
      "top_matchup",
    );
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

// ADR 0012 D12: the Pick Board's rank must use the same humans-only basis
// as the leaderboard route, or the two surfaces show one player two
// different ranks on the same day.
describe("loadSeasonStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockWithRoster() {
    return createSupabaseMock({
      players: {
        list: [
          {
            id: SESSION_PLAYER,
            display_name: "Me",
            emoji: "⚡",
            is_bot: false,
            joined_at: "2026-08-01T00:00:00Z",
          },
          {
            id: "bot-1",
            display_name: "Median Bot",
            emoji: "🤖",
            is_bot: true,
            joined_at: "2026-08-01T00:00:00Z",
          },
          {
            id: OTHER_PLAYER,
            display_name: "Rival",
            emoji: "🦊",
            is_bot: false,
            joined_at: "2026-08-01T00:00:00Z",
          },
        ],
      },
      scores: {
        list: [
          { player_id: OTHER_PLAYER, points: 20 },
          { player_id: "bot-1", points: 15 },
          { player_id: SESSION_PLAYER, points: 10 },
        ],
      },
    });
  }

  it("ranks past a bot sitting between two humans, so the player below it is 2nd not 3rd", async () => {
    const { from, rpc } = mockWithRoster();
    const stats = await loadSeasonStats(
      { from, rpc } as never,
      COMPETITION_ID,
      SESSION_PLAYER,
      SEASON_ID,
    );
    expect(stats).toEqual({ points: 10, rank: 2 });
  });

  it("returns null before the competition has any scored match (day-one variant)", async () => {
    const { from, rpc } = createSupabaseMock({
      players: {
        list: [
          {
            id: SESSION_PLAYER,
            display_name: "Me",
            emoji: "⚡",
            is_bot: false,
            joined_at: "2026-08-01T00:00:00Z",
          },
        ],
      },
      scores: { list: [] },
    });
    const stats = await loadSeasonStats(
      { from, rpc } as never,
      COMPETITION_ID,
      SESSION_PLAYER,
      SEASON_ID,
    );
    expect(stats).toBeNull();
  });
});
