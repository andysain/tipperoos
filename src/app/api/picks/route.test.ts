import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionPlayerIdMock = vi.fn();
const resolveCompetitionIdMock = vi.fn();

const gameweeksSelectChain = {
  eq: vi.fn().mockReturnThis(),
};
const gameweeksSelectMock = vi.fn(() => gameweeksSelectChain);

const picksUpsertChain = {
  select: vi.fn().mockReturnThis(),
  single: vi.fn(),
};
const picksUpsertMock = vi.fn(() => picksUpsertChain);

vi.mock("@/app/_lib/session-cookie", () => ({
  getSessionPlayerId: () => getSessionPlayerIdMock(),
}));

vi.mock("@/lib/competitions/scope", () => ({
  resolveCompetitionId: (...args: unknown[]) =>
    resolveCompetitionIdMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => ({
    from: (table: string) => {
      if (table === "gameweeks") {
        return { select: gameweeksSelectMock };
      }
      if (table === "picks") {
        return { upsert: picksUpsertMock };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

const { POST } = await import("./route");

const GW_ROW = { match_1_id: "match-1", match_2_id: "match-2" };
const OTHER_COMP_GW_ROW = { match_1_id: "other-match", match_2_id: null };

function request(
  body: Record<string, unknown>,
  { csrf = true }: { csrf?: boolean } = {},
) {
  return new Request("http://localhost/api/picks", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(csrf ? { "x-tipperoos-client": "1" } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/picks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gameweeksSelectChain.eq.mockReturnThis();
    getSessionPlayerIdMock.mockResolvedValue("player-1");
    resolveCompetitionIdMock.mockResolvedValue("comp-1");
    gameweeksSelectChain.eq.mockResolvedValue({ data: [GW_ROW], error: null });
    picksUpsertChain.single.mockResolvedValue({
      data: {
        id: "pick-1",
        match_id: "match-1",
        pred_home_score: 2,
        pred_away_score: 1,
        updated_at: "2026-08-09T00:00:00.000Z",
      },
      error: null,
    });
  });

  it("rejects a request with no CSRF header", async () => {
    const response = await POST(
      request(
        { matchId: "match-1", homeScore: 2, awayScore: 1 },
        { csrf: false },
      ),
    );
    expect(response.status).toBe(403);
    expect(getSessionPlayerIdMock).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request", async () => {
    getSessionPlayerIdMock.mockResolvedValue(null);
    const response = await POST(
      request({ matchId: "match-1", homeScore: 2, awayScore: 1 }),
    );
    expect(response.status).toBe(401);
  });

  it("rejects out-of-range or non-integer scores independent of any client cap", async () => {
    const tooHigh = await POST(
      request({ matchId: "match-1", homeScore: 10, awayScore: 1 }),
    );
    expect(tooHigh.status).toBe(400);

    const negative = await POST(
      request({ matchId: "match-1", homeScore: -1, awayScore: 1 }),
    );
    expect(negative.status).toBe(400);

    const notInteger = await POST(
      request({ matchId: "match-1", homeScore: 1.5, awayScore: 1 }),
    );
    expect(notInteger.status).toBe(400);

    expect(picksUpsertMock).not.toHaveBeenCalled();
  });

  it("rejects a matchId that isn't a currently tipped match for the caller's competition", async () => {
    gameweeksSelectChain.eq.mockResolvedValue({
      data: [OTHER_COMP_GW_ROW],
      error: null,
    });
    const response = await POST(
      request({ matchId: "match-1", homeScore: 2, awayScore: 1 }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(picksUpsertMock).not.toHaveBeenCalled();
    expect(body.error).toBe("That match isn't a currently tipped match.");
  });

  it("scopes the gameweeks lookup to the caller's own competition", async () => {
    await POST(request({ matchId: "match-1", homeScore: 2, awayScore: 1 }));
    expect(gameweeksSelectChain.eq).toHaveBeenCalledWith(
      "competition_id",
      "comp-1",
    );
  });

  it("upserts on (player_id, match_id) and returns only the caller's own pick, camelCased", async () => {
    const response = await POST(
      request({ matchId: "match-1", homeScore: 2, awayScore: 1 }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(picksUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        player_id: "player-1",
        match_id: "match-1",
        pred_home_score: 2,
        pred_away_score: 1,
      }),
      { onConflict: "player_id,match_id" },
    );
    expect(body).toEqual({
      id: "pick-1",
      matchId: "match-1",
      predHomeScore: 2,
      predAwayScore: 1,
      updatedAt: "2026-08-09T00:00:00.000Z",
    });
    // Own-pick-only: nothing about any other player ever appears.
    expect(JSON.stringify(body)).not.toContain("player-2");
  });

  it("re-editing the same match upserts again rather than erroring on the unique constraint", async () => {
    await POST(request({ matchId: "match-1", homeScore: 1, awayScore: 1 }));
    await POST(request({ matchId: "match-1", homeScore: 3, awayScore: 0 }));

    expect(picksUpsertMock).toHaveBeenCalledTimes(2);
    expect(picksUpsertMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ pred_home_score: 3, pred_away_score: 0 }),
      { onConflict: "player_id,match_id" },
    );
  });

  it("treats a stale/unresolvable session player id as not logged in", async () => {
    resolveCompetitionIdMock.mockResolvedValue(null);
    const response = await POST(
      request({ matchId: "match-1", homeScore: 2, awayScore: 1 }),
    );
    expect(response.status).toBe(401);
    expect(gameweeksSelectMock).not.toHaveBeenCalled();
  });
});
