import { describe, expect, it, vi } from "vitest";
import {
  bucketGameweekPicks,
  bucketTablePredictions,
  loadAdminIndexCounts,
} from "./admin-index-access";

// The derivations are written down in docs/admin-ui-spec.md §5 (Phase 1
// note): "Outstanding is over non-bot players", and the current-gameweek
// card's none / one / all-tips split. Those are the non-obvious bits and get
// direct unit tests; the loader orchestration around them is thin glue
// (TESTING_STANDARD.md §1 rationale for the sibling *-access.ts files).

describe("bucketTablePredictions", () => {
  it("splits submitted / skipped / outstanding over the human count", () => {
    expect(
      bucketTablePredictions(3, [
        { is_skipped: false, submitted_at: "2026-08-20" },
        { is_skipped: true, submitted_at: null },
      ]),
    ).toEqual({ submitted: 1, skipped: 1, outstanding: 1 });
  });

  it("counts a partially-filled row (no submitted_at, not skipped) as outstanding", () => {
    expect(
      bucketTablePredictions(2, [{ is_skipped: false, submitted_at: null }]),
    ).toEqual({ submitted: 0, skipped: 0, outstanding: 2 });
  });

  it("lets skipped win over a submitted timestamp", () => {
    expect(
      bucketTablePredictions(1, [
        { is_skipped: true, submitted_at: "2026-08-20" },
      ]),
    ).toEqual({ submitted: 0, skipped: 1, outstanding: 0 });
  });

  it("clamps outstanding at zero if rows somehow exceed the human count", () => {
    expect(
      bucketTablePredictions(1, [
        { is_skipped: false, submitted_at: "2026-08-20" },
        { is_skipped: true, submitted_at: null },
      ]).outstanding,
    ).toBe(0);
  });
});

describe("bucketGameweekPicks", () => {
  it("splits none / one / all over two tipped matches", () => {
    const buckets = bucketGameweekPicks(
      ["a", "b", "c", "d"],
      [
        { player_id: "a" },
        { player_id: "a" }, // both
        { player_id: "b" }, // one
        // c, d filed nothing
      ],
      2,
    );
    expect(buckets).toEqual({
      tippedMatchCount: 2,
      noTips: 2,
      oneTip: 1,
      allTips: 1,
    });
  });

  it("never reports oneTip for a single-tipped-match (Skipped Slot) week", () => {
    const buckets = bucketGameweekPicks(["a", "b"], [{ player_id: "a" }], 1);
    expect(buckets).toEqual({
      tippedMatchCount: 1,
      noTips: 1,
      oneTip: 0,
      allTips: 1,
    });
  });

  it("ignores pick rows for players not in the human roster (e.g. a bot)", () => {
    const buckets = bucketGameweekPicks(
      ["a"],
      [
        { player_id: "a" },
        { player_id: "a" },
        { player_id: "bot" },
        { player_id: "bot" },
      ],
      2,
    );
    expect(buckets).toEqual({
      tippedMatchCount: 2,
      noTips: 0,
      oneTip: 0,
      allTips: 1,
    });
  });

  it("caps a player's count at the tipped-match count", () => {
    // Defensive: three rows for one player against two tipped matches still
    // reads as 'all', not as an overflow into some fourth bucket.
    const buckets = bucketGameweekPicks(
      ["a"],
      [{ player_id: "a" }, { player_id: "a" }, { player_id: "a" }],
      2,
    );
    expect(buckets.allTips).toBe(1);
    expect(buckets.oneTip).toBe(0);
  });
});

// --- loader orchestration (thin) ---

interface Result {
  data: unknown;
  error: unknown;
}

function builder(result: Result) {
  const b: Record<string, unknown> = {
    select: () => b,
    eq: () => b,
    in: () => b,
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
    from: vi.fn((table: string) =>
      builder(byTable[table] ?? { data: [], error: null }),
    ),
  } as never;
}

const noSeason = { data: null, error: null };

describe("loadAdminIndexCounts", () => {
  it("counts players and bots, and leaves the gameweek buckets null before a season is seeded", async () => {
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
    expect(counts.seasonId).toBeNull();
    expect(counts.currentGameweek).toBeNull();
    expect(counts.currentGameweekPicks).toBeNull();
    expect(counts.tablePredictions).toEqual({
      submitted: 1,
      skipped: 1,
      outstanding: 1,
    });
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
