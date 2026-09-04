import { describe, expect, it, vi } from "vitest";
import { loadAdminIndexCounts } from "./admin-index-access";

// The counts derivation is written down in docs/admin-ui-spec.md §5 (Phase 1
// note): "Outstanding is over non-bot players -- those with neither a
// submitted_at nor an is_skipped prediction row." That's non-obvious enough
// to pin (TESTING_STANDARD.md §1). The gameweek resolution it also does is
// already covered by gameweek-access.test.ts / resolve.test.ts, so these
// tests hold the season at "not seeded" and assert the buckets.

interface Result {
  data: unknown;
  error: unknown;
}

/** A builder that is both awaitable (Promise.all path) and has .maybeSingle(). */
function builder(result: Result) {
  const b: Record<string, unknown> = {
    select: () => b,
    eq: () => b,
    order: () => b,
    limit: () => b,
    maybeSingle: async () => result,
    then: (resolve: (v: Result) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return b;
}

function client(byTable: Record<string, Result>) {
  return {
    from: vi.fn(
      (table: string) => builder(byTable[table] ?? { data: [], error: null }),
    ),
  } as never;
}

const noSeason = { data: null, error: null };

describe("loadAdminIndexCounts", () => {
  it("counts players and bots, and derives outstanding as humans minus submitted minus skipped", async () => {
    const counts = await loadAdminIndexCounts(
      client({
        players: {
          data: [
            { id: "a", is_bot: false },
            { id: "b", is_bot: false },
            { id: "c", is_bot: false },
            { id: "bot1", is_bot: true },
            { id: "bot2", is_bot: true },
          ],
          error: null,
        },
        table_predictions: {
          data: [
            { player_id: "a", is_skipped: false, submitted_at: "2026-08-20" },
            { player_id: "b", is_skipped: true, submitted_at: null },
          ],
          error: null,
        },
        seasons: noSeason,
      }),
      "comp-1",
    );

    expect(counts.playersTotal).toBe(5);
    expect(counts.botsTotal).toBe(2);
    expect(counts.currentGameweek).toBeNull();
    expect(counts.tablePredictions).toEqual({
      submitted: 1,
      skipped: 1,
      outstanding: 1, // 3 humans - 1 submitted - 1 skipped
    });
  });

  it("treats a partially-filled row (no submitted_at, not skipped) as outstanding", async () => {
    const counts = await loadAdminIndexCounts(
      client({
        players: {
          data: [
            { id: "a", is_bot: false },
            { id: "b", is_bot: false },
          ],
          error: null,
        },
        table_predictions: {
          data: [{ player_id: "a", is_skipped: false, submitted_at: null }],
          error: null,
        },
        seasons: noSeason,
      }),
      "comp-1",
    );

    expect(counts.tablePredictions).toEqual({
      submitted: 0,
      skipped: 0,
      outstanding: 2,
    });
  });

  it("counts a skipped row as skipped even if submitted_at is also set", async () => {
    const counts = await loadAdminIndexCounts(
      client({
        players: { data: [{ id: "a", is_bot: false }], error: null },
        table_predictions: {
          data: [
            { player_id: "a", is_skipped: true, submitted_at: "2026-08-20" },
          ],
          error: null,
        },
        seasons: noSeason,
      }),
      "comp-1",
    );

    expect(counts.tablePredictions).toEqual({
      submitted: 0,
      skipped: 1,
      outstanding: 0,
    });
  });

  it("clamps outstanding at zero if prediction rows somehow exceed the human count", async () => {
    const counts = await loadAdminIndexCounts(
      client({
        players: { data: [{ id: "a", is_bot: false }], error: null },
        table_predictions: {
          data: [
            { player_id: "a", is_skipped: false, submitted_at: "2026-08-20" },
            { player_id: "ghost", is_skipped: true, submitted_at: null },
          ],
          error: null,
        },
        seasons: noSeason,
      }),
      "comp-1",
    );

    expect(counts.tablePredictions.outstanding).toBe(0);
  });

  it("throws when the players query errors", async () => {
    await expect(
      loadAdminIndexCounts(
        client({
          players: { data: null, error: { message: "boom" } },
          table_predictions: { data: [], error: null },
          seasons: noSeason,
        }),
        "comp-1",
      ),
    ).rejects.toEqual({ message: "boom" });
  });
});
