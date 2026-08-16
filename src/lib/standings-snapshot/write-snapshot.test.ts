import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { writeStandingsSnapshot } from "./write-snapshot";

describe("writeStandingsSnapshot — idempotent upsert target", () => {
  function fakeSupabase(error: unknown = null) {
    const calls: {
      rows: {
        gameweek_id: string;
        player_id: string;
        gameweek_score: number;
        season_total: number;
        season_standing: number;
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

  it("upserts the mapped rows keyed on the (gameweek_id, player_id) constraint", async () => {
    const { client, calls } = fakeSupabase();

    await writeStandingsSnapshot(client, "gameweek-1", [
      {
        playerId: "alice",
        gameweekScore: 7,
        seasonTotal: 7,
        seasonStanding: 1,
      },
      {
        playerId: "bot-bob",
        gameweekScore: 4,
        seasonTotal: 4,
        seasonStanding: 2,
      },
    ]);

    expect(calls.length).toBe(1);
    expect(calls[0].onConflict).toBe("gameweek_id,player_id");
    expect(calls[0].rows[0].gameweek_score).toBe(7);
    expect(calls[0].rows[0].season_total).toBe(7);
    expect(calls[0].rows[0].season_standing).toBe(1);
    expect(calls[0].rows[0]).toMatchObject({
      gameweek_id: "gameweek-1",
      player_id: "alice",
    });
    expect(calls[0].rows[1].gameweek_score).toBe(4);
    expect(calls[0].rows[1].season_total).toBe(4);
    expect(calls[0].rows[1].season_standing).toBe(2);
    expect(calls[0].rows[1]).toMatchObject({
      gameweek_id: "gameweek-1",
      player_id: "bot-bob",
    });
  });

  it("no-ops without calling the database when there are no rows", async () => {
    const { client, calls } = fakeSupabase();

    await writeStandingsSnapshot(client, "gameweek-1", []);

    expect(calls.length).toBe(0);
  });

  it("surfaces a database error instead of swallowing it", async () => {
    const { client } = fakeSupabase({ message: "constraint violated" });

    await expect(
      writeStandingsSnapshot(client, "gameweek-1", [
        {
          playerId: "alice",
          gameweekScore: 7,
          seasonTotal: 7,
          seasonStanding: 1,
        },
      ]),
    ).rejects.toThrow(/constraint violated/);
  });

  it("recomputing with a corrected snapshot overwrites via upsert, never a second accumulated row", async () => {
    const { client, calls } = fakeSupabase();

    await writeStandingsSnapshot(client, "gameweek-1", [
      {
        playerId: "alice",
        gameweekScore: 7,
        seasonTotal: 7,
        seasonStanding: 1,
      },
    ]);
    await writeStandingsSnapshot(client, "gameweek-1", [
      {
        playerId: "alice",
        gameweekScore: 4,
        seasonTotal: 4,
        seasonStanding: 2,
      },
    ]);

    expect(calls.length).toBe(2);
    expect(calls[0].onConflict).toBe("gameweek_id,player_id");
    expect(calls[1].onConflict).toBe("gameweek_id,player_id");
    expect(calls[0].rows[0].season_total).toBe(7);
    expect(calls[1].rows[0].season_total).toBe(4);
    expect(calls[1].rows[0].season_standing).toBe(2);
  });
});
