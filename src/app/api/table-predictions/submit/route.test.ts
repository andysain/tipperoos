import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionPlayerIdMock = vi.fn();

const rpcMock = vi.fn();

vi.mock("@/app/_lib/session-cookie", () => ({
  getSessionPlayerId: () => getSessionPlayerIdMock(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => ({
    rpc: rpcMock,
  }),
}));

const { POST } = await import("./route");

function request({ csrf = true }: { csrf?: boolean } = {}) {
  return new Request("http://localhost/api/table-predictions/submit", {
    method: "POST",
    headers: {
      ...(csrf ? { "x-tipperoos-client": "1" } : {}),
    },
  });
}

describe("POST /api/table-predictions/submit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionPlayerIdMock.mockResolvedValue("player-1");
    rpcMock.mockResolvedValue({
      data: [{ result: "saved", submitted_at: "2026-08-13T10:00:00.000Z" }],
      error: null,
    });
  });

  it("rejects a request with no CSRF header", async () => {
    const response = await POST(request({ csrf: false }));
    expect(response.status).toBe(403);
    expect(getSessionPlayerIdMock).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request", async () => {
    getSessionPlayerIdMock.mockResolvedValue(null);
    const response = await POST(request());
    expect(response.status).toBe(401);
  });

  it("rejects submitting at the fixed deadline", async () => {
    rpcMock.mockResolvedValue({
      data: [{ result: "locked", submitted_at: null }],
      error: null,
    });
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Predict the Table is locked after 31 August.");
    expect(rpcMock).toHaveBeenCalledOnce();
  });

  it("rejects submitting when no prediction row exists yet", async () => {
    rpcMock.mockResolvedValue({
      data: [{ result: "no_prediction", submitted_at: null }],
      error: null,
    });
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Sort some teams into Bands before submitting.");
    expect(rpcMock).toHaveBeenCalledOnce();
  });

  it("succeeds and sets submitted_at even with a wrongly-sized (untidy) Band", async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith(
      "table_prediction_submit",
      expect.objectContaining({ p_player_id: "player-1" }),
    );
    expect(body.submittedAt).toBe("2026-08-13T10:00:00.000Z");
  });
});
