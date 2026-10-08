import { describe, expect, it } from "vitest";
import {
  chunkForRowCap,
  computeStreaks,
  type StreakMatch,
  type StreakPick,
} from "./streaks";

// Golden values hand-derived from issue #217's decisions and CLAUDE.md ->
// Scoring:
//
// - A streak is consecutive RIGHT-RESULT matches in kickoff order (D1),
//   "right result" meaning the engine's breakdown.result !== null (D2) -- so
//   a Wrong Way Round (2-1 picked, 1-2 final) is NOT one, even though it
//   scores a point.
// - No pick breaks the streak (D3); a Voided Match, or a completed match
//   with no final score yet, neither extends nor breaks it (D4, L5).
// - A Late Joiner's pre-join matches never count against them (D6) -- which
//   holds with no special case, see its test. Bots get no streak (D7).
// - Same-kickoff matches order by Number(provider_match_id), with a string
//   fallback when that's NaN (D9).

/** Match `n` kicks off on day `n` of September at 15:00 UTC. */
function match(
  n: number,
  result: { home: number; away: number } | null,
  opts: { voided?: boolean; kickoff?: string; providerMatchId?: string } = {},
): StreakMatch {
  return {
    id: `m${n}`,
    kickoffUtcIso:
      opts.kickoff ?? `2026-09-${String(n).padStart(2, "0")}T15:00:00Z`,
    providerMatchId: opts.providerMatchId ?? String(1000 + n),
    result,
    voided: opts.voided ?? false,
  };
}

function pick(
  playerId: string,
  matchId: string,
  home: number,
  away: number,
): StreakPick {
  return { playerId, matchId, home, away };
}

function human(id: string) {
  return { id, isBot: false, joinedAt: "2026-08-01T00:00:00Z" };
}

function streakOf(result: ReturnType<typeof computeStreaks>, playerId: string) {
  const row = result.find((r) => r.playerId === playerId);
  if (!row) throw new Error(`no streak row for ${playerId}`);
  return row;
}

describe("computeStreaks", () => {
  it("counts a run of five right results", () => {
    // Every final is 2-1 home win; every pick is a home win, none exact.
    const matches = [1, 2, 3, 4, 5].map((n) => match(n, { home: 2, away: 1 }));
    const picks = matches.map((m) => pick("ana", m.id, 1, 0));

    const ana = streakOf(
      computeStreaks({ matches, picks, players: [human("ana")] }),
      "ana",
    );

    expect(ana.current).toBe(5);
    expect(ana.best).toBe(5);
  });

  it("ends a run on a Wrong Way Round, even though it scores a point", () => {
    // m1-m3 final 2-1, picked 1-0 (right result). m4 final 1-2, picked 2-1:
    // the reversed scoreline -- Wrong Way Round, result wrong. m5 right again.
    const matches = [
      match(1, { home: 2, away: 1 }),
      match(2, { home: 2, away: 1 }),
      match(3, { home: 2, away: 1 }),
      match(4, { home: 1, away: 2 }),
      match(5, { home: 2, away: 1 }),
    ];
    const picks = [
      pick("ana", "m1", 1, 0),
      pick("ana", "m2", 1, 0),
      pick("ana", "m3", 1, 0),
      pick("ana", "m4", 2, 1),
      pick("ana", "m5", 1, 0),
    ];

    const ana = streakOf(
      computeStreaks({ matches, picks, players: [human("ana")] }),
      "ana",
    );

    expect(ana.current).toBe(1);
    expect(ana.best).toBe(3);
  });

  it("ends a run on a missing pick", () => {
    // Right on m1, m2; no pick on m3; right on m4.
    const matches = [1, 2, 3, 4].map((n) => match(n, { home: 0, away: 0 }));
    const picks = [
      pick("ana", "m1", 1, 1),
      pick("ana", "m2", 2, 2),
      pick("ana", "m4", 0, 0),
    ];

    const ana = streakOf(
      computeStreaks({ matches, picks, players: [human("ana")] }),
      "ana",
    );

    expect(ana.current).toBe(1);
    expect(ana.best).toBe(2);
  });

  it("skips a voided match mid-run -- it neither extends nor breaks it", () => {
    // m3 is voided after lock with a stored 3-3 that the pick misses, and
    // ana's wrong pick on it must not count. Runs 1-2 and 4-5 join up: 4.
    const matches = [
      match(1, { home: 1, away: 0 }),
      match(2, { home: 1, away: 0 }),
      match(3, { home: 3, away: 3 }, { voided: true }),
      match(4, { home: 1, away: 0 }),
      match(5, { home: 1, away: 0 }),
    ];
    const picks = matches.map((m) => pick("ana", m.id, 2, 0));

    const ana = streakOf(
      computeStreaks({ matches, picks, players: [human("ana")] }),
      "ana",
    );

    expect(ana.current).toBe(4);
    expect(ana.best).toBe(4);
  });

  it("skips a completed match whose final score hasn't landed yet", () => {
    const matches = [
      match(1, { home: 1, away: 0 }),
      match(2, null),
      match(3, { home: 1, away: 0 }),
    ];
    const picks = [pick("ana", "m1", 1, 0), pick("ana", "m3", 1, 0)];

    const ana = streakOf(
      computeStreaks({ matches, picks, players: [human("ana")] }),
      "ana",
    );

    expect(ana.current).toBe(2);
  });

  it("ignores picks dated before a player joined (D6), even if the data has them", () => {
    // The app can't write a pick before joined_at, but nothing in the
    // schema forbids one (staging test data can). Joined at m3's kickoff:
    // right picks on m1-m2 must not count, so the run is m3-m4 only.
    const matches = [1, 2, 3, 4].map((n) => match(n, { home: 2, away: 2 }));
    const picks = matches.map((m) => pick("lou", m.id, 1, 1));
    const players = [
      { id: "lou", isBot: false, joinedAt: "2026-09-03T15:00:00Z" },
    ];

    const lou = streakOf(computeStreaks({ matches, picks, players }), "lou");

    expect(lou.current).toBe(2);
    expect(lou.best).toBe(2);
  });

  it("doesn't hold a Late Joiner's pre-join matches against them", () => {
    // Joined at m3's kickoff; m1-m2 have no picks. D6 needs no special case:
    // a no-pick before a player's first pick can only "break" a streak that
    // is already 0, so the run from m3 counts in full either way.
    const matches = [1, 2, 3, 4, 5].map((n) => match(n, { home: 0, away: 1 }));
    const picks = ["m3", "m4", "m5"].map((id) => pick("lou", id, 0, 2));
    const players = [
      { id: "lou", isBot: false, joinedAt: "2026-09-03T15:00:00Z" },
    ];

    const lou = streakOf(computeStreaks({ matches, picks, players }), "lou");

    expect(lou.current).toBe(3);
    expect(lou.best).toBe(3);
  });

  it("orders same-kickoff matches by numeric provider id, not text", () => {
    // Both at the same instant. Numerically 99 < 100; as text "100" < "99".
    // m-a (id 99) is the right result, m-b (id 100) the wrong one: in true
    // order the run ends on the wrong one, so current is 0.
    const kickoff = "2026-09-06T14:00:00Z";
    const matches = [
      match(1, { home: 1, away: 0 }),
      {
        ...match(2, { home: 1, away: 0 }, { kickoff, providerMatchId: "100" }),
        id: "m-b",
      },
      {
        ...match(3, { home: 1, away: 0 }, { kickoff, providerMatchId: "99" }),
        id: "m-a",
      },
    ];
    const picks = [
      pick("ana", "m1", 1, 0),
      pick("ana", "m-a", 2, 0),
      pick("ana", "m-b", 0, 0),
    ];

    const ana = streakOf(
      computeStreaks({ matches, picks, players: [human("ana")] }),
      "ana",
    );

    expect(ana.current).toBe(0);
    expect(ana.best).toBe(2);
  });

  it("falls back to a text compare when a provider id isn't numeric", () => {
    // Non-numeric ids (the scripted sim's `sim-m1-...`): "sim-a" < "sim-b".
    const kickoff = "2026-09-06T14:00:00Z";
    const matches = [
      {
        ...match(
          1,
          { home: 0, away: 0 },
          { kickoff, providerMatchId: "sim-b" },
        ),
        id: "m-b",
      },
      {
        ...match(
          2,
          { home: 0, away: 0 },
          { kickoff, providerMatchId: "sim-a" },
        ),
        id: "m-a",
      },
    ];
    const picks = [pick("ana", "m-a", 0, 0), pick("ana", "m-b", 3, 0)];

    const ana = streakOf(
      computeStreaks({ matches, picks, players: [human("ana")] }),
      "ana",
    );

    expect(ana.current).toBe(0);
    expect(ana.best).toBe(1);
  });

  it("returns no streak for a bot", () => {
    const matches = [1, 2, 3, 4, 5].map((n) => match(n, { home: 1, away: 1 }));
    const picks = matches.flatMap((m) => [
      pick("ana", m.id, 1, 1),
      pick("bot-11", m.id, 1, 1),
    ]);
    const players = [
      human("ana"),
      { id: "bot-11", isBot: true, joinedAt: "2026-08-01T00:00:00Z" },
    ];

    const result = computeStreaks({ matches, picks, players });

    expect(result.length).toBe(1);
    expect(streakOf(result, "ana").current).toBe(5);
  });

  it("keeps the season best after a longer run snaps", () => {
    // Six right (2-0 finals, 1-0 picks), one wrong (picked a draw), two right.
    const matches = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) =>
      match(n, { home: 2, away: 0 }),
    );
    const picks = matches.map((m) =>
      m.id === "m7" ? pick("ana", m.id, 1, 1) : pick("ana", m.id, 1, 0),
    );

    const ana = streakOf(
      computeStreaks({ matches, picks, players: [human("ana")] }),
      "ana",
    );

    expect(ana.current).toBe(2);
    expect(ana.best).toBe(6);
  });
});

// Supabase's max_rows = 1000 (supabase/config.toml) truncates silently, so
// the season-wide picks read is split into chunks of at most 900 rows
// (headroom under the cap) -- floor(900 / humans) matches per chunk.
describe("chunkForRowCap", () => {
  const ids = Array.from({ length: 76 }, (_, i) => `m${i + 1}`);

  it("splits a full season for 20 humans into chunks of 45 matches", () => {
    const chunks = chunkForRowCap(ids, 20);
    expect(chunks.length).toBe(2);
    expect(chunks[0].length).toBe(45);
    expect(chunks[1].length).toBe(31);
  });

  it("keeps a full season for 11 humans in one chunk", () => {
    // floor(900 / 11) = 81 >= 76.
    expect(chunkForRowCap(ids, 11).length).toBe(1);
  });

  it("returns no chunks when there are no humans or no matches", () => {
    expect(chunkForRowCap(ids, 0).length).toBe(0);
    expect(chunkForRowCap([], 12).length).toBe(0);
  });
});
