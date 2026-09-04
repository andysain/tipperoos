import { beforeEach, describe, expect, it, vi } from "vitest";

// Branch test for POST /api/admin/players/clear-lockout (issue #201;
// docs/admin-ui-spec.md §4; TESTING_STANDARD.md §1 names lockout logic and
// admin actions).

const mockRequireAdmin = vi.fn();

const updateChain = {
  eq: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
};
const updateMock = vi.fn((_patch: Record<string, unknown>) => updateChain);

vi.mock("@/app/_lib/admin-access", () => ({
  requireAdmin: mockRequireAdmin,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => ({
    from: (table: string) => {
      if (table === "players") return { update: updateMock };
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

const { POST } = await import("./route");

const TARGET = "22222222-2222-4222-8222-222222222222";

function request(
  body: unknown,
  { csrf = true }: { csrf?: boolean } = {},
): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (csrf) headers["x-tipperoos-client"] = "1";
  return new Request("http://localhost/api/admin/players/clear-lockout", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  updateChain.eq.mockReturnThis();
  updateChain.select.mockReturnThis();
  updateChain.maybeSingle.mockResolvedValue({ data: { id: TARGET }, error: null });
  mockRequireAdmin.mockResolvedValue({
    playerId: "admin-1",
    competitionId: "comp-1",
  });
});

describe("POST /api/admin/players/clear-lockout", () => {
  it("returns a bodyless 404 for a non-admin session, before the CSRF check", async () => {
    mockRequireAdmin.mockResolvedValue(null);
    const res = await POST(request({ playerId: TARGET }, { csrf: false }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns 403 for an admin with no CSRF header", async () => {
    const res = await POST(request({ playerId: TARGET }, { csrf: false }));
    expect(res.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-JSON body", async () => {
    const res = await POST(request("not json{"));
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns a bodyless 404 for a missing or malformed playerId", async () => {
    expect((await POST(request({}))).status).toBe(404);
    const res = await POST(request({ playerId: "nope" }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns a bodyless 404 when the target is in another competition (no row matched)", async () => {
    updateChain.maybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await POST(request({ playerId: TARGET }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
  });

  it("returns 500 if the update reports an error", async () => {
    updateChain.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    const res = await POST(request({ playerId: TARGET }));
    expect(res.status).toBe(500);
  });

  it("clears the lockout fields without touching the PIN, scoped to the admin's competition", async () => {
    const res = await POST(request({ playerId: TARGET }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    expect(updateMock).toHaveBeenCalledTimes(1);
    const patch = updateMock.mock.calls[0][0];
    expect(patch).toEqual({ failed_pin_attempts: 0, locked_until: null });
    expect(patch).not.toHaveProperty("pin_hash");

    expect(updateChain.eq).toHaveBeenCalledWith("id", TARGET);
    expect(updateChain.eq).toHaveBeenCalledWith("competition_id", "comp-1");
    expect(updateChain.eq).toHaveBeenCalledWith("is_bot", false);
  });

  it("is idempotent — a match on an already-unlocked player is still 200 ok", async () => {
    // #200 hides the button when unlocked; the route must not depend on it.
    updateChain.maybeSingle.mockResolvedValue({
      data: { id: TARGET },
      error: null,
    });
    const res = await POST(request({ playerId: TARGET }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
