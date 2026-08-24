import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { writePredictTableScores } from "./write-predict-table-scores";
import type { PredictTableScoreResult } from "./predict-table";

function result(overrides: Partial<PredictTableScoreResult> = {}) {
  return {
    totalScore: 100,
    placementScore: 80,
    bandBonusScore: 20,
    boldCallScore: 0,
    teamScores: {},
    bandBonuses: {},
    boldCalls: [],
    ...overrides,
  } as PredictTableScoreResult;
}

describe("writePredictTableScores — idempotent upsert target", () => {
  function fakeSupabase(error: unknown = null) {
    const calls: {
      rows: {
        player_id: string;
        total_score: number;
        placement_score: number;
        band_bonus_score: number;
        bold_call_score: number;
        computed_at: string;
      }[];
      onConflict: string;
    }[] = [];
    const client = {
      from: (_table: string) => ({
        upsert: (rows: unknown[], options: { onConflict: string }) => {
          calls.push({ rows: rows as never, onConflict: options.onConflict });
          return Promise.resolve({ error });
        },
      }),
    } as unknown as SupabaseClient;
    return { client, calls };
  }

  it("upserts the mapped rows keyed on the (player_id) constraint", async () => {
    const { client, calls } = fakeSupabase();

    await writePredictTableScores(client, [
      { playerId: "player-a", result: result({ totalScore: 132 }) },
      { playerId: "player-b", result: result({ totalScore: 90 }) },
    ]);

    expect(calls.length).toBe(1);
    expect(calls[0].onConflict).toBe("player_id");
    expect(calls[0].rows[0]).toMatchObject({
      player_id: "player-a",
      total_score: 132,
      computed_at: expect.any(String),
    });
    expect(calls[0].rows[1]).toMatchObject({
      player_id: "player-b",
      total_score: 90,
    });
  });

  it("passes every component through verbatim", async () => {
    const { client, calls } = fakeSupabase();

    await writePredictTableScores(client, [
      {
        playerId: "player-a",
        result: result({
          totalScore: 143,
          placementScore: 100,
          bandBonusScore: 30,
          boldCallScore: 13,
        }),
      },
    ]);

    expect(calls[0].rows[0]).toMatchObject({
      total_score: 143,
      placement_score: 100,
      band_bonus_score: 30,
      bold_call_score: 13,
    });
  });

  it("no-ops without calling the database when there are no rows", async () => {
    const { client, calls } = fakeSupabase();

    await writePredictTableScores(client, []);

    expect(calls.length).toBe(0);
  });

  it("surfaces a database error instead of swallowing it", async () => {
    const { client } = fakeSupabase({ message: "constraint violated" });

    await expect(
      writePredictTableScores(client, [
        { playerId: "player-a", result: result() },
      ]),
    ).rejects.toThrow(/constraint violated/);
  });
});
