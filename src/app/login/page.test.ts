import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPlayers } from "./fetch-players";

// Real scenarios fetchPlayers must resolve (never reject) for -- see the
// comment on fetchPlayers itself for why this matters: the mount-time
// silent-replay call site has no .catch(), so any rejection here used to
// leave a returning player stuck on the initial loading screen forever,
// and any non-403 failure used to be treated the same as an invalid code,
// wiping a still-valid stored code from localStorage.
describe("fetchPlayers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves ok with the players list on a successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          players: [{ displayName: "Andy", emoji: "⚽" }],
        }),
      }),
    );

    const result = await fetchPlayers("real-code");
    expect(result).toEqual({
      status: "ok",
      players: [{ displayName: "Andy", emoji: "⚽" }],
    });
  });

  it("resolves invalid-code on a 403 (wrong or rotated code)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: "Invalid competition code." }),
      }),
    );

    const result = await fetchPlayers("wrong-code");
    expect(result).toEqual({ status: "invalid-code" });
  });

  it("resolves error (not invalid-code) on a transient 500 from the server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: "Could not load players." }),
      }),
    );

    const result = await fetchPlayers("real-code");
    expect(result).toEqual({ status: "error" });
  });

  it("resolves error (not invalid-code) on any other non-403 failure status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({}),
      }),
    );

    const result = await fetchPlayers("real-code");
    expect(result).toEqual({ status: "error" });
  });

  it("resolves error instead of rejecting when fetch itself throws (offline/network failure)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    await expect(fetchPlayers("real-code")).resolves.toEqual({
      status: "error",
    });
  });

  it("resolves error instead of rejecting when the response body isn't valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected end of JSON input");
        },
      }),
    );

    await expect(fetchPlayers("real-code")).resolves.toEqual({
      status: "error",
    });
  });
});
