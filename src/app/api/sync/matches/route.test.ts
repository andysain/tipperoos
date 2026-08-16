import { beforeEach, describe, expect, it, vi } from "vitest";

// Issue #12: pins down the failure-isolation behavior #152 introduced --
// a failed sync must log to sync_log and must never touch existing
// matches rows. See #12's decision log for why this route (not
// standings) is the target.

const matchesSelectChain = {
  eq: vi.fn().mockReturnThis(),
};
const matchesSelectMock = vi.fn(() => matchesSelectChain);
const matchesUpdateEqMock = vi.fn();
const matchesUpdateMock = vi.fn(() => ({ eq: matchesUpdateEqMock }));
const syncLogInsertMock = vi.fn();

// Issue #166: the route now also calls scoreCompletedMatchesAndSnapshots,
// which queries "gameweeks" via `select(...).in(...)` twice per cycle (once
// for match_1_id, once for match_2_id). Defaults to "no gameweek references
// this match" (empty result) -- the realistic case for an untipped fixture,
// and what lets scoreCompletedMatchesAndSnapshots no-op cleanly without
// needing every downstream table mocked for tests that don't care about it.
const gameweeksInMock = vi.fn().mockResolvedValue({ data: [], error: null });
const gameweeksSelectMock = vi.fn(() => ({ in: gameweeksInMock }));

// Issue #35: the route also generates bot picks every cycle. Mocked at the
// module boundary rather than through the fake client above -- the
// orchestrator's own behaviour is covered by src/lib/bots/generate.test.ts,
// and what this file is for is the route's isolation contract: whose
// sync_log row a failure lands in, and whose it must not. Defaults to
// "nothing to generate", the common case.
const generateBotPicksMock = vi.fn().mockResolvedValue(0);
vi.mock("@/lib/bots/generate", () => ({
  generateBotPicks: (...args: unknown[]) => generateBotPicksMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => ({
    from: (table: string) => {
      if (table === "matches") {
        return { select: matchesSelectMock, update: matchesUpdateMock };
      }
      if (table === "sync_log") {
        return { insert: syncLogInsertMock };
      }
      if (table === "gameweeks") {
        return { select: gameweeksSelectMock };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

const { POST } = await import("./route");

const SECRET = "test-secret";
const MATCH_1 = "11111111-1111-1111-1111-111111111111";

function request() {
  return new Request("http://localhost/api/sync/matches", {
    method: "POST",
    headers: { "x-sync-secret": SECRET },
  });
}

describe("POST /api/sync/matches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SYNC_TRIGGER_SECRET = SECRET;
    process.env.FOOTBALL_DATA_API_KEY = "test-api-key";
    matchesSelectChain.eq.mockReturnThis();
    matchesSelectChain.eq.mockResolvedValue({
      data: [{ id: MATCH_1, provider_match_id: "999" }],
      error: null,
    });
    matchesUpdateEqMock.mockResolvedValue({ error: null });
    syncLogInsertMock.mockResolvedValue({ error: null });
    gameweeksInMock.mockResolvedValue({ data: [], error: null });
    generateBotPicksMock.mockResolvedValue(0);
  });

  it("logs a sync_log failure and leaves existing matches rows untouched when the provider fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => "provider unavailable",
      }),
    );

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(matchesUpdateMock).not.toHaveBeenCalled();
    expect(syncLogInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider_name: "football-data.org",
        sync_type: "matches",
        status: "failure",
        error_message: expect.stringContaining("503"),
      }),
    );

    vi.unstubAllGlobals();
  });

  it("logs a sync_log failure and leaves existing matches rows untouched when the update itself errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          matches: [
            {
              id: 999,
              utcDate: "2026-08-20T15:00:00.000Z",
              status: "FINISHED",
              homeTeam: { id: 1 },
              awayTeam: { id: 2 },
              score: { fullTime: { home: 2, away: 1 } },
            },
          ],
        }),
      }),
    );
    matchesUpdateEqMock.mockResolvedValue({
      error: new Error("connection reset"),
    });

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(syncLogInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failure",
        error_message: expect.stringContaining("connection reset"),
      }),
    );
    // The mock's error is what the route caught and turned into the
    // sync_log failure row above -- so the real Postgres UPDATE this
    // stands in for never committed either, and no second, successful
    // sync_log row follows it.
    expect(matchesUpdateEqMock).toHaveBeenCalledTimes(1);
    expect(syncLogInsertMock).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it("logs a sync_log success row and updates matches when the sync succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          matches: [
            {
              id: 999,
              utcDate: "2026-08-20T15:00:00.000Z",
              status: "FINISHED",
              homeTeam: { id: 1 },
              awayTeam: { id: 2 },
              score: { fullTime: { home: 2, away: 1 } },
            },
          ],
        }),
      }),
    );

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(matchesUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ team_a_score: 2, team_b_score: 1 }),
    );
    expect(syncLogInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ sync_type: "matches", status: "success" }),
    );
    // Issue #166: a completed match also produces its own "scoring"
    // sync_log entry, separate from the "matches" one above.
    expect(syncLogInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ sync_type: "scoring", status: "success" }),
    );
    const body = await response.json();
    expect(body.scoringError).toBeUndefined();

    vi.unstubAllGlobals();
  });

  // Issue #166: a cycle with no completed matches (the common case -- most
  // 10-15 minute ticks land between kickoffs) should never produce a
  // "scoring" sync_log row at all, not even a success one -- that would be
  // a log row every cycle for nothing to report.
  it("writes no scoring sync_log row when this cycle completed nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          matches: [
            {
              id: 999,
              utcDate: "2026-08-20T15:00:00.000Z",
              status: "TIMED",
              homeTeam: { id: 1 },
              awayTeam: { id: 2 },
              score: { fullTime: { home: null, away: null } },
            },
          ],
        }),
      }),
    );

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(syncLogInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ sync_type: "matches", status: "success" }),
    );
    expect(syncLogInsertMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ sync_type: "scoring" }),
    );
    expect(gameweeksSelectMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  // Issue #166 D5: a scoring/snapshot failure must never be mistaken for a
  // failure of the fixture/result sync itself -- the "matches" sync_log row
  // and the route's response status must stay exactly as they'd be on a
  // clean run, with the failure visible only in its own sync_log entry and
  // an optional response field.
  it("isolates a scoring pipeline failure from the matches sync's own success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          matches: [
            {
              id: 999,
              utcDate: "2026-08-20T15:00:00.000Z",
              status: "FINISHED",
              homeTeam: { id: 1 },
              awayTeam: { id: 2 },
              score: { fullTime: { home: 2, away: 1 } },
            },
          ],
        }),
      }),
    );
    gameweeksInMock.mockResolvedValueOnce({
      data: null,
      error: new Error("gameweeks lookup boom"),
    });

    const response = await POST(request());

    // The matches sync itself genuinely succeeded -- still 200, still its
    // own success log row, matches rows still updated.
    expect(response.status).toBe(200);
    expect(matchesUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ team_a_score: 2, team_b_score: 1 }),
    );
    expect(syncLogInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ sync_type: "matches", status: "success" }),
    );

    // The scoring failure's detail lands in its own sync_log entry, never
    // overwriting or blocking the "matches" row above. The response only
    // gets a generic marker -- the raw exception message (which can carry
    // constraint/column/row-identifier fragments) stays server-side only,
    // matching the outer catch's own "detail in sync_log, generic to
    // caller" convention.
    expect(syncLogInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sync_type: "scoring",
        status: "failure",
        error_message: expect.stringContaining("gameweeks lookup boom"),
      }),
    );
    const body = await response.json();
    expect(body.scoringError).toBe("Scoring failed -- see sync_log.");
    expect(body.scoringError).not.toContain("gameweeks lookup boom");

    vi.unstubAllGlobals();
  });

  // Issue #35 D3: the bot block sits OUTSIDE the scoring block's
  // `completedMatchIds.length > 0` gate. Random and 1-1 bots have to file
  // while their match is still days away -- gating bot generation on "a
  // match just finished" would mean bots only ever picked in cycles where
  // something happened to complete, which for a 2-match gameweek is almost
  // never before the deadline.
  it("generates bot picks on a cycle where nothing completed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          matches: [
            {
              id: 999,
              utcDate: "2026-08-20T15:00:00.000Z",
              status: "TIMED",
              homeTeam: { id: 1 },
              awayTeam: { id: 2 },
              score: { fullTime: { home: null, away: null } },
            },
          ],
        }),
      }),
    );
    generateBotPicksMock.mockResolvedValue(2);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(generateBotPicksMock).toHaveBeenCalledTimes(1);
    expect(syncLogInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ sync_type: "bots", status: "success" }),
    );
    // ...while scoring, correctly, stayed out of it.
    expect(syncLogInsertMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ sync_type: "scoring" }),
    );

    vi.unstubAllGlobals();
  });

  // Same "no success row when there was nothing to do" rule #166 settled for
  // scoring: most cycles have every bot pick already filed, and a success
  // row every 30 minutes would bury the entries that matter.
  it("writes no bots sync_log row when the cycle generated no picks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ matches: [] }),
      }),
    );
    generateBotPicksMock.mockResolvedValue(0);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(generateBotPicksMock).toHaveBeenCalledTimes(1);
    expect(syncLogInsertMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ sync_type: "bots" }),
    );

    vi.unstubAllGlobals();
  });

  // Issue #35 D3 / #166 D5: three independent failure domains in one
  // handler. A bot-generation failure must leave the "matches" row, the
  // "scoring" row and the HTTP status exactly as a clean run would.
  it("isolates a bot-generation failure from both the matches sync and scoring", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          matches: [
            {
              id: 999,
              utcDate: "2026-08-20T15:00:00.000Z",
              status: "FINISHED",
              homeTeam: { id: 1 },
              awayTeam: { id: 2 },
              score: { fullTime: { home: 2, away: 1 } },
            },
          ],
        }),
      }),
    );
    generateBotPicksMock.mockRejectedValue(new Error("bot upsert boom"));

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(matchesUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ team_a_score: 2, team_b_score: 1 }),
    );
    expect(syncLogInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ sync_type: "matches", status: "success" }),
    );
    // Scoring still ran, and still succeeded, despite the bot failure
    // immediately before it.
    expect(syncLogInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ sync_type: "scoring", status: "success" }),
    );
    expect(syncLogInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sync_type: "bots",
        status: "failure",
        error_message: expect.stringContaining("bot upsert boom"),
      }),
    );

    const body = await response.json();
    expect(body.botsError).toBe("Bot pick generation failed -- see sync_log.");
    expect(body.botsError).not.toContain("bot upsert boom");
    expect(body.scoringError).toBeUndefined();

    vi.unstubAllGlobals();
  });
});
