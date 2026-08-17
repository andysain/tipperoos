import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashSecret } from "@/lib/auth/scrypt-secret";

const competitionsSelectMock = vi.fn();
const lookupChain = {
  eq: vi.fn().mockReturnThis(),
  ilike: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
};
const updateChain = {
  eq: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
};
const updateMock = vi.fn(() => updateChain);

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => ({
    from: (table: string) => {
      if (table === "competitions") {
        return { select: competitionsSelectMock };
      }
      if (table === "players") {
        return {
          select: () => lookupChain,
          update: updateMock,
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
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-tipperoos-client": "1",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lookupChain.eq.mockReturnThis();
    lookupChain.ilike.mockReturnThis();
    updateChain.eq.mockReturnThis();
    updateChain.select.mockReturnThis();
  });

  it("returns 403 (not a generic 401) when the competition code doesn't resolve, without ever looking up a player", async () => {
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
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Invalid competition code.");
    expect(lookupChain.maybeSingle).not.toHaveBeenCalled();
  });

  it("scopes the player lookup to the resolved competition_id, not a global lookup", async () => {
    competitionsSelectMock.mockResolvedValue({
      data: [{ id: "comp-1", code_hash: await hashSecret("real-code") }],
    });
    const pinHash = await hashSecret("1234");
    lookupChain.maybeSingle.mockResolvedValue({
      data: {
        id: "player-1",
        display_name: "Andy",
        emoji: "⚽",
        pin_hash: pinHash,
        failed_pin_attempts: 0,
        locked_until: null,
        pin_reset_required: false,
      },
      error: null,
    });
    updateChain.maybeSingle.mockResolvedValue({
      data: { failed_pin_attempts: 0, locked_until: null },
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

    expect(response.status).toBe(200);
    expect(lookupChain.eq).toHaveBeenCalledWith("competition_id", "comp-1");
    expect(body.displayName).toBe("Andy");
  });

  // Issue #35 made bots real `players` rows with a pin_hash. They are not
  // login surfaces: /api/auth/players already hid them from the roster, and
  // this makes it structural rather than resting on their throwaway secret
  // being unguessable.
  it("excludes bots from the player lookup", async () => {
    competitionsSelectMock.mockResolvedValue({
      data: [{ id: "comp-1", code_hash: await hashSecret("real-code") }],
    });
    lookupChain.maybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await POST(
      request({
        competitionCode: "real-code",
        displayName: "Median Bot",
        pin: "1234",
      }),
    );
    const body = await response.json();

    expect(lookupChain.eq).toHaveBeenCalledWith("is_bot", false);
    // Indistinguishable from any other unknown name -- no oracle telling an
    // attacker that "Median Bot" exists but is filtered.
    expect(response.status).toBe(401);
    expect(body.error).toBe("Incorrect display name or PIN.");
    expect(updateMock).not.toHaveBeenCalled();
  });
});
