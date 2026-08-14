import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionPlayerIdMock = vi.fn();
const resolveCompetitionIdMock = vi.fn();

const gameweeksSelectChain = {
  eq: vi.fn().mockReturnThis(),
  or: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
};
const gameweeksSelectMock = vi.fn(() => gameweeksSelectChain);

const matchesSelectChain = {
  eq: vi.fn().mockReturnThis(),
  single: vi.fn(),
};
const matchesSelectMock = vi.fn(() => matchesSelectChain);

const picksUpsertChain = {
  select: vi.fn().mockReturnThis(),
  single: vi.fn(),
};
const picksUpsertMock = vi.fn(() => picksUpsertChain);

vi.mock("@/app/_lib/session-cookie", () => ({
  getSessionPlayerId: () => getSessionPlayerIdMock(),
}));

vi.mock("@/lib/competitions/scope", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/competitions/scope")>();
  return {
    ...actual,
    resolveCompetitionId: (...args: unknown[]) =>
      resolveCompetitionIdMock(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => ({
    from: (table: string) => {
      if (table === "gameweeks") {
        return { select: gameweeksSelectMock };
      }
      if (table === "matches") {
        return { select: matchesSelectMock };
      }
      if (table === "picks") {
        return { upsert: picksUpsertMock };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

const { POST } = await import("./route");

const MATCH_1 = "11111111-1111-1111-1111-111111111111";
const OTHER_COMP_MATCH = "33333333-3333-3333-3333-333333333333";
const FAR_FUTURE_KICKOFF = "2099-01-01T00:00:00.000Z";

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
    gameweeksSelectChain.or.mockReturnThis();
    gameweeksSelectChain.order.mockReturnThis();
    matchesSelectChain.eq.mockReturnThis();
    getSessionPlayerIdMock.mockResolvedValue("player-1");
    resolveCompetitionIdMock.mockResolvedValue("comp-1");
    gameweeksSelectChain.maybeSingle.mockResolvedValue({
      data: { id: "gw-1" },
      error: null,
    });
    matchesSelectChain.single.mockResolvedValue({
      data: { kickoff_time: FAR_FUTURE_KICKOFF },
      error: null,
    });
    picksUpsertChain.single.mockResolvedValue({
      data: {
        id: "pick-1",
        match_id: MATCH_1,
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
        { matchId: MATCH_1, homeScore: 2, awayScore: 1 },
        { csrf: false },
      ),
    );
    expect(response.status).toBe(403);
    expect(getSessionPlayerIdMock).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request", async () => {
    getSessionPlayerIdMock.mockResolvedValue(null);
    const response = await POST(
      request({ matchId: MATCH_1, homeScore: 2, awayScore: 1 }),
    );
    expect(response.status).toBe(401);
  });

  it("rejects a matchId that isn't a well-formed uuid before touching the database", async () => {
    const response = await POST(
      request({ matchId: "match-1", homeScore: 2, awayScore: 1 }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("That match isn't a currently tipped match.");
    expect(gameweeksSelectMock).not.toHaveBeenCalled();
  });

  it("rejects out-of-range or non-integer scores independent of any client cap", async () => {
    const tooHigh = await POST(
      request({ matchId: MATCH_1, homeScore: 10, awayScore: 1 }),
    );
    expect(tooHigh.status).toBe(400);

    const negative = await POST(
      request({ matchId: MATCH_1, homeScore: -1, awayScore: 1 }),
    );
    expect(negative.status).toBe(400);

    const notInteger = await POST(
      request({ matchId: MATCH_1, homeScore: 1.5, awayScore: 1 }),
    );
    expect(notInteger.status).toBe(400);

    expect(picksUpsertMock).not.toHaveBeenCalled();
  });

  it("rejects a matchId that isn't a currently tipped match for the caller's competition", async () => {
    gameweeksSelectChain.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    const response = await POST(
      request({ matchId: MATCH_1, homeScore: 2, awayScore: 1 }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(picksUpsertMock).not.toHaveBeenCalled();
    expect(body.error).toBe("That match isn't a currently tipped match.");
  });

  it("scopes the gameweeks lookup to the caller's own competition and filters on the submitted matchId", async () => {
    await POST(request({ matchId: MATCH_1, homeScore: 2, awayScore: 1 }));
    expect(gameweeksSelectChain.eq).toHaveBeenCalledWith(
      "competition_id",
      "comp-1",
    );
    expect(gameweeksSelectChain.or).toHaveBeenCalledWith(
      `match_1_id.eq.${MATCH_1},match_2_id.eq.${MATCH_1}`,
    );
  });

  it("runs the membership check and the kickoff-time lookup in parallel, not serially", async () => {
    // Both come from the same matchId, neither depends on the other's
    // result -- see PERFORMANCE_TESTING_STANDARD.md item #3. The match
    // lookup still fires even on a non-member matchId (the parallel wave
    // has already been kicked off before the membership result is known);
    // its result is simply unused when membership fails.
    gameweeksSelectChain.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    const response = await POST(
      request({ matchId: OTHER_COMP_MATCH, homeScore: 2, awayScore: 1 }),
    );

    expect(response.status).toBe(400);
    expect(matchesSelectMock).toHaveBeenCalled();
    expect(picksUpsertMock).not.toHaveBeenCalled();
  });

  it("upserts on (player_id, match_id) and returns only the caller's own pick, camelCased", async () => {
    const response = await POST(
      request({ matchId: MATCH_1, homeScore: 2, awayScore: 1 }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(picksUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        player_id: "player-1",
        match_id: MATCH_1,
        pred_home_score: 2,
        pred_away_score: 1,
      }),
      { onConflict: "player_id,match_id" },
    );
    expect(body).toEqual({
      id: "pick-1",
      matchId: MATCH_1,
      predHomeScore: 2,
      predAwayScore: 1,
      updatedAt: "2026-08-09T00:00:00.000Z",
    });
    // Own-pick-only: nothing about any other player ever appears.
    expect(JSON.stringify(body)).not.toContain("player-2");
  });

  it("re-editing the same match upserts again rather than erroring on the unique constraint", async () => {
    await POST(request({ matchId: MATCH_1, homeScore: 1, awayScore: 1 }));
    await POST(request({ matchId: MATCH_1, homeScore: 3, awayScore: 0 }));

    expect(picksUpsertMock).toHaveBeenCalledTimes(2);
    expect(picksUpsertMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ pred_home_score: 3, pred_away_score: 0 }),
      { onConflict: "player_id,match_id" },
    );
  });

  it("treats a stale/unresolvable session player id as not logged in", async () => {
    resolveCompetitionIdMock.mockResolvedValue(null);
    const response = await POST(
      request({ matchId: MATCH_1, homeScore: 2, awayScore: 1 }),
    );
    expect(response.status).toBe(401);
    expect(gameweeksSelectMock).not.toHaveBeenCalled();
  });

  it("rejects a save exactly at the 5-minute lock boundary", async () => {
    matchesSelectChain.single.mockResolvedValue({
      data: {
        kickoff_time: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      },
      error: null,
    });
    const response = await POST(
      request({ matchId: MATCH_1, homeScore: 2, awayScore: 1 }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Picks lock 5 minutes before kickoff.");
    expect(picksUpsertMock).not.toHaveBeenCalled();
  });

  it("rejects a save after kickoff", async () => {
    matchesSelectChain.single.mockResolvedValue({
      data: { kickoff_time: new Date(Date.now() - 60 * 1000).toISOString() },
      error: null,
    });
    const response = await POST(
      request({ matchId: MATCH_1, homeScore: 2, awayScore: 1 }),
    );

    expect(response.status).toBe(403);
    expect(picksUpsertMock).not.toHaveBeenCalled();
  });

  it("still accepts a save just before the lock boundary", async () => {
    matchesSelectChain.single.mockResolvedValue({
      data: {
        kickoff_time: new Date(Date.now() + 5 * 60 * 1000 + 1000).toISOString(),
      },
      error: null,
    });
    const response = await POST(
      request({ matchId: MATCH_1, homeScore: 2, awayScore: 1 }),
    );

    expect(response.status).toBe(200);
    expect(picksUpsertMock).toHaveBeenCalledOnce();
  });

  it("looks up the match's kickoff time by the submitted matchId", async () => {
    await POST(request({ matchId: MATCH_1, homeScore: 2, awayScore: 1 }));

    expect(matchesSelectChain.eq).toHaveBeenCalledWith("id", MATCH_1);
  });
});
