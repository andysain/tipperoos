import { beforeEach, describe, expect, it, vi } from "vitest";

// Direct branch test for the shared admin-route preamble (issue #201;
// TESTING_STANDARD.md §1 "names admin actions", same reason
// admin-access.test.ts exists next door). This module encodes the
// security-critical 404-before-403 ordering and the "row absence is a
// bodyless 404" contract that both /api/admin/players/* routes rely on.

const mockRequireAdmin = vi.fn();
vi.mock("@/app/_lib/admin-access", () => ({
  requireAdmin: mockRequireAdmin,
}));

const {
  adminNotFound,
  isUuid,
  guardAdminMutation,
  readAdminRequest,
  settlePlayerUpdate,
} = await import("./admin-request");

function request(
  body?: unknown,
  { csrf = true }: { csrf?: boolean } = {},
): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (csrf) headers["x-tipperoos-client"] = "1";
  return new Request("http://localhost/api/admin/players/x", {
    method: "POST",
    headers,
    body:
      body === undefined
        ? undefined
        : typeof body === "string"
          ? body
          : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue({
    playerId: "admin-1",
    competitionId: "comp-1",
  });
});

describe("adminNotFound", () => {
  it("is a bodyless 404", async () => {
    const res = adminNotFound();
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
  });
});

describe("isUuid", () => {
  it("accepts a well-formed uuid and rejects everything else", () => {
    expect(isUuid("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(123)).toBe(false);
  });
});

describe("guardAdminMutation", () => {
  it("rejects a non-admin with a bodyless 404 — before the CSRF check", async () => {
    mockRequireAdmin.mockResolvedValue(null);
    const result = await guardAdminMutation(request(undefined, { csrf: false }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(404);
    expect(await result.response.text()).toBe("");
  });

  it("rejects an admin with no CSRF header with a 403", async () => {
    const result = await guardAdminMutation(request(undefined, { csrf: false }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
  });

  it("passes an admin with the CSRF header, returning the context", async () => {
    const result = await guardAdminMutation(request());
    expect(result).toEqual({
      ok: true,
      admin: { playerId: "admin-1", competitionId: "comp-1" },
    });
  });
});

describe("readAdminRequest", () => {
  it("propagates a gate rejection", async () => {
    mockRequireAdmin.mockResolvedValue(null);
    const result = await readAdminRequest(request({ playerId: "x" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(404);
  });

  it("rejects a non-JSON body with a 400", async () => {
    const result = await readAdminRequest(request("not json{"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
  });

  it("returns the parsed body and admin context on success", async () => {
    const result = await readAdminRequest<{ playerId: string }>(
      request({ playerId: "p-1" }),
    );
    expect(result).toEqual({
      ok: true,
      admin: { playerId: "admin-1", competitionId: "comp-1" },
      body: { playerId: "p-1" },
    });
  });
});

describe("settlePlayerUpdate", () => {
  it("maps a query error to a 500 with the given message", async () => {
    const res = settlePlayerUpdate(
      { data: null, error: { message: "boom" } },
      "Could not do the thing.",
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(500);
    expect(await res!.json()).toEqual({ error: "Could not do the thing." });
  });

  it("maps a no-row result to a bodyless 404", async () => {
    const res = settlePlayerUpdate({ data: null, error: null }, "msg");
    expect(res).not.toBeNull();
    expect(res!.status).toBe(404);
    expect(await res!.text()).toBe("");
  });

  it("returns null on success so the caller can respond ok", () => {
    expect(
      settlePlayerUpdate({ data: { id: "p-1" }, error: null }, "msg"),
    ).toBeNull();
  });
});
