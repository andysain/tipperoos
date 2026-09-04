import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifySecret } from "@/lib/auth/scrypt-secret";

// Branch test for the forced-PIN-reset write (issue #36; TESTING_STANDARD.md
// §1 names PIN hashing/lockout logic test-first-no-exceptions). The
// primitives (hashSecret, validatePinFormat) are already golden-value tested
// under src/lib/auth/ -- this covers the route's own branching and the
// post-reset invariant.

const lookupChain = {
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
};
const updateChain = {
  eq: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
};
const updateMock = vi.fn((_payload: Record<string, unknown>) => updateChain);
const mockGetSessionPlayerId = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => ({
    from: (table: string) => {
      if (table === "players") {
        return { select: () => lookupChain, update: updateMock };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

vi.mock("@/app/_lib/session-cookie", () => ({
  getSessionPlayerId: mockGetSessionPlayerId,
}));

const { POST } = await import("./route");

function request(
  body: unknown,
  { csrf = true }: { csrf?: boolean } = {},
): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (csrf) headers["x-tipperoos-client"] = "1";
  return new Request("http://localhost/api/auth/set-pin", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function pendingReset() {
  lookupChain.maybeSingle.mockResolvedValue({
    data: { id: "player-1", pin_reset_required: true },
    error: null,
  });
  updateChain.maybeSingle.mockResolvedValue({
    data: { id: "player-1" },
    error: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  lookupChain.eq.mockReturnThis();
  lookupChain.order.mockReturnThis();
  lookupChain.limit.mockReturnThis();
  updateChain.eq.mockReturnThis();
  updateChain.select.mockReturnThis();
  mockGetSessionPlayerId.mockResolvedValue("player-1");
});

describe("POST /api/auth/set-pin", () => {
  it("rejects a request with no CSRF header (403), before any session or DB work", async () => {
    const res = await POST(request({ pin: "4321" }, { csrf: false }));
    expect(res.status).toBe(403);
    expect(mockGetSessionPlayerId).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects when there is no session (401)", async () => {
    mockGetSessionPlayerId.mockResolvedValue(null);
    const res = await POST(request({ pin: "4321" }));
    expect(res.status).toBe(401);
  });

  it("rejects a non-JSON body (400)", async () => {
    const res = await POST(request("not json{"));
    expect(res.status).toBe(400);
  });

  it("rejects a missing or non-string pin (400)", async () => {
    expect((await POST(request({}))).status).toBe(400);
    expect((await POST(request({ pin: 4321 }))).status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects a wrongly-formatted pin (400)", async () => {
    expect((await POST(request({ pin: "12" }))).status).toBe(400);
    expect((await POST(request({ pin: "12ab" }))).status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects (403) when the session player has no pending reset", async () => {
    lookupChain.maybeSingle.mockResolvedValue({
      data: { id: "player-1", pin_reset_required: false },
      error: null,
    });
    const res = await POST(request({ pin: "4321" }));
    expect(res.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("sets the new PIN and clears the flag + lockout on the happy path", async () => {
    pendingReset();
    const res = await POST(request({ pin: "4321" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    expect(updateMock).toHaveBeenCalledTimes(1);
    const payload = updateMock.mock.calls[0][0];
    expect(payload.pin_reset_required).toBe(false);
    expect(payload.failed_pin_attempts).toBe(0);
    expect(payload.locked_until).toBeNull();
    expect(typeof payload.pin_hash).toBe("string");
    expect(updateChain.eq).toHaveBeenCalledWith("id", "player-1");
    // The atomic guard: the write only lands while the flag is still set.
    expect(updateChain.eq).toHaveBeenCalledWith("pin_reset_required", true);
  });

  it("returns 409 when the guarded update matches no row (flag cleared between check and write)", async () => {
    lookupChain.maybeSingle.mockResolvedValue({
      data: { id: "player-1", pin_reset_required: true },
      error: null,
    });
    updateChain.maybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await POST(request({ pin: "4321" }));
    expect(res.status).toBe(409);
  });

  it("writes a hash that verifies the new PIN but not the old/temporary one (post-reset invariant)", async () => {
    pendingReset();
    await POST(request({ pin: "4321" }));
    const payload = updateMock.mock.calls[0][0];
    const stored = payload.pin_hash as string;

    expect(await verifySecret("4321", stored)).toBe(true);
    expect(await verifySecret("0000", stored)).toBe(false);
  });

  it("returns 500 if the update reports an error", async () => {
    lookupChain.maybeSingle.mockResolvedValue({
      data: { id: "player-1", pin_reset_required: true },
      error: null,
    });
    updateChain.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    const res = await POST(request({ pin: "4321" }));
    expect(res.status).toBe(500);
  });
});
