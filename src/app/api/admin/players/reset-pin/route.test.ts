import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifySecret } from "@/lib/auth/scrypt-secret";

// Branch test for the first mutating /api/admin/* route (issue #201;
// docs/admin-ui-spec.md §4; TESTING_STANDARD.md §1 names PIN/lockout logic
// and admin actions). Lives under src/app/** so §1a's golden-value guard
// doesn't apply; the PIN primitives are already covered under src/lib/auth/.

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

const TARGET = "11111111-1111-4111-8111-111111111111";

function request(
  body: unknown,
  { csrf = true }: { csrf?: boolean } = {},
): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (csrf) headers["x-tipperoos-client"] = "1";
  return new Request("http://localhost/api/admin/players/reset-pin", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function rowMatched() {
  updateChain.maybeSingle.mockResolvedValue({
    data: { id: TARGET },
    error: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  updateChain.eq.mockReturnThis();
  updateChain.select.mockReturnThis();
  mockRequireAdmin.mockResolvedValue({
    playerId: "admin-1",
    competitionId: "comp-1",
  });
});

describe("POST /api/admin/players/reset-pin", () => {
  it("returns a bodyless 404 for a non-admin session, before the CSRF check", async () => {
    mockRequireAdmin.mockResolvedValue(null);
    const res = await POST(
      request({ playerId: TARGET, pin: "4321", pinConfirm: "4321" }, { csrf: false }),
    );
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns 403 for an admin with no CSRF header", async () => {
    const res = await POST(
      request({ playerId: TARGET, pin: "4321", pinConfirm: "4321" }, { csrf: false }),
    );
    expect(res.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-JSON body", async () => {
    const res = await POST(request("not json{"));
    expect(res.status).toBe(400);
  });

  it("returns a bodyless 404 for a missing or malformed playerId", async () => {
    expect((await POST(request({ pin: "4321", pinConfirm: "4321" }))).status).toBe(404);
    const res = await POST(
      request({ playerId: "not-a-uuid", pin: "4321", pinConfirm: "4321" }),
    );
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the two PINs don't match", async () => {
    const res = await POST(
      request({ playerId: TARGET, pin: "4321", pinConfirm: "1234" }),
    );
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a wrongly-formatted PIN", async () => {
    expect(
      (await POST(request({ playerId: TARGET, pin: "12", pinConfirm: "12" })))
        .status,
    ).toBe(400);
    expect(
      (
        await POST(
          request({ playerId: TARGET, pin: "12ab", pinConfirm: "12ab" }),
        )
      ).status,
    ).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns a bodyless 404 when the target is in another competition (no row matched)", async () => {
    updateChain.maybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await POST(
      request({ playerId: TARGET, pin: "4321", pinConfirm: "4321" }),
    );
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
  });

  it("returns 500 if the update reports an error", async () => {
    updateChain.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    const res = await POST(
      request({ playerId: TARGET, pin: "4321", pinConfirm: "4321" }),
    );
    expect(res.status).toBe(500);
  });

  it("on the happy path sets a fresh hash, the reset flag, and clears lockout — scoped to the admin's competition", async () => {
    rowMatched();
    const res = await POST(
      request({ playerId: TARGET, pin: "4321", pinConfirm: "4321" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    expect(updateMock).toHaveBeenCalledTimes(1);
    const patch = updateMock.mock.calls[0][0];
    expect(patch.pin_reset_required).toBe(true);
    expect(patch.failed_pin_attempts).toBe(0);
    expect(patch.locked_until).toBeNull();
    expect(typeof patch.pin_hash).toBe("string");
    expect(await verifySecret("4321", patch.pin_hash as string)).toBe(true);
    expect(await verifySecret("0000", patch.pin_hash as string)).toBe(false);

    expect(updateChain.eq).toHaveBeenCalledWith("id", TARGET);
    expect(updateChain.eq).toHaveBeenCalledWith("competition_id", "comp-1");
    expect(updateChain.eq).toHaveBeenCalledWith("is_bot", false);
  });

  it("never returns the plaintext PIN in the response", async () => {
    rowMatched();
    const res = await POST(
      request({ playerId: TARGET, pin: "4321", pinConfirm: "4321" }),
    );
    expect(await res.text()).not.toContain("4321");
  });
});
