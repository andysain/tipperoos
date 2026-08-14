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

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => ({
    from: (table: string) => {
      if (table === "matches") {
        return { select: matchesSelectMock, update: matchesUpdateMock };
      }
      if (table === "sync_log") {
        return { insert: syncLogInsertMock };
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
      expect.objectContaining({ status: "success" }),
    );

    vi.unstubAllGlobals();
  });
});
