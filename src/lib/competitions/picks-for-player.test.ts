import { describe, expect, it } from "vitest";
import { picksForPlayer } from "./scope";

// Golden values hand-derived from CLAUDE.md -> Predictions ("Picks lock 5
// minutes before scheduled kickoff"; "Before lock: a player can see their own
// pick; other players' and bots' picks for that match are hidden") and
// docs/adr/0013-match-centre-tense-and-axes.md D10.
//
// These tests exist for ONE property, and it is a security property, not a
// formatting one: `picksForPlayer` must not return an unlocked pick, to any
// caller, ever. Issue #17's done-when applies here verbatim -- a second
// player must not be able to read another's pre-lock pick "via any route,
// including direct API calls", and a picks-by-player read is the natural
// formulation that breaks it.

const KICKOFF_PAST = "2026-02-14T12:30:00.000Z";
const KICKOFF_FUTURE = "2026-02-21T12:30:00.000Z";
const NOW = new Date("2026-02-16T00:00:00.000Z");

interface Rows {
  players: { id: string; competition_id: string }[];
  gameweeks: Record<string, unknown>[];
  matches: Record<string, unknown>[];
  picks: Record<string, unknown>[];
}

/** Minimal stand-in for the query-builder chain this function uses. Records
 *  every table it touched, so a test can assert on the shape of the access
 *  and not only on the returned rows. */
function fakeSupabase(rows: Rows) {
  const touched: string[] = [];
  const client = {
    touched,
    from(table: keyof Rows) {
      touched.push(table);
      let data: unknown[] = [...(rows[table] as unknown[])];
      const builder = {
        select: () => builder,
        eq(col: string, value: unknown) {
          data = data.filter(
            (r) => (r as Record<string, unknown>)[col] === value,
          );
          return builder;
        },
        in(col: string, values: unknown[]) {
          data = data.filter((r) =>
            values.includes((r as Record<string, unknown>)[col]),
          );
          return builder;
        },
        order: () => Promise.resolve({ data, error: null }),
        maybeSingle: () =>
          Promise.resolve({ data: data[0] ?? null, error: null }),
        then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
          resolve({ data, error: null }),
      };
      return builder;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return client as any;
}

const baseRows = (): Rows => ({
  players: [{ id: "p1", competition_id: "c1" }],
  gameweeks: [
    {
      number: 24,
      competition_id: "c1",
      season_id: "s1",
      match_1_id: "m-locked",
      match_2_id: "m-open",
      match_1_voided_at: null,
      match_2_voided_at: null,
    },
  ],
  matches: [
    {
      id: "m-locked",
      kickoff_time: KICKOFF_PAST,
      team_a_id: "t1",
      team_b_id: "t2",
      team_a_score: 2,
      team_b_score: 1,
    },
    {
      id: "m-open",
      kickoff_time: KICKOFF_FUTURE,
      team_a_id: "t3",
      team_b_id: "t4",
      team_a_score: null,
      team_b_score: null,
    },
  ],
  picks: [
    {
      player_id: "p1",
      match_id: "m-locked",
      pred_home_score: 2,
      pred_away_score: 0,
    },
    {
      player_id: "p1",
      match_id: "m-open",
      pred_home_score: 3,
      pred_away_score: 1,
    },
    // Another player's pick on the same match, to prove the read is scoped
    // to one player and not just to the match set.
    {
      player_id: "p2",
      match_id: "m-locked",
      pred_home_score: 9,
      pred_away_score: 9,
    },
  ],
});

describe("picksForPlayer", () => {
  it("returns a locked pick", async () => {
    const rows = await picksForPlayer(
      fakeSupabase(baseRows()),
      "p1",
      "c1",
      "s1",
      NOW,
    );
    const locked = rows.find((r) => r.matchId === "m-locked");
    expect(locked).toMatchObject({
      locked: true,
      predHomeScore: 2,
      predAwayScore: 0,
      resultHome: 2,
      resultAway: 1,
    });
  });

  // The whole reason this module exists.
  it("blanks an unlocked pick even though the row exists in the table", async () => {
    const rows = await picksForPlayer(
      fakeSupabase(baseRows()),
      "p1",
      "c1",
      "s1",
      NOW,
    );
    const open = rows.find((r) => r.matchId === "m-open");
    expect(open).toMatchObject({
      locked: false,
      predHomeScore: null,
      predAwayScore: null,
    });
  });

  it("leaks nothing anywhere in the returned set before lock", async () => {
    const before = new Date("2026-02-01T00:00:00.000Z");
    const rows = await picksForPlayer(
      fakeSupabase(baseRows()),
      "p1",
      "c1",
      "s1",
      before,
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => !r.locked)).toBe(true);
    expect(
      rows.every((r) => r.predHomeScore === null && r.predAwayScore === null),
    ).toBe(true);
  });

  // Lock is enforced 5 minutes BEFORE kickoff, not at kickoff.
  it("locks in the five minutes before kickoff", async () => {
    const fourMinutesBefore = new Date(
      new Date(KICKOFF_FUTURE).getTime() - 4 * 60 * 1000,
    );
    const rows = await picksForPlayer(
      fakeSupabase(baseRows()),
      "p1",
      "c1",
      "s1",
      fourMinutesBefore,
    );
    expect(rows.find((r) => r.matchId === "m-open")?.locked).toBe(true);
  });

  it("refuses a player who isn't in the competition, without reading picks", async () => {
    const client = fakeSupabase(baseRows());
    const rows = await picksForPlayer(client, "p1", "other-comp", "s1", NOW);
    expect(rows).toEqual([]);
    expect(client.touched).not.toContain("picks");
  });

  it("marks a Voided Match as called off, keeping the pick that was filed", async () => {
    const rows = baseRows();
    rows.gameweeks[0].match_1_voided_at = "2026-02-14T13:00:00.000Z";
    const result = await picksForPlayer(
      fakeSupabase(rows),
      "p1",
      "c1",
      "s1",
      NOW,
    );
    expect(result.find((r) => r.matchId === "m-locked")).toMatchObject({
      calledOff: true,
      predHomeScore: 2,
    });
  });

  it("omits a Skipped Slot rather than emitting an empty row", async () => {
    const rows = baseRows();
    rows.gameweeks[0].match_2_id = null;
    const result = await picksForPlayer(
      fakeSupabase(rows),
      "p1",
      "c1",
      "s1",
      NOW,
    );
    expect(result).toHaveLength(1);
    expect(result[0].matchId).toBe("m-locked");
  });

  it("returns only this player's picks, not everyone's on the same match", async () => {
    const rows = await picksForPlayer(
      fakeSupabase(baseRows()),
      "p1",
      "c1",
      "s1",
      NOW,
    );
    expect(rows.find((r) => r.matchId === "m-locked")?.predHomeScore).toBe(2);
  });

  it("scopes to the season it was asked for", async () => {
    const rows = baseRows();
    rows.gameweeks[0].season_id = "other-season";
    const result = await picksForPlayer(
      fakeSupabase(rows),
      "p1",
      "c1",
      "s1",
      NOW,
    );
    expect(result).toEqual([]);
  });
});
