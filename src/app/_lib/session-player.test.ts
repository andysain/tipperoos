import { beforeEach, describe, expect, it, vi } from "vitest";

// Branch test for the forced-reset gate (issue #36; TESTING_STANDARD.md §1 —
// PIN/lockout-adjacent access control). The redirect target each branch
// picks IS the enforcement the whole flow rests on, so it can't silently
// regress; the deployed Preview walk in the issue's "done when" covers the
// browser half.

const { mockGetSessionPlayerId, mockCreateClient, mockRedirect } = vi.hoisted(
  () => ({
    mockGetSessionPlayerId: vi.fn(),
    mockCreateClient: vi.fn(),
    // next/navigation's redirect() throws to halt rendering -- model that so
    // control flow after a redirect() call is exercised too.
    mockRedirect: vi.fn((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    }),
  }),
);

vi.mock("@/app/_lib/session-cookie", () => ({
  getSessionPlayerId: mockGetSessionPlayerId,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mockCreateClient,
}));
vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

function playersMock(row: Record<string, unknown> | null) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => ({ data: row, error: null }),
  };
  return { from: vi.fn(() => builder) };
}

// loadSessionPlayerRow is React cache()-wrapped; a fresh module instance per
// test gives it a fresh cache so results don't bleed.
async function load() {
  vi.resetModules();
  return import("./session-player");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRedirect.mockImplementation((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  });
});

describe("loadActivePlayer", () => {
  it("redirects a logged-out visitor to /login without a DB call", async () => {
    mockGetSessionPlayerId.mockResolvedValue(null);
    const { loadActivePlayer } = await load();
    await expect(loadActivePlayer()).rejects.toThrow("REDIRECT:/login");
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("redirects to /login when the session names a player row that's gone", async () => {
    mockGetSessionPlayerId.mockResolvedValue("player-1");
    mockCreateClient.mockReturnValue(playersMock(null));
    const { loadActivePlayer } = await load();
    await expect(loadActivePlayer()).rejects.toThrow("REDIRECT:/login");
  });

  it("redirects to /reset-pin when the player has a pending PIN reset", async () => {
    mockGetSessionPlayerId.mockResolvedValue("player-1");
    mockCreateClient.mockReturnValue(
      playersMock({
        id: "player-1",
        competition_id: "comp-1",
        is_admin: false,
        pin_reset_required: true,
      }),
    );
    const { loadActivePlayer } = await load();
    await expect(loadActivePlayer()).rejects.toThrow("REDIRECT:/reset-pin");
  });

  it("returns the scoping ids for an active player and does not redirect", async () => {
    mockGetSessionPlayerId.mockResolvedValue("player-1");
    mockCreateClient.mockReturnValue(
      playersMock({
        id: "player-1",
        competition_id: "comp-1",
        is_admin: false,
        pin_reset_required: false,
      }),
    );
    const { loadActivePlayer } = await load();
    expect(await loadActivePlayer()).toEqual({
      playerId: "player-1",
      competitionId: "comp-1",
    });
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

describe("enforcePinResetGate", () => {
  it("redirects a mid-reset session to /reset-pin", async () => {
    mockGetSessionPlayerId.mockResolvedValue("player-1");
    mockCreateClient.mockReturnValue(
      playersMock({
        id: "player-1",
        competition_id: "comp-1",
        is_admin: true,
        pin_reset_required: true,
      }),
    );
    const { enforcePinResetGate } = await load();
    await expect(enforcePinResetGate()).rejects.toThrow("REDIRECT:/reset-pin");
  });

  it("does nothing for a logged-out request (leaves the caller's 404 path)", async () => {
    mockGetSessionPlayerId.mockResolvedValue(null);
    const { enforcePinResetGate } = await load();
    await expect(enforcePinResetGate()).resolves.toBeUndefined();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("does nothing for a signed-in player with no pending reset", async () => {
    mockGetSessionPlayerId.mockResolvedValue("player-1");
    mockCreateClient.mockReturnValue(
      playersMock({
        id: "player-1",
        competition_id: "comp-1",
        is_admin: true,
        pin_reset_required: false,
      }),
    );
    const { enforcePinResetGate } = await load();
    await expect(enforcePinResetGate()).resolves.toBeUndefined();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

describe("loadSessionPlayerRow", () => {
  it("rethrows a genuine query error rather than treating it as no-session", async () => {
    mockGetSessionPlayerId.mockResolvedValue("player-1");
    mockCreateClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: { message: "connection reset" },
                }),
              }),
            }),
          }),
        }),
      }),
    });
    const { loadSessionPlayerRow } = await load();
    await expect(loadSessionPlayerRow()).rejects.toEqual({
      message: "connection reset",
    });
  });

  it("maps the row and coerces the boolean columns", async () => {
    mockGetSessionPlayerId.mockResolvedValue("player-1");
    mockCreateClient.mockReturnValue(
      playersMock({
        id: "player-1",
        competition_id: "comp-1",
        is_admin: null,
        pin_reset_required: null,
      }),
    );
    const { loadSessionPlayerRow } = await load();
    expect(await loadSessionPlayerRow()).toEqual({
      id: "player-1",
      competitionId: "comp-1",
      isAdmin: false,
      pinResetRequired: false,
    });
  });
});
