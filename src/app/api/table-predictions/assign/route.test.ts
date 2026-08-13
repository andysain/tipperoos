import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionPlayerIdMock = vi.fn();
const rpcMock = vi.fn();

vi.mock("@/app/_lib/session-cookie", () => ({
  getSessionPlayerId: () => getSessionPlayerIdMock(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => ({ rpc: rpcMock }),
}));

const { POST } = await import("./route");

function request(body: unknown) {
  return new Request("http://localhost/api/table-predictions/assign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tipperoos-client": "1",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/table-predictions/assign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionPlayerIdMock.mockResolvedValue("player-1");
    rpcMock.mockResolvedValue({ data: [{ result: "saved" }], error: null });
  });

  it("rejects an on-time edit at the fixed deadline", async () => {
    rpcMock.mockResolvedValue({ data: [{ result: "locked" }], error: null });

    const response = await POST(
      request({ teamId: "team-1", band: "champion" }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Predict the Table is locked after 31 August.");
  });

  it("saves an assignment through the transactional RPC", async () => {
    const response = await POST(
      request({ teamId: "team-1", band: "champion" }),
    );

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("table_prediction_assign", {
      p_player_id: "player-1",
      p_team_id: "team-1",
      p_band: "champion",
    });
  });
});
