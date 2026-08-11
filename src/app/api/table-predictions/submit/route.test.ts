import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionPlayerIdMock = vi.fn();

const playersSelectChain = {
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
};
const playersSelectMock = vi.fn(() => playersSelectChain);

const seasonsSelectChain = {
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
};
const seasonsSelectMock = vi.fn(() => seasonsSelectChain);

const matchesSelectChain = {
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
};
const matchesSelectMock = vi.fn(() => matchesSelectChain);

const tablePredictionsSelectChain = {
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
};
const tablePredictionsSelectMock = vi.fn(() => tablePredictionsSelectChain);

const tablePredictionsUpdateChain = {
  eq: vi.fn(),
};
const tablePredictionsUpdateMock = vi.fn(() => tablePredictionsUpdateChain);

vi.mock("@/app/_lib/session-cookie", () => ({
  getSessionPlayerId: () => getSessionPlayerIdMock(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => ({
    from: (table: string) => {
      if (table === "players") {
        return { select: playersSelectMock };
      }
      if (table === "seasons") {
        return { select: seasonsSelectMock };
      }
      if (table === "matches") {
        return { select: matchesSelectMock };
      }
      if (table === "table_predictions") {
        return {
          select: tablePredictionsSelectMock,
          update: tablePredictionsUpdateMock,
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

const { POST } = await import("./route");

const FAR_PAST_JOIN = "2020-01-01T00:00:00.000Z";
const FAR_FUTURE_KICKOFF = "2099-01-01T00:00:00.000Z";

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
    playersSelectChain.eq.mockReturnThis();
    seasonsSelectChain.eq.mockReturnThis();
    matchesSelectChain.eq.mockReturnThis();
    matchesSelectChain.order.mockReturnThis();
    matchesSelectChain.limit.mockReturnThis();

    getSessionPlayerIdMock.mockResolvedValue("player-1");
    playersSelectChain.maybeSingle.mockResolvedValue({
      data: { id: "player-1", joined_at: FAR_PAST_JOIN },
      error: null,
    });
    seasonsSelectChain.maybeSingle.mockResolvedValue({
      data: { id: "season-1" },
      error: null,
    });
    matchesSelectChain.maybeSingle.mockResolvedValue({
      data: { kickoff_time: FAR_FUTURE_KICKOFF },
      error: null,
    });
    tablePredictionsSelectChain.maybeSingle.mockResolvedValue({
      data: { id: "prediction-1" },
      error: null,
    });
    tablePredictionsUpdateChain.eq.mockResolvedValue({ error: null });
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

  it("rejects submitting after Gameweek 1's first kickoff", async () => {
    matchesSelectChain.maybeSingle.mockResolvedValue({
      data: { kickoff_time: new Date(Date.now() - 60 * 1000).toISOString() },
      error: null,
    });
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe(
      "Predict the Table has locked now that Gameweek 1 has kicked off.",
    );
    expect(tablePredictionsUpdateMock).not.toHaveBeenCalled();
  });

  it("rejects submitting when no prediction row exists yet", async () => {
    tablePredictionsSelectChain.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Sort some teams into Bands before submitting.");
    expect(tablePredictionsUpdateMock).not.toHaveBeenCalled();
  });

  it("succeeds and sets submitted_at even with a wrongly-sized (untidy) Band", async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(tablePredictionsUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ is_skipped: false }),
    );
    expect(tablePredictionsUpdateChain.eq).toHaveBeenCalledWith(
      "id",
      "prediction-1",
    );
    expect(body.submittedAt).toBeDefined();
  });
});
