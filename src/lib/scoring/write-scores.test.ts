import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { writeScores } from "./write-scores";

describe("writeScores — idempotent upsert target", () => {
  function fakeSupabase(error: unknown = null) {
    const calls: {
      rows: {
        player_id: string;
        match_id: string;
        points: number;
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

  it("upserts the mapped rows keyed on the (player_id, match_id) constraint", async () => {
    const { client, calls } = fakeSupabase();

    await writeScores(client, [
      { playerId: "player-a", matchId: "match-1", points: 7 },
      { playerId: "player-b", matchId: "match-1", points: 0 },
    ]);

    expect(calls.length).toBe(1);
    expect(calls[0].onConflict).toBe("player_id,match_id");
    expect(calls[0].rows[0].points).toBe(7);
    expect(calls[0].rows[0]).toMatchObject({
      player_id: "player-a",
      match_id: "match-1",
      computed_at: expect.any(String),
    });
    expect(calls[0].rows[1].points).toBe(0);
    expect(calls[0].rows[1]).toMatchObject({
      player_id: "player-b",
      match_id: "match-1",
    });
  });

  it("passes every picker's points through verbatim", async () => {
    const { client, calls } = fakeSupabase();

    await writeScores(client, [
      { playerId: "player-a", matchId: "match-1", points: 5 },
      { playerId: "player-b", matchId: "match-1", points: 4 },
      { playerId: "player-c", matchId: "match-1", points: 3 },
    ]);

    expect(calls[0].rows[0].points).toBe(5);
    expect(calls[0].rows[1].points).toBe(4);
    expect(calls[0].rows[2].points).toBe(3);
  });

  it("no-ops without calling the database when there are no rows", async () => {
    const { client, calls } = fakeSupabase();

    await writeScores(client, []);

    expect(calls.length).toBe(0);
  });

  it("surfaces a database error instead of swallowing it", async () => {
    const { client } = fakeSupabase({ message: "constraint violated" });

    await expect(
      writeScores(client, [
        { playerId: "player-a", matchId: "match-1", points: 5 },
      ]),
    ).rejects.toThrow(/constraint violated/);
  });
});
