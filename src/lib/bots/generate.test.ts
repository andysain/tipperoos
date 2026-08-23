import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateBotPicks } from "./generate";

// Golden values hand-derived from issue #35's D4/D5/D8. The rules under
// test, restated: Random and 1-1 generate only while a slot is UNLOCKED;
// Median only once it is LOCKED; Skipped Slots (null match id) and Voided
// Matches produce nothing; an existing bot pick is never rewritten; and the
// loop key is (competition, slot), never slot alone.

const NOW = new Date("2026-08-20T12:00:00Z");
// Picks lock 5 minutes before kickoff (src/lib/competitions/scope.ts).
const UNLOCKED_KICKOFF = "2026-08-20T14:00:00Z"; // 2h away
const LOCKED_KICKOFF = "2026-08-20T11:00:00Z"; // already kicked off

const COMP_A = "comp-a";
const COMP_B = "comp-b";

interface Row {
  [key: string]: unknown;
}

interface World {
  gameweeks: Row[];
  matches: Row[];
  players: Row[];
  picks: Row[];
}

interface UpsertCall {
  rows: Row[];
  options: { onConflict?: string; ignoreDuplicates?: boolean };
}

function filterable(rows: Row[]): Record<string, unknown> {
  const self = {
    eq: (col: string, val: unknown) =>
      filterable(rows.filter((r) => r[col] === val)),
    in: (col: string, vals: readonly unknown[]) =>
      filterable(rows.filter((r) => vals.includes(r[col]))),
    order: () => self,
    then: (resolve: (result: { data: Row[]; error: null }) => void) =>
      resolve({ data: rows, error: null }),
  };
  return self;
}

function fakeSupabase(world: World) {
  const upserts: UpsertCall[] = [];
  const client = {
    from: (table: keyof World) => ({
      select: () => filterable(world[table]),
      upsert: (rows: Row[], options: UpsertCall["options"]) => {
        upserts.push({ rows, options });
        // Mirror ignoreDuplicates: an existing (player_id, match_id) is left
        // alone rather than overwritten, and only rows actually written come
        // back from .select().
        const inserted: Row[] = [];
        for (const row of rows) {
          const exists = world.picks.some(
            (p) => p.player_id === row.player_id && p.match_id === row.match_id,
          );
          if (!exists) {
            world.picks.push(row);
            inserted.push(row);
          }
        }
        return {
          select: () => Promise.resolve({ data: inserted, error: null }),
        };
      },
    }),
  } as unknown as SupabaseClient;
  return { client, upserts };
}

/** Replays a fixed rng sequence, cycling so draw count never matters here. */
function cyclingRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

// rng 0.9 -> SCORE_POOL idx 7 -> 3; so every Random Bot pick below is 3-3.
const ALWAYS_THREE = () => 0.9;

function bots(competitionId: string, prefix: string): Row[] {
  return [
    {
      id: `${prefix}-random`,
      competition_id: competitionId,
      is_bot: true,
      bot_type: "random",
    },
    {
      id: `${prefix}-one-one`,
      competition_id: competitionId,
      is_bot: true,
      bot_type: "one_one",
    },
    {
      id: `${prefix}-median`,
      competition_id: competitionId,
      is_bot: true,
      bot_type: "median",
    },
  ];
}

function pickFor(world: World, playerId: string, matchId: string) {
  return world.picks.find(
    (p) => p.player_id === playerId && p.match_id === matchId,
  );
}

describe("generateBotPicks", () => {
  it("gives an unlocked slot Random and 1-1 picks but no Median pick", async () => {
    const world: World = {
      gameweeks: [
        {
          id: "gw1",
          competition_id: COMP_A,
          match_1_id: "m1",
          match_2_id: null,
          match_1_voided_at: null,
          match_2_voided_at: null,
        },
      ],
      matches: [
        { id: "m1", kickoff_time: UNLOCKED_KICKOFF, status: "scheduled" },
      ],
      players: [
        ...bots(COMP_A, "a"),
        { id: "human", competition_id: COMP_A, is_bot: false, bot_type: null },
      ],
      picks: [],
    };
    const { client } = fakeSupabase(world);

    const created = await generateBotPicks(client, {
      now: NOW,
      rng: ALWAYS_THREE,
    });

    expect(created).toBe(2);
    expect(pickFor(world, "a-random", "m1")?.pred_home_score).toBe(3);
    expect(pickFor(world, "a-one-one", "m1")?.pred_home_score).toBe(1);
    expect(pickFor(world, "a-one-one", "m1")?.pred_away_score).toBe(1);
    expect(pickFor(world, "a-median", "m1")).toBeUndefined();
  });

  it("gives a locked slot its Median pick, and no late Random or 1-1 pick", async () => {
    const world: World = {
      gameweeks: [
        {
          id: "gw1",
          competition_id: COMP_A,
          match_1_id: "m1",
          match_2_id: null,
          match_1_voided_at: null,
          match_2_voided_at: null,
        },
      ],
      matches: [
        { id: "m1", kickoff_time: LOCKED_KICKOFF, status: "scheduled" },
      ],
      players: [
        ...bots(COMP_A, "a"),
        { id: "h1", competition_id: COMP_A, is_bot: false, bot_type: null },
        { id: "h2", competition_id: COMP_A, is_bot: false, bot_type: null },
        { id: "h3", competition_id: COMP_A, is_bot: false, bot_type: null },
      ],
      // home [2, 1, 3] -> median 2; away [1, 0, 2] -> median 1.
      picks: [
        {
          player_id: "h1",
          match_id: "m1",
          pred_home_score: 2,
          pred_away_score: 1,
        },
        {
          player_id: "h2",
          match_id: "m1",
          pred_home_score: 1,
          pred_away_score: 0,
        },
        {
          player_id: "h3",
          match_id: "m1",
          pred_home_score: 3,
          pred_away_score: 2,
        },
      ],
    };
    const { client } = fakeSupabase(world);

    const created = await generateBotPicks(client, {
      now: NOW,
      rng: ALWAYS_THREE,
    });

    expect(created).toBe(1);
    expect(pickFor(world, "a-median", "m1")?.pred_home_score).toBe(2);
    expect(pickFor(world, "a-median", "m1")?.pred_away_score).toBe(1);
    expect(pickFor(world, "a-random", "m1")).toBeUndefined();
    expect(pickFor(world, "a-one-one", "m1")).toBeUndefined();
  });

  it("writes nothing for a Skipped Slot or a Voided Match", async () => {
    const world: World = {
      gameweeks: [
        {
          id: "gw1",
          competition_id: COMP_A,
          match_1_id: null, // Skipped Slot
          match_2_id: "m2", // voided after lock
          match_1_voided_at: null,
          match_2_voided_at: "2026-08-19T00:00:00Z",
        },
        {
          id: "gw2",
          competition_id: COMP_A,
          match_1_id: "m3", // postponed, voided_at not yet written
          match_2_id: null,
          match_1_voided_at: null,
          match_2_voided_at: null,
        },
      ],
      matches: [
        { id: "m2", kickoff_time: UNLOCKED_KICKOFF, status: "scheduled" },
        { id: "m3", kickoff_time: UNLOCKED_KICKOFF, status: "postponed" },
      ],
      players: bots(COMP_A, "a"),
      picks: [],
    };
    const { client, upserts } = fakeSupabase(world);

    const created = await generateBotPicks(client, {
      now: NOW,
      rng: ALWAYS_THREE,
    });

    expect(created).toBe(0);
    expect(upserts.length).toBe(0);
    expect(world.picks.length).toBe(0);
  });

  it("leaves an existing bot pick untouched on a second run", async () => {
    const world: World = {
      gameweeks: [
        {
          id: "gw1",
          competition_id: COMP_A,
          match_1_id: "m1",
          match_2_id: null,
          match_1_voided_at: null,
          match_2_voided_at: null,
        },
      ],
      matches: [
        { id: "m1", kickoff_time: UNLOCKED_KICKOFF, status: "scheduled" },
      ],
      players: bots(COMP_A, "a"),
      picks: [],
    };
    const { client, upserts } = fakeSupabase(world);

    const first = await generateBotPicks(client, {
      now: NOW,
      rng: ALWAYS_THREE,
    });
    const rolledOnce = pickFor(world, "a-random", "m1")?.pred_home_score;

    // Second cycle, a different rng: a re-roll would change the stored pick.
    const second = await generateBotPicks(client, {
      now: NOW,
      rng: cyclingRng([0]),
    });

    expect(first).toBe(2);
    expect(second).toBe(0);
    expect(rolledOnce).toBe(3);
    expect(pickFor(world, "a-random", "m1")?.pred_home_score).toBe(3);
    expect(upserts[0].options.ignoreDuplicates).toBe(true);
    expect(upserts[0].options.onConflict).toBe("player_id,match_id");
  });

  it("medians only its own competition's humans, on a fixture both tip", async () => {
    const world: World = {
      gameweeks: [
        {
          id: "gw-a",
          competition_id: COMP_A,
          match_1_id: "shared",
          match_2_id: null,
          match_1_voided_at: null,
          match_2_voided_at: null,
        },
        {
          id: "gw-b",
          competition_id: COMP_B,
          match_1_id: "shared",
          match_2_id: null,
          match_1_voided_at: null,
          match_2_voided_at: null,
        },
      ],
      matches: [
        { id: "shared", kickoff_time: LOCKED_KICKOFF, status: "scheduled" },
      ],
      players: [
        ...bots(COMP_A, "a"),
        ...bots(COMP_B, "b"),
        { id: "ha", competition_id: COMP_A, is_bot: false, bot_type: null },
        { id: "hb1", competition_id: COMP_B, is_bot: false, bot_type: null },
        { id: "hb2", competition_id: COMP_B, is_bot: false, bot_type: null },
      ],
      picks: [
        // Competition A's lone human says 4-0.
        {
          player_id: "ha",
          match_id: "shared",
          pred_home_score: 4,
          pred_away_score: 0,
        },
        // Competition B's humans say 0-1 and 0-3 -> median 0-2.
        {
          player_id: "hb1",
          match_id: "shared",
          pred_home_score: 0,
          pred_away_score: 1,
        },
        {
          player_id: "hb2",
          match_id: "shared",
          pred_home_score: 0,
          pred_away_score: 3,
        },
      ],
    };
    const { client } = fakeSupabase(world);

    await generateBotPicks(client, { now: NOW, rng: ALWAYS_THREE });

    expect(pickFor(world, "a-median", "shared")?.pred_home_score).toBe(4);
    expect(pickFor(world, "a-median", "shared")?.pred_away_score).toBe(0);
    expect(pickFor(world, "b-median", "shared")?.pred_home_score).toBe(0);
    expect(pickFor(world, "b-median", "shared")?.pred_away_score).toBe(2);
  });

  // D8's `is_bot = false` narrowing is new work -- `picksForMatch` selects
  // is_bot but never filters on it, so there was no existing pattern to
  // copy. This is a live case, not a theoretical one: the Random and 1-1
  // bots file on this very match BEFORE it locks, so by the time the Median
  // Bot runs their rows are always sitting there waiting to be counted.
  it("excludes the other bots' own picks from the median", async () => {
    const world: World = {
      gameweeks: [
        {
          id: "gw1",
          competition_id: COMP_A,
          match_1_id: "m1",
          match_2_id: null,
          match_1_voided_at: null,
          match_2_voided_at: null,
        },
      ],
      matches: [
        { id: "m1", kickoff_time: LOCKED_KICKOFF, status: "scheduled" },
      ],
      players: [
        ...bots(COMP_A, "a"),
        { id: "h1", competition_id: COMP_A, is_bot: false, bot_type: null },
        { id: "h2", competition_id: COMP_A, is_bot: false, bot_type: null },
        { id: "h3", competition_id: COMP_A, is_bot: false, bot_type: null },
      ],
      picks: [
        // Humans: home [0, 0, 1] -> median 0; away [0, 0, 1] -> median 0.
        {
          player_id: "h1",
          match_id: "m1",
          pred_home_score: 0,
          pred_away_score: 0,
        },
        {
          player_id: "h2",
          match_id: "m1",
          pred_home_score: 0,
          pred_away_score: 0,
        },
        {
          player_id: "h3",
          match_id: "m1",
          pred_home_score: 1,
          pred_away_score: 1,
        },
        // Pre-lock bot picks on the same match. Counting these would make
        // it home [0,0,1,3,1] -> median 1, not 0.
        {
          player_id: "a-random",
          match_id: "m1",
          pred_home_score: 3,
          pred_away_score: 3,
        },
        {
          player_id: "a-one-one",
          match_id: "m1",
          pred_home_score: 1,
          pred_away_score: 1,
        },
      ],
    };
    const { client } = fakeSupabase(world);

    await generateBotPicks(client, { now: NOW, rng: ALWAYS_THREE });

    expect(pickFor(world, "a-median", "m1")?.pred_home_score).toBe(0);
    expect(pickFor(world, "a-median", "m1")?.pred_away_score).toBe(0);
  });

  it("keys the loop on (competition, slot) -- one competition's bots never pick another's slot", async () => {
    const world: World = {
      gameweeks: [
        {
          id: "gw-a",
          competition_id: COMP_A,
          match_1_id: "a-only",
          match_2_id: null,
          match_1_voided_at: null,
          match_2_voided_at: null,
        },
        {
          id: "gw-b",
          competition_id: COMP_B,
          match_1_id: "b-only",
          match_2_id: null,
          match_1_voided_at: null,
          match_2_voided_at: null,
        },
      ],
      matches: [
        { id: "a-only", kickoff_time: UNLOCKED_KICKOFF, status: "scheduled" },
        { id: "b-only", kickoff_time: UNLOCKED_KICKOFF, status: "scheduled" },
      ],
      players: [...bots(COMP_A, "a"), ...bots(COMP_B, "b")],
      picks: [],
    };
    const { client } = fakeSupabase(world);

    const created = await generateBotPicks(client, {
      now: NOW,
      rng: ALWAYS_THREE,
    });

    // 2 bots x 2 slots, each slot only reached by its own competition.
    expect(created).toBe(4);
    expect(pickFor(world, "a-random", "a-only")?.pred_home_score).toBe(3);
    expect(pickFor(world, "b-random", "b-only")?.pred_home_score).toBe(3);
    expect(pickFor(world, "a-random", "b-only")).toBeUndefined();
    expect(pickFor(world, "b-random", "a-only")).toBeUndefined();
  });

  // Exercises the real CSPRNG default (node:crypto randomInt scaled to
  // [0, 1)) rather than an injected stub -- a scaling bug there would put
  // undefined/NaN into a NOT NULL column, which no seeded-rng test can catch.
  it("produces an in-range pick with its own CSPRNG when no rng is injected", async () => {
    const world: World = {
      gameweeks: [
        {
          id: "gw1",
          competition_id: COMP_A,
          match_1_id: "m1",
          match_2_id: null,
          match_1_voided_at: null,
          match_2_voided_at: null,
        },
      ],
      matches: [
        { id: "m1", kickoff_time: UNLOCKED_KICKOFF, status: "scheduled" },
      ],
      players: bots(COMP_A, "a"),
      picks: [],
    };
    const { client } = fakeSupabase(world);

    const created = await generateBotPicks(client, { now: NOW });

    expect(created).toBe(2);
    const random = pickFor(world, "a-random", "m1");
    expect(Number.isInteger(random?.pred_home_score)).toBe(true);
    expect(random?.pred_home_score as number).toBeGreaterThanOrEqual(0);
    expect(random?.pred_home_score as number).toBeLessThanOrEqual(3);
    expect(random?.pred_away_score as number).toBeLessThanOrEqual(3);
  });

  it("is a no-op, with no upsert at all, when there is nothing to generate", async () => {
    const world: World = {
      gameweeks: [],
      matches: [],
      players: [],
      picks: [],
    };
    const { client, upserts } = fakeSupabase(world);

    const created = await generateBotPicks(client, { now: NOW });

    expect(created).toBe(0);
    expect(upserts.length).toBe(0);
  });
});
