import { beforeEach, describe, expect, it, vi } from "vitest";

// Branch test for the admin authorization boundary (docs/admin-ui-spec.md
// §4; TESTING_STANDARD.md §1 names admin actions explicitly). The 404-path
// behaviour these branches back is security-relevant, so it can't silently
// regress -- the deployed Preview walk in the issue's "done when" covers the
// browser half.

const { mockGetSessionPlayerId, mockCreateClient } = vi.hoisted(() => ({
  mockGetSessionPlayerId: vi.fn(),
  mockCreateClient: vi.fn(),
}));

vi.mock("@/app/_lib/session-cookie", () => ({
  getSessionPlayerId: mockGetSessionPlayerId,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mockCreateClient,
}));

interface PlayerRow {
  id: string;
  competition_id: string;
  is_admin: boolean | null;
}

/**
 * Minimal PostgREST builder: records the chained calls so the test can
 * assert the AGENTS.md `.order()`/`.limit(1)` rule is honoured, and hands
 * `maybeSingle()` back the one row (or null).
 */
function playersMock(row: PlayerRow | null) {
  const calls: string[] = [];
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    order: () => {
      calls.push("order");
      return builder;
    },
    limit: () => {
      calls.push("limit");
      return builder;
    },
    maybeSingle: async () => ({ data: row, error: null }),
  };
  return { client: { from: vi.fn(() => builder) }, calls };
}

// requireAdmin/getSessionIsAdmin are React `cache()`-wrapped; a fresh module
// instance per test gives each a fresh cache so results don't bleed.
async function load() {
  vi.resetModules();
  return import("./admin-access");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireAdmin", () => {
  it("returns null with no session, without touching the database", async () => {
    mockGetSessionPlayerId.mockResolvedValue(null);
    const { requireAdmin } = await load();
    expect(await requireAdmin()).toBeNull();
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("returns null when the session player row is missing", async () => {
    mockGetSessionPlayerId.mockResolvedValue("player-1");
    mockCreateClient.mockReturnValue(playersMock(null).client);
    const { requireAdmin } = await load();
    expect(await requireAdmin()).toBeNull();
  });

  it("returns null when the player exists but is not an admin", async () => {
    mockGetSessionPlayerId.mockResolvedValue("player-1");
    mockCreateClient.mockReturnValue(
      playersMock({
        id: "player-1",
        competition_id: "comp-1",
        is_admin: false,
      }).client,
    );
    const { requireAdmin } = await load();
    expect(await requireAdmin()).toBeNull();
  });

  it("returns the admin context when the player is an admin", async () => {
    mockGetSessionPlayerId.mockResolvedValue("player-1");
    mockCreateClient.mockReturnValue(
      playersMock({
        id: "player-1",
        competition_id: "comp-1",
        is_admin: true,
      }).client,
    );
    const { requireAdmin } = await load();
    expect(await requireAdmin()).toEqual({
      playerId: "player-1",
      competitionId: "comp-1",
    });
  });

  it("selects the player row with an explicit order and limit (AGENTS.md)", async () => {
    mockGetSessionPlayerId.mockResolvedValue("player-1");
    const mock = playersMock({
      id: "player-1",
      competition_id: "comp-1",
      is_admin: true,
    });
    mockCreateClient.mockReturnValue(mock.client);
    const { requireAdmin } = await load();
    await requireAdmin();
    expect(mock.calls).toContain("order");
    expect(mock.calls).toContain("limit");
  });
});

describe("getSessionIsAdmin", () => {
  it("is false for a non-admin session", async () => {
    mockGetSessionPlayerId.mockResolvedValue("player-1");
    mockCreateClient.mockReturnValue(
      playersMock({
        id: "player-1",
        competition_id: "comp-1",
        is_admin: false,
      }).client,
    );
    const { getSessionIsAdmin } = await load();
    expect(await getSessionIsAdmin()).toBe(false);
  });

  it("is false for a logged-out visitor", async () => {
    mockGetSessionPlayerId.mockResolvedValue(null);
    const { getSessionIsAdmin } = await load();
    expect(await getSessionIsAdmin()).toBe(false);
  });

  it("is true for an admin session", async () => {
    mockGetSessionPlayerId.mockResolvedValue("player-1");
    mockCreateClient.mockReturnValue(
      playersMock({
        id: "player-1",
        competition_id: "comp-1",
        is_admin: true,
      }).client,
    );
    const { getSessionIsAdmin } = await load();
    expect(await getSessionIsAdmin()).toBe(true);
  });
});
