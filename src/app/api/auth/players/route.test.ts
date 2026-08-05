import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashSecret } from "@/lib/auth/scrypt-secret";

const competitionsSelectMock = vi.fn();
const playersSelectChain = {
  eq: vi.fn().mockReturnThis(),
  order: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => ({
    from: (table: string) => {
      if (table === "competitions") {
        return { select: competitionsSelectMock };
      }
      if (table === "players") {
        return { select: () => playersSelectChain };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

const { GET } = await import("./route");

describe("GET /api/auth/players", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    playersSelectChain.eq.mockReturnThis();
  });

  it("returns 403 when the competition code doesn't resolve to any competition", async () => {
    competitionsSelectMock.mockResolvedValue({
      data: [{ id: "comp-1", code_hash: await hashSecret("real-code") }],
    });

    const request = new Request("http://localhost/api/auth/players", {
      headers: { "x-competition-code": "wrong-code" },
    });
    const response = await GET(request);

    expect(response.status).toBe(403);
  });

  it("scopes the players query to the resolved competition_id", async () => {
    const codeHash = await hashSecret("real-code");
    competitionsSelectMock.mockResolvedValue({
      data: [{ id: "comp-1", code_hash: codeHash }],
    });
    playersSelectChain.order.mockResolvedValue({
      data: [{ display_name: "Andy", emoji: "⚽" }],
      error: null,
    });

    const request = new Request("http://localhost/api/auth/players", {
      headers: { "x-competition-code": "real-code" },
    });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(playersSelectChain.eq).toHaveBeenCalledWith(
      "competition_id",
      "comp-1",
    );
    expect(playersSelectChain.eq).toHaveBeenCalledWith("is_bot", false);
    expect(body.players).toEqual([{ displayName: "Andy", emoji: "⚽" }]);
  });
});
