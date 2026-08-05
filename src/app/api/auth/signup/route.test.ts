import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashSecret } from "@/lib/auth/scrypt-secret";

const competitionsSelectMock = vi.fn();
const existingLookupChain = {
  eq: vi.fn().mockReturnThis(),
  ilike: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
};
const insertSelectChain = { single: vi.fn() };
const insertMock = vi.fn(() => ({ select: () => insertSelectChain }));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => ({
    from: (table: string) => {
      if (table === "competitions") {
        return { select: competitionsSelectMock };
      }
      if (table === "players") {
        return {
          select: () => existingLookupChain,
          insert: insertMock,
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

vi.mock("@/app/_lib/session-cookie", () => ({
  setSessionCookie: vi.fn(),
}));

const { POST } = await import("./route");

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/auth/signup", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-tipperoos-client": "1",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existingLookupChain.eq.mockReturnThis();
    existingLookupChain.ilike.mockReturnThis();
  });

  it("returns 403 when the competition code doesn't resolve", async () => {
    competitionsSelectMock.mockResolvedValue({
      data: [{ id: "comp-1", code_hash: await hashSecret("real-code") }],
    });

    const response = await POST(
      request({
        competitionCode: "wrong-code",
        displayName: "Andy",
        pin: "1234",
      }),
    );

    expect(response.status).toBe(403);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("scopes the display-name uniqueness check and the insert to the resolved competition_id", async () => {
    competitionsSelectMock.mockResolvedValue({
      data: [{ id: "comp-1", code_hash: await hashSecret("real-code") }],
    });
    existingLookupChain.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    insertSelectChain.single.mockResolvedValue({
      data: { id: "player-1", display_name: "Andy", emoji: null },
      error: null,
    });

    const response = await POST(
      request({
        competitionCode: "real-code",
        displayName: "Andy",
        pin: "1234",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(existingLookupChain.eq).toHaveBeenCalledWith(
      "competition_id",
      "comp-1",
    );
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ competition_id: "comp-1" }),
    );
    expect(body.displayName).toBe("Andy");
  });
});
