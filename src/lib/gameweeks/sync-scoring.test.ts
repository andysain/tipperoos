import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreCompletedMatchesAndSnapshots } from "./sync-scoring";

// Golden values hand-derived per issue #166 D1/D2/D4: only matches actually
// referenced by some gameweek's match_1_id/match_2_id get scored; a
// standings snapshot is only written once every non-Skipped, non-voided
// slot in its gameweek has a completed result -- both proven end-to-end
// (picks -> recomputeMatchScores -> scores upsert -> standings snapshot),
// not just asserting call shapes, using an in-memory fake that persists
// upserts so a later read in the same run sees them (real Postgres would).
//
// Issue #92: sync-scoring.ts's local toScoringSlot was hoisted into
// completion.ts (shared with select-next.ts, see completion.test.ts's own
// toScoringSlot suite) -- a pure internal refactor, so these assertions and
// their fake-Supabase behavior are unchanged; this comment is the paired
// test-file touch the internal refactor otherwise wouldn't need.

interface Row {
  [key: string]: unknown;
}

function filterable(rows: Row[]): {
  eq: (col: string, val: unknown) => ReturnType<typeof filterable>;
  lte: (col: string, val: number) => ReturnType<typeof filterable>;
  in: (col: string, vals: readonly unknown[]) => ReturnType<typeof filterable>;
  then: (resolve: (result: { data: Row[]; error: null }) => void) => void;
} {
  return {
    eq: (col, val) => filterable(rows.filter((r) => r[col] === val)),
    lte: (col, val) =>
      filterable(rows.filter((r) => (r[col] as number) <= val)),
    in: (col, vals) => filterable(rows.filter((r) => vals.includes(r[col]))),
    then: (resolve) => resolve({ data: rows, error: null }),
  };
}

function fakeSupabase(seed: {
  players?: Row[];
  gameweeks?: Row[];
  matches?: Row[];
  picks?: Row[];
  scores?: Row[];
  standings_snapshots?: Row[];
}) {
  const tables: Record<string, Row[]> = {
    players: seed.players ?? [],
    gameweeks: seed.gameweeks ?? [],
    matches: seed.matches ?? [],
    picks: seed.picks ?? [],
    scores: seed.scores ?? [],
    standings_snapshots: seed.standings_snapshots ?? [],
  };

  const client = {
    from: (table: string) => ({
      select: (_cols: string) => filterable(tables[table]),
      upsert: (rows: Row[], options: { onConflict: string }) => {
        const keys = options.onConflict.split(",");
        for (const row of rows) {
          const existingIndex = tables[table].findIndex((existing) =>
            keys.every((k) => existing[k] === row[k]),
          );
          if (existingIndex >= 0) {
            tables[table][existingIndex] = {
              ...tables[table][existingIndex],
              ...row,
            };
          } else {
            tables[table].push(row);
          }
        }
        return Promise.resolve({ error: null });
      },
    }),
    // Mirrors score_totals_for_matches (issue #182): reads the *current*
    // (post-upsert) `scores` table, grouped by player_id -- the standings
    // snapshot's seasonScoreRows are read back after this cycle's own
    // scoring writes, so this must see the same mutable `tables.scores`
    // the upsert above wrote into.
    rpc: (
      fn: string,
      args: { p_player_ids: string[]; p_match_ids: string[] },
    ) => {
      if (fn !== "score_totals_for_matches") {
        return Promise.resolve({
          data: null,
          error: new Error(`unexpected rpc: ${fn}`),
        });
      }
      const totals = new Map<string, number>();
      for (const row of tables.scores) {
        const playerId = row.player_id as string;
        const matchId = row.match_id as string;
        if (
          !args.p_player_ids.includes(playerId) ||
          !args.p_match_ids.includes(matchId)
        ) {
          continue;
        }
        totals.set(
          playerId,
          (totals.get(playerId) ?? 0) + (row.points as number),
        );
      }
      const data = [...totals.entries()].map(([player_id, points]) => ({
        player_id,
        points,
      }));
      return Promise.resolve({ data, error: null });
    },
  } as unknown as SupabaseClient;

  return { client, tables };
}

describe("scoreCompletedMatchesAndSnapshots", () => {
  it("no-ops when no matches completed this cycle", async () => {
    const { client, tables } = fakeSupabase({});
    await scoreCompletedMatchesAndSnapshots(client, []);
    expect(tables.scores.length).toBe(0);
  });

  it("scores a Tipped Match and ignores an untipped completed match in the same cycle", async () => {
    const { client, tables } = fakeSupabase({
      gameweeks: [
        {
          id: "gw1",
          number: 1,
          season_id: "s1",
          competition_id: "c1",
          match_1_id: "m1",
          match_2_id: "m2",
          match_1_voided_at: null,
          match_2_voided_at: null,
        },
      ],
      matches: [
        { id: "m1", team_a_score: 2, team_b_score: 1, status: "completed" },
        {
          id: "m2",
          team_a_score: null,
          team_b_score: null,
          status: "scheduled",
        },
        { id: "m99", team_a_score: 5, team_b_score: 0, status: "completed" },
      ],
      picks: [
        {
          match_id: "m1",
          player_id: "alice",
          pred_home_score: 2,
          pred_away_score: 1,
        },
      ],
    });

    await scoreCompletedMatchesAndSnapshots(client, ["m1", "m99"]);

    expect(tables.scores.length).toBe(1);
    expect(tables.scores[0].match_id).toBe("m1");
    expect(tables.scores[0].points).toBe(7);
    expect(tables.standings_snapshots.length).toBe(0);
  });

  it("does not write a standings snapshot while one slot is still pending", async () => {
    const { client, tables } = fakeSupabase({
      gameweeks: [
        {
          id: "gw1",
          number: 1,
          season_id: "s1",
          competition_id: "c1",
          match_1_id: "m1",
          match_2_id: "m2",
          match_1_voided_at: null,
          match_2_voided_at: null,
        },
      ],
      matches: [
        { id: "m1", team_a_score: 2, team_b_score: 1, status: "completed" },
        {
          id: "m2",
          team_a_score: null,
          team_b_score: null,
          status: "scheduled",
        },
      ],
      picks: [
        {
          match_id: "m1",
          player_id: "alice",
          pred_home_score: 2,
          pred_away_score: 1,
        },
      ],
    });

    await scoreCompletedMatchesAndSnapshots(client, ["m1"]);

    expect(tables.standings_snapshots.length).toBe(0);
  });

  it("writes a standings snapshot once both slots of a gameweek complete", async () => {
    const { client, tables } = fakeSupabase({
      players: [
        { id: "alice", competition_id: "c1" },
        { id: "bot-bob", competition_id: "c1" },
      ],
      gameweeks: [
        {
          id: "gw1",
          number: 1,
          season_id: "s1",
          competition_id: "c1",
          match_1_id: "m1",
          match_2_id: "m2",
          match_1_voided_at: null,
          match_2_voided_at: null,
        },
      ],
      matches: [
        { id: "m1", team_a_score: 2, team_b_score: 1, status: "completed" },
        { id: "m2", team_a_score: 0, team_b_score: 0, status: "completed" },
      ],
      picks: [
        {
          match_id: "m1",
          player_id: "alice",
          pred_home_score: 2,
          pred_away_score: 1,
        },
        {
          match_id: "m2",
          player_id: "bot-bob",
          pred_home_score: 0,
          pred_away_score: 0,
        },
      ],
    });

    await scoreCompletedMatchesAndSnapshots(client, ["m1", "m2"]);

    expect(tables.standings_snapshots.length).toBe(2);
    const alice = tables.standings_snapshots.find(
      (r) => r.player_id === "alice",
    )!;
    expect(alice.gameweek_score).toBe(7);
    expect(alice.season_total).toBe(7);
    const bob = tables.standings_snapshots.find(
      (r) => r.player_id === "bot-bob",
    )!;
    expect(bob.gameweek_score).toBe(7);
    expect(bob.season_standing).toBe(1);
  });

  it("treats a voided match as done for the completion check, without scoring it", async () => {
    const { client, tables } = fakeSupabase({
      players: [{ id: "alice", competition_id: "c1" }],
      gameweeks: [
        {
          id: "gw1",
          number: 1,
          season_id: "s1",
          competition_id: "c1",
          match_1_id: "m1",
          match_2_id: "m2",
          match_1_voided_at: "2026-08-15T00:00:00Z",
          match_2_voided_at: null,
        },
      ],
      matches: [
        {
          id: "m1",
          team_a_score: null,
          team_b_score: null,
          status: "postponed",
        },
        { id: "m2", team_a_score: 3, team_b_score: 0, status: "completed" },
      ],
      picks: [
        {
          match_id: "m1",
          player_id: "alice",
          pred_home_score: 2,
          pred_away_score: 1,
        },
        {
          match_id: "m2",
          player_id: "alice",
          pred_home_score: 3,
          pred_away_score: 0,
        },
      ],
    });

    await scoreCompletedMatchesAndSnapshots(client, ["m2"]);

    // m1 was never in completedMatchIds (it's postponed, not completed), so
    // it's never rescored here -- its voided-ness only feeds the completion
    // check, which lets the gameweek's snapshot fire off m2 alone.
    expect(tables.scores.length).toBe(1);
    expect(tables.scores[0].match_id).toBe("m2");
    expect(tables.standings_snapshots.length).toBe(1);
    expect(tables.standings_snapshots[0].gameweek_score).toBe(7);
  });
});
