import { describe, expect, it } from "vitest";
import { picksForMatch } from "./scope";

// Golden values hand-derived from CLAUDE.md -> Predictions: "Before lock: a
// player can see their own pick; other players' and bots' picks for that
// match are hidden. After lock: all picks for that match become visible to
// everyone."
//
// This is #91's done-when and issue #17's, stated for the MATCH axis:
// "a locked match shows every player's pick including bots and non-pickers,
// an unlocked match shows none of them through any route here". The sibling
// suite picks-for-player.test.ts covers the player axis; the two reads share
// a lock rule and must not drift apart on it.

// picksForMatch reads the wall clock internally (it takes no `now`), so
// these must stay genuinely past and future relative to when the suite runs.
// Fixed dates rot: an earlier draft used February 2026 for "future" and the
// lock tests started passing vacuously once that date went by.
const KICKOFF_PAST = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const KICKOFF_FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

interface Rows {
  matches: Record<string, unknown>[];
  players: Record<string, unknown>[];
  picks: Record<string, unknown>[];
}

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
        single: () => Promise.resolve({ data: data[0] ?? null, error: null }),
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

const rowsWith = (kickoff: string): Rows => ({
  matches: [{ id: "m1", kickoff_time: kickoff }],
  players: [
    {
      id: "p1",
      competition_id: "c1",
      display_name: "Andy",
      emoji: "🦊",
      is_bot: false,
    },
    {
      id: "p2",
      competition_id: "c1",
      display_name: "Sam",
      emoji: "🐢",
      is_bot: false,
    },
    {
      id: "b1",
      competition_id: "c1",
      display_name: "1-1 Bot",
      emoji: "🤖",
      is_bot: true,
    },
    // A player in ANOTHER competition, tipping the same global fixture.
    {
      id: "x1",
      competition_id: "c2",
      display_name: "Outsider",
      emoji: "👻",
      is_bot: false,
    },
  ],
  picks: [
    { player_id: "p1", match_id: "m1", pred_home_score: 2, pred_away_score: 1 },
    { player_id: "b1", match_id: "m1", pred_home_score: 1, pred_away_score: 1 },
    { player_id: "x1", match_id: "m1", pred_home_score: 9, pred_away_score: 9 },
  ],
});

describe("picksForMatch", () => {
  it("returns nothing at all before lock", async () => {
    const result = await picksForMatch(
      fakeSupabase(rowsWith(KICKOFF_FUTURE)),
      "m1",
      "c1",
    );
    expect(result.locked).toBe(false);
    expect("picks" in result).toBe(false);
  });

  it("does not even read picks before lock", async () => {
    const client = fakeSupabase(rowsWith(KICKOFF_FUTURE));
    await picksForMatch(client, "m1", "c1");
    expect(client.touched.includes("picks")).toBe(false);
  });

  it("reveals every player in the competition once locked", async () => {
    const result = await picksForMatch(
      fakeSupabase(rowsWith(KICKOFF_PAST)),
      "m1",
      "c1",
    );
    expect(result.locked).toBe(true);
    if (!result.locked) throw new Error("unreachable");
    expect(result.picks.length).toBe(3);
  });

  // "non-pickers shown as having no pick" -- folded in, not dropped.
  it("keeps a non-picker in the reveal with a null pick", async () => {
    const result = await picksForMatch(
      fakeSupabase(rowsWith(KICKOFF_PAST)),
      "m1",
      "c1",
    );
    if (!result.locked) throw new Error("unreachable");
    const sam = result.picks.find((p) => p.playerId === "p2");
    expect(sam?.predHomeScore).toBe(null);
    expect(sam?.predAwayScore).toBe(null);
  });

  it("includes bots, labelled", async () => {
    const result = await picksForMatch(
      fakeSupabase(rowsWith(KICKOFF_PAST)),
      "m1",
      "c1",
    );
    if (!result.locked) throw new Error("unreachable");
    const bot = result.picks.find((p) => p.playerId === "b1");
    expect(bot?.isBot).toBe(true);
    expect(bot?.predHomeScore).toBe(1);
  });

  // AGENTS.md: matches are global, so match_id alone is not a boundary.
  it("never leaks a player from another competition tipping the same fixture", async () => {
    const result = await picksForMatch(
      fakeSupabase(rowsWith(KICKOFF_PAST)),
      "m1",
      "c1",
    );
    if (!result.locked) throw new Error("unreachable");
    expect(result.picks.some((p) => p.playerId === "x1")).toBe(false);
  });

  // Picks lock FIVE MINUTES BEFORE kickoff, not at kickoff.
  it("locks in the five minutes before kickoff", async () => {
    const rows = rowsWith(new Date(Date.now() + 4 * 60 * 1000).toISOString());
    const result = await picksForMatch(fakeSupabase(rows), "m1", "c1");
    expect(result.locked).toBe(true);
  });

  it("is still open six minutes before kickoff", async () => {
    const rows = rowsWith(new Date(Date.now() + 6 * 60 * 1000).toISOString());
    const result = await picksForMatch(fakeSupabase(rows), "m1", "c1");
    expect(result.locked).toBe(false);
  });
});
