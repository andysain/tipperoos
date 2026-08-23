import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { selectNextGameweekSlots } from "./select-next";

// Golden values hand-derived per issue #92's decision log. Proven
// end-to-end (gameweeks/matches/team_standings/teams reads -> rule
// evaluation -> gameweeks write) against an in-memory fake that persists
// inserts/updates so a repeat call in the same test sees them, mirroring
// scripts/scripted-gameweek-simulation and src/lib/gameweeks/sync-scoring's
// test doubles.

interface Row {
  [key: string]: unknown;
}

function filterable(rows: Row[]): {
  eq: (col: string, val: unknown) => ReturnType<typeof filterable>;
  in: (col: string, vals: readonly unknown[]) => ReturnType<typeof filterable>;
  order: () => ReturnType<typeof filterable>;
  then: (resolve: (result: { data: Row[]; error: null }) => void) => void;
} {
  return {
    eq: (col, val) => filterable(rows.filter((r) => r[col] === val)),
    in: (col, vals) => filterable(rows.filter((r) => vals.includes(r[col]))),
    order: () => filterable(rows),
    then: (resolve) => resolve({ data: rows, error: null }),
  };
}

function fakeSupabase(seed: {
  competitions?: Row[];
  gameweeks?: Row[];
  matches?: Row[];
  team_standings?: Row[];
  teams?: Row[];
}) {
  const tables: Record<string, Row[]> = {
    competitions: seed.competitions ?? [],
    gameweeks: seed.gameweeks ?? [],
    matches: seed.matches ?? [],
    team_standings: seed.team_standings ?? [],
    teams: seed.teams ?? [],
  };

  const client = {
    from: (table: string) => ({
      select: (_cols: string) => filterable(tables[table]),
      insert: (row: Row) => {
        tables[table].push(row);
        return Promise.resolve({ error: null });
      },
      update: (changes: Row) => ({
        eq: (col: string, val: unknown) => {
          const index = tables[table].findIndex((r) => r[col] === val);
          if (index >= 0) {
            tables[table][index] = { ...tables[table][index], ...changes };
          }
          return Promise.resolve({ error: null });
        },
      }),
    }),
  } as unknown as SupabaseClient;

  return { client, tables };
}

const COMPETITION = { id: "c1", created_at: "2026-01-01T00:00:00Z" };

function gameweek(overrides: Partial<Row> = {}): Row {
  return {
    id: `gw-${overrides.number ?? 1}`,
    competition_id: "c1",
    season_id: "s1",
    number: 1,
    match_1_id: null,
    match_2_id: null,
    match_1_voided_at: null,
    match_2_voided_at: null,
    ...overrides,
  };
}

function match(id: string, overrides: Partial<Row> = {}): Row {
  return {
    id,
    season_id: "s1",
    team_a_id: `team-${id}-a`,
    team_b_id: `team-${id}-b`,
    kickoff_time: "2026-08-22T15:00:00Z",
    status: "scheduled",
    matchday: 2,
    provider_match_id: id,
    ...overrides,
  };
}

const TEAMS = [
  { id: "team-m3-a", previous_season_position: 1 },
  { id: "team-m3-b", previous_season_position: 10 },
  { id: "team-m4-a", previous_season_position: 5 },
  { id: "team-m4-b", previous_season_position: 15 },
  { id: "team-m1-a", previous_season_position: 3 },
  { id: "team-m1-b", previous_season_position: 8 },
  { id: "team-m2-a", previous_season_position: 12 },
  { id: "team-m2-b", previous_season_position: 20 },
];

describe("selectNextGameweekSlots", () => {
  it("no-ops when no competitions exist", async () => {
    const { client } = fakeSupabase({});
    expect(await selectNextGameweekSlots(client)).toBe(0);
  });

  it("only evaluates competitions passed via options.competitionIds, ignoring an eligible one left out", async () => {
    const otherCompetition = { id: "c2", created_at: "2026-01-02T00:00:00Z" };
    const { client, tables } = fakeSupabase({
      competitions: [COMPETITION, otherCompetition],
      gameweeks: [
        gameweek({ number: 1, match_1_id: "m1", match_2_id: "m2" }),
        gameweek({
          id: "gw-c2-1",
          competition_id: "c2",
          number: 1,
          match_1_id: "m1",
          match_2_id: "m2",
        }),
      ],
      matches: [
        match("m1", { status: "completed" }),
        match("m2", { status: "completed" }),
        match("m3", { matchday: 2 }),
        match("m4", { matchday: 2 }),
      ],
      teams: TEAMS,
    });

    const selected = await selectNextGameweekSlots(client, {
      competitionIds: ["c1"],
      random: () => 0,
    });

    expect(selected).toBe(1);
    expect(
      tables.gameweeks.some((g) => g.competition_id === "c1" && g.number === 2),
    ).toBe(true);
    expect(
      tables.gameweeks.some((g) => g.competition_id === "c2" && g.number === 2),
    ).toBe(false);
  });

  it("no-ops when the competition's latest gameweek isn't scoring-complete yet", async () => {
    const { client, tables } = fakeSupabase({
      competitions: [COMPETITION],
      gameweeks: [
        gameweek({
          number: 1,
          match_1_id: "m1",
          match_2_id: "m2",
        }),
      ],
      matches: [
        match("m1", { status: "completed" }),
        match("m2", { status: "scheduled" }),
      ],
    });

    expect(await selectNextGameweekSlots(client)).toBe(0);
    expect(tables.gameweeks.length).toBe(1);
  });

  it("selects and writes gameweek 2 once gameweek 1 is scoring-complete", async () => {
    const { client, tables } = fakeSupabase({
      competitions: [COMPETITION],
      gameweeks: [
        gameweek({
          number: 1,
          match_1_id: "m1",
          match_2_id: "m2",
        }),
      ],
      matches: [
        match("m1", { status: "completed" }),
        match("m2", { status: "completed" }),
        // Gameweek 2's fixture pool.
        match("m3", { matchday: 2, kickoff_time: "2026-08-29T15:00:00Z" }),
        match("m4", { matchday: 2, kickoff_time: "2026-08-29T17:30:00Z" }),
      ],
      teams: TEAMS,
    });

    const selected = await selectNextGameweekSlots(client, {
      now: new Date("2026-08-25T00:00:00Z"),
      random: () => 0,
    });

    expect(selected).toBe(1);
    expect(tables.gameweeks.length).toBe(2);
    const gw2 = tables.gameweeks.find((g) => g.number === 2);
    expect(gw2).toBeDefined();
    expect(gw2?.match_1_id).not.toBeNull();
    expect(gw2?.competition_id).toBe("c1");
    expect(gw2?.season_id).toBe("s1");
  });

  it("is write-once: a repeat call leaves an already-selected gameweek untouched", async () => {
    const { client, tables } = fakeSupabase({
      competitions: [COMPETITION],
      gameweeks: [
        gameweek({ number: 1, match_1_id: "m1", match_2_id: "m2" }),
        gameweek({
          id: "gw-2",
          number: 2,
          match_1_id: "m3",
          match_2_id: "m4",
        }),
      ],
      matches: [
        match("m1", { status: "completed" }),
        match("m2", { status: "completed" }),
        match("m3", { matchday: 2 }),
        match("m4", { matchday: 2 }),
      ],
      teams: TEAMS,
    });

    const selected = await selectNextGameweekSlots(client);

    expect(selected).toBe(0);
    expect(tables.gameweeks.length).toBe(2);
    const gw2 = tables.gameweeks.find((g) => g.number === 2);
    expect(gw2?.match_1_id).toBe("m3");
    expect(gw2?.match_2_id).toBe("m4");
  });

  it("leaves an already-selected gameweek with a legitimate Skipped Slot (match_2_id null) untouched", async () => {
    const { client, tables } = fakeSupabase({
      competitions: [COMPETITION],
      gameweeks: [
        gameweek({ number: 1, match_1_id: "m1", match_2_id: "m2" }),
        gameweek({
          id: "gw-2",
          number: 2,
          match_1_id: "m3",
          match_2_id: null,
        }),
      ],
      matches: [
        match("m1", { status: "completed" }),
        match("m2", { status: "completed" }),
        match("m3", { matchday: 2 }),
      ],
      teams: TEAMS,
    });

    const selected = await selectNextGameweekSlots(client);

    expect(selected).toBe(0);
    const gw2 = tables.gameweeks.find((g) => g.number === 2);
    expect(gw2?.match_1_id).toBe("m3");
    expect(gw2?.match_2_id).toBeNull();
  });

  it("no-ops cleanly at end of season (no fixtures for the next matchday)", async () => {
    const { client, tables } = fakeSupabase({
      competitions: [COMPETITION],
      gameweeks: [gameweek({ number: 38, match_1_id: "m1", match_2_id: "m2" })],
      matches: [
        match("m1", { status: "completed", matchday: 38 }),
        match("m2", { status: "completed", matchday: 38 }),
      ],
      teams: TEAMS,
    });

    const selected = await selectNextGameweekSlots(client);

    expect(selected).toBe(0);
    expect(tables.gameweeks.length).toBe(1);
  });

  it("excludes the previous gameweek's Match 1 clubs from the new Match 1 pool", async () => {
    // m1 (previous Match 1) is team-m1-a/team-m1-b. Gameweek 2's pool has
    // m3 (better average position, but shares no team with m1 here) and a
    // fixture reusing team-m1-a, which must be excluded even though it
    // would otherwise rank best.
    const { client, tables } = fakeSupabase({
      competitions: [COMPETITION],
      gameweeks: [gameweek({ number: 1, match_1_id: "m1", match_2_id: "m2" })],
      matches: [
        match("m1", { status: "completed" }),
        match("m2", { status: "completed" }),
        match("m3", {
          matchday: 2,
          team_a_id: "team-m1-a", // reuses previous Match 1's club
          team_b_id: "team-fresh",
        }),
        match("m4", {
          matchday: 2,
          team_a_id: "team-m4-a",
          team_b_id: "team-m4-b",
        }),
      ],
      teams: [...TEAMS, { id: "team-fresh", previous_season_position: 2 }],
    });

    await selectNextGameweekSlots(client, { random: () => 0 });

    const gw2 = tables.gameweeks.find((g) => g.number === 2);
    // m3 would otherwise win on position (team-m1-a is position 3, team-fresh
    // is position 2 -> average 2.5, beating m4's 5/15 average 10), but its
    // club appeared in the previous Match 1 -- m4 must be chosen instead.
    expect(gw2?.match_1_id).toBe("m4");
  });
});
