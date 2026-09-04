import { beforeEach, describe, expect, it, vi } from "vitest";

// The /reset-pin server prologue is the one authenticated screen reachable
// mid forced-reset, so its own session/flag guard is security-relevant and
// gets a branch test alongside loadActivePlayer's (issue #36).

const { mockGetSessionPlayerId, mockCreateClient, mockRedirect } = vi.hoisted(
  () => ({
    mockGetSessionPlayerId: vi.fn(),
    mockCreateClient: vi.fn(),
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
vi.mock("next/navigation", () => ({ redirect: mockRedirect }));
vi.mock("./ResetPinForm", () => ({ ResetPinForm: () => null }));

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

// The prologue reads the React cache()-wrapped loadSessionPlayerRow(); a
// fresh module instance per test keeps its cache from bleeding.
async function load() {
  vi.resetModules();
  return (await import("./page")).default;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRedirect.mockImplementation((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  });
});

describe("ResetPinPage prologue", () => {
  it("redirects to /login with no session", async () => {
    mockGetSessionPlayerId.mockResolvedValue(null);
    const ResetPinPage = await load();
    await expect(ResetPinPage()).rejects.toThrow("REDIRECT:/login");
  });

  it("redirects to /login when the row is gone", async () => {
    mockGetSessionPlayerId.mockResolvedValue("player-1");
    mockCreateClient.mockReturnValue(playersMock(null));
    const ResetPinPage = await load();
    await expect(ResetPinPage()).rejects.toThrow("REDIRECT:/login");
  });

  it("redirects to / when no reset is pending", async () => {
    mockGetSessionPlayerId.mockResolvedValue("player-1");
    mockCreateClient.mockReturnValue(
      playersMock({
        id: "player-1",
        competition_id: "comp-1",
        is_admin: false,
        pin_reset_required: false,
      }),
    );
    const ResetPinPage = await load();
    await expect(ResetPinPage()).rejects.toThrow("REDIRECT:/");
  });

  it("renders the form when a reset is pending", async () => {
    mockGetSessionPlayerId.mockResolvedValue("player-1");
    mockCreateClient.mockReturnValue(
      playersMock({
        id: "player-1",
        competition_id: "comp-1",
        is_admin: false,
        pin_reset_required: true,
      }),
    );
    const ResetPinPage = await load();
    const result = await ResetPinPage();
    expect(result).toBeTruthy();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
