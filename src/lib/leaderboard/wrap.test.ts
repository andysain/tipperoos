import { describe, expect, it } from "vitest";
import {
  buildGameweekWrap,
  type GameweekWrapInput,
  type WrapAward,
  type WrapMatch,
} from "./wrap";
import type { StreakPick } from "./streaks";

// Golden values hand-derived from issue #218's decisions (D1-D9) and its
// decision log (L1-L12):
//
// - Tipper of the Week: highest human gameweek_score in N, not at 0; bonus
//   "only one to call" when no other human picked that exact scoreline.
// - Top of the Hill: newcomers to human rank 1 at N vs N-1 (L4).
// - On Fire: current through N >= 5 and either just reached it or strictly
//   above every human's best through N-1 (L3).
// - Rocket: biggest human climb N-1 -> N, only >= 3 places; late joiners
//   with a zero N-1 row excluded (L6).
// - Streak Snapped: current through N-1 >= 5, broken by one of N's counted
//   matches; "ended at" is the value just before the break (L2).
// - Furthest Off: largest goal error among 0-point human picks in N; the
//   kindness rule applies as awarded, chained from the first gameweek (L1).
// - At most 4 shown: Tipper, then up to 2 of Top > On Fire > Rocket >
//   Snapped, then Furthest Off (D5).

const JOINED = "2026-08-01T00:00:00Z";

/** Gameweek g, slot s (1 or 2) kicks off on day 2g+s of August... spread
 *  across months safely by using a base timestamp plus whole days. */
function kickoff(gameweek: number, slot: number): string {
  const base = Date.parse("2026-08-15T14:00:00Z");
  const day = 86_400_000;
  return new Date(base + ((gameweek - 1) * 7 + slot) * day).toISOString();
}

function match(
  gameweek: number,
  slot: number,
  result: { home: number; away: number } | null,
  opts: { voided?: boolean } = {},
): WrapMatch {
  return {
    id: `g${gameweek}s${slot}`,
    gameweekNumber: gameweek,
    kickoffUtcIso: kickoff(gameweek, slot),
    providerMatchId: String(gameweek * 10 + slot),
    homeTeam: `Home ${gameweek}.${slot}`,
    awayTeam: `Away ${gameweek}.${slot}`,
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

function human(id: string, joinedAt = JOINED) {
  return { id, isBot: false, joinedAt };
}

function snap(playerId: string, gameweekScore: number, seasonTotal: number) {
  return { playerId, gameweekScore, seasonTotal };
}

function base(overrides: Partial<GameweekWrapInput>): GameweekWrapInput {
  return {
    gameweekNumber: 1,
    players: [],
    matches: [],
    picks: [],
    scoredGameweekNumbers: [1],
    snapshot: [],
    previousSnapshot: null,
    ...overrides,
  };
}

function award<K extends WrapAward["kind"]>(
  awards: readonly WrapAward[],
  kind: K,
): Extract<WrapAward, { kind: K }> | undefined {
  return awards.find(
    (a): a is Extract<WrapAward, { kind: K }> => a.kind === kind,
  );
}

describe("buildGameweekWrap: Tipper of the Week", () => {
  it("goes to the highest human gameweek score, ties listed", () => {
    const wrap = buildGameweekWrap(
      base({
        players: [human("ana"), human("ben"), human("cat")],
        snapshot: [snap("ana", 9, 9), snap("ben", 9, 9), snap("cat", 4, 4)],
      }),
    );

    const tipper = award(wrap.fired, "tipper")!;
    expect(tipper.winners.length).toBe(2);
    expect(tipper.winners[0].points).toBe(9);
    // A tie for top has no next best.
    expect(tipper.nextBest).toBe(null);
  });

  it("names the next best score below a single winner, ties listed", () => {
    const wrap = buildGameweekWrap(
      base({
        players: [human("ana"), human("ben"), human("cat"), human("dan")],
        snapshot: [
          snap("ana", 12, 12),
          snap("ben", 10, 10),
          snap("cat", 10, 10),
          snap("dan", 3, 3),
        ],
      }),
    );

    const next = award(wrap.fired, "tipper")!.nextBest!;
    expect(next.points).toBe(10);
    expect(next.playerIds.join(",")).toBe("ben,cat");
  });

  it("has no next best when nobody else scored", () => {
    const wrap = buildGameweekWrap(
      base({
        players: [human("ana"), human("ben")],
        snapshot: [snap("ana", 4, 4), snap("ben", 0, 0)],
      }),
    );

    expect(award(wrap.fired, "tipper")!.nextBest).toBe(null);
  });

  it("doesn't fire when the top score is 0", () => {
    const wrap = buildGameweekWrap(
      base({
        players: [human("ana"), human("ben")],
        snapshot: [snap("ana", 0, 0), snap("ben", 0, 0)],
      }),
    );

    expect(award(wrap.fired, "tipper")).toBe(undefined);
    expect(wrap.fired.length).toBe(0);
  });
});

describe("buildGameweekWrap: the only-one-to-call-it line", () => {
  // GW1: g1s1 finished 3-1, g1s2 finished 0-0.
  const matches = [
    match(1, 1, { home: 3, away: 1 }),
    match(1, 2, { home: 0, away: 0 }),
  ];

  it("names an exact score no other human picked", () => {
    const wrap = buildGameweekWrap(
      base({
        players: [human("ana"), human("ben")],
        matches,
        picks: [
          pick("ana", "g1s1", 3, 1),
          pick("ben", "g1s1", 2, 1),
          pick("ana", "g1s2", 1, 0),
          pick("ben", "g1s2", 1, 1),
        ],
        snapshot: [snap("ana", 7, 7), snap("ben", 6, 6)],
      }),
    );

    const call = award(wrap.fired, "tipper")!.winners[0].onlyCall!;
    expect(call.home).toBe(3);
    expect(call.away).toBe(1);
  });

  it("leaves it out when another human called the same exact score", () => {
    const wrap = buildGameweekWrap(
      base({
        players: [human("ana"), human("ben")],
        matches,
        picks: [pick("ana", "g1s1", 3, 1), pick("ben", "g1s1", 3, 1)],
        snapshot: [snap("ana", 7, 7), snap("ben", 7, 7)],
      }),
    );

    const tipper = award(wrap.fired, "tipper")!;
    expect(tipper.winners.length).toBe(2);
    expect(tipper.winners[0].onlyCall).toBe(null);
  });
});

describe("buildGameweekWrap: Top of the Hill", () => {
  const players = [
    human("ana"),
    human("ben"),
    human("cat"),
    { id: "bot", isBot: true, joinedAt: JOINED },
  ];

  it("goes to a new human leader, never a bot", () => {
    // N-1: ana 20, ben 18. N: ben 25, ana 22. The bot on 40 ranks no one.
    const wrap = buildGameweekWrap(
      base({
        gameweekNumber: 2,
        scoredGameweekNumbers: [1, 2],
        players,
        previousSnapshot: [
          snap("ana", 0, 20),
          snap("ben", 0, 18),
          snap("bot", 0, 30),
        ],
        snapshot: [snap("ana", 2, 22), snap("ben", 7, 25), snap("bot", 10, 40)],
      }),
    );

    const top = award(wrap.fired, "topOfTheHill")!;
    expect(top.winners.length).toBe(1);
    expect(top.winners[0].playerId).toBe("ben");
    expect(top.winners[0].jointTop).toBe(false);
  });

  it("lists only the newcomer when they draw level with the leader (joint top)", () => {
    const wrap = buildGameweekWrap(
      base({
        gameweekNumber: 2,
        scoredGameweekNumbers: [1, 2],
        players,
        previousSnapshot: [snap("ana", 0, 20), snap("ben", 0, 18)],
        snapshot: [snap("ana", 1, 21), snap("ben", 3, 21)],
      }),
    );

    const top = award(wrap.fired, "topOfTheHill")!;
    expect(top.winners.length).toBe(1);
    expect(top.winners[0].playerId).toBe("ben");
    expect(top.winners[0].jointTop).toBe(true);
  });

  it("doesn't fire when the leader stays top, or with no N-1 snapshot", () => {
    const stays = buildGameweekWrap(
      base({
        gameweekNumber: 2,
        scoredGameweekNumbers: [1, 2],
        players,
        previousSnapshot: [snap("ana", 0, 20), snap("ben", 0, 18)],
        snapshot: [snap("ana", 3, 23), snap("ben", 3, 21)],
      }),
    );
    const noPrevious = buildGameweekWrap(
      base({
        gameweekNumber: 2,
        scoredGameweekNumbers: [2],
        players,
        previousSnapshot: null,
        snapshot: [snap("ana", 3, 3), snap("ben", 1, 1)],
      }),
    );

    expect(award(stays.fired, "topOfTheHill")).toBe(undefined);
    expect(award(noPrevious.fired, "topOfTheHill")).toBe(undefined);
    expect(award(noPrevious.fired, "rocket")).toBe(undefined);
  });
});

describe("buildGameweekWrap: Rocket", () => {
  const five = ["p1", "p2", "p3", "p4", "p5"].map((id) => human(id));
  // N-1 standings p1..p5 = 50, 40, 30, 20, 10 (ranks 1..5).
  const previousSnapshot = [
    snap("p1", 0, 50),
    snap("p2", 0, 40),
    snap("p3", 0, 30),
    snap("p4", 0, 20),
    snap("p5", 0, 10),
  ];
  const matches = [
    match(1, 1, { home: 1, away: 0 }),
    match(2, 1, { home: 1, away: 0 }),
  ];

  it("fires for a climb of 3 places, with the new rank", () => {
    // p5 jumps from 5th to 2nd.
    const wrap = buildGameweekWrap(
      base({
        gameweekNumber: 2,
        scoredGameweekNumbers: [1, 2],
        players: five,
        matches,
        previousSnapshot,
        snapshot: [
          snap("p1", 1, 51),
          snap("p2", 1, 41),
          snap("p3", 1, 31),
          snap("p4", 1, 21),
          snap("p5", 35, 45),
        ],
      }),
    );

    const rocket = award(wrap.fired, "rocket")!;
    expect(rocket.winners[0].playerId).toBe("p5");
    expect(rocket.winners[0].placesClimbed).toBe(3);
    expect(rocket.winners[0].newRank).toBe(2);
  });

  it("doesn't fire for a climb of 2", () => {
    // p5 from 5th to 3rd.
    const wrap = buildGameweekWrap(
      base({
        gameweekNumber: 2,
        scoredGameweekNumbers: [1, 2],
        players: five,
        matches,
        previousSnapshot,
        snapshot: [
          snap("p1", 1, 51),
          snap("p2", 1, 41),
          snap("p3", 1, 31),
          snap("p4", 1, 21),
          snap("p5", 25, 35),
        ],
      }),
    );

    expect(award(wrap.fired, "rocket")).toBe(undefined);
  });

  it("excludes a late joiner whose N-1 row is a zero written after they joined (L6)", () => {
    // late joined after GW1's kickoff; the sync still wrote them a GW1 row
    // of 0, so 6th -> 1st would read as a 5-place rocket. It mustn't.
    const late = { id: "late", isBot: false, joinedAt: kickoff(1, 2) };
    const wrap = buildGameweekWrap(
      base({
        gameweekNumber: 2,
        scoredGameweekNumbers: [1, 2],
        players: [...five, late],
        matches,
        previousSnapshot: [...previousSnapshot, snap("late", 0, 0)],
        snapshot: [
          snap("p1", 1, 51),
          snap("p2", 1, 41),
          snap("p3", 1, 31),
          snap("p4", 1, 21),
          snap("p5", 1, 11),
          snap("late", 60, 60),
        ],
      }),
    );

    expect(award(wrap.fired, "rocket")).toBe(undefined);
  });
});

/** `gameweeks` gameweeks of 2 matches, every final 2-0. */
function season(gameweeks: number): WrapMatch[] {
  return Array.from({ length: gameweeks }, (_, i) => [
    match(i + 1, 1, { home: 2, away: 0 }),
    match(i + 1, 2, { home: 2, away: 0 }),
  ]).flat();
}
/** A right result (1-0 for a 2-0 final), never exact. */
const right = (playerId: string, m: WrapMatch) => pick(playerId, m.id, 1, 0);
/** A wrong result (a draw for a 2-0 final). */
const wrong = (playerId: string, m: WrapMatch) => pick(playerId, m.id, 1, 1);

function streakWrap(
  n: number,
  players: ReturnType<typeof human>[],
  picks: StreakPick[],
) {
  const scored = Array.from({ length: n }, (_, i) => i + 1);
  return buildGameweekWrap(
    base({
      gameweekNumber: n,
      scoredGameweekNumbers: scored,
      players,
      matches: season(n),
      picks,
      snapshot: players.map((p) => snap(p.id, 0, 0)),
      previousSnapshot: players.map((p) => snap(p.id, 0, 0)),
    }),
  );
}

describe("buildGameweekWrap: On Fire", () => {
  it("fires the week a streak reaches 5", () => {
    // 6 right through GW3; through GW2 it was 4.
    const ms = season(3);
    const wrap = streakWrap(
      3,
      [human("ana")],
      ms.map((m) => right("ana", m)),
    );

    const fire = award(wrap.fired, "onFire")!;
    expect(fire.winners[0].streakLength).toBe(6);
    expect(fire.winners[0].newRecord).toBe(false);
  });

  it("doesn't fire for a streak that simply continues, even as the record holder", () => {
    // 8 right through GW4: already 6 (and the season record) through GW3.
    const ms = season(4);
    const wrap = streakWrap(
      4,
      [human("ana")],
      ms.map((m) => right("ana", m)),
    );

    expect(award(wrap.fired, "onFire")).toBe(undefined);
  });

  it("fires for a new season record that passes someone else's best", () => {
    // ben: 6 right in GW1-3, then wrong -> best 6. ana: wrong in GW1, then
    // right from g1s2 on -> 5 through GW3 (already >= 5, so no "reached"),
    // 7 through GW4 > ben's 6 -> new record.
    const ms = season(4);
    const picks = ms.flatMap((m) => [
      m.id === "g1s1" ? wrong("ana", m) : right("ana", m),
      m.gameweekNumber === 4 ? wrong("ben", m) : right("ben", m),
    ]);
    const wrap = streakWrap(4, [human("ana"), human("ben")], picks);

    const fire = award(wrap.fired, "onFire")!;
    expect(fire.winners.length).toBe(1);
    expect(fire.winners[0].playerId).toBe("ana");
    expect(fire.winners[0].streakLength).toBe(7);
    expect(fire.winners[0].newRecord).toBe(true);
  });

  it("doesn't call equalling the record a new one", () => {
    // ben best 6 (GW1-3), ana 6 through GW4 (wrong on GW1 both) -- equal.
    const ms = season(4);
    const picks = ms.flatMap((m) => [
      m.gameweekNumber === 1 ? wrong("ana", m) : right("ana", m),
      m.gameweekNumber === 4 ? wrong("ben", m) : right("ben", m),
    ]);
    const wrap = streakWrap(4, [human("ana"), human("ben")], picks);

    // ana was 4 through GW3 and is 6 through GW4: that's "reached 5", not
    // a record.
    const fire = award(wrap.fired, "onFire")!;
    expect(fire.winners[0].newRecord).toBe(false);
  });
});

describe("buildGameweekWrap: On Fire record edge cases (L3)", () => {
  it("doesn't fire when an already-hot streak only draws level with the record", () => {
    // ben: right GW1-4 (8), wrong GW5 -> best 8 through GW5. ana: wrong
    // GW1, right GW2-5 (8 through GW5), and 6 through GW4 (already >= 5).
    // Through GW4 ana is 6 (already hot) and ben's run is 8 -- the record.
    // Through GW5 ana is 8: level with the record, which isn't a new one,
    // and not "reached 5" either.
    const ms = season(5);
    const picks = ms.flatMap((m) => [
      m.gameweekNumber === 1 ? wrong("ana", m) : right("ana", m),
      m.gameweekNumber === 5 ? wrong("ben", m) : right("ben", m),
    ]);
    const wrap = streakWrap(5, [human("ana"), human("ben")], picks);

    expect(award(wrap.fired, "onFire")).toBe(undefined);
  });

  it("fires when a streak level with someone else's record passes it", () => {
    // ben: right GW1-3 (6), wrong GW4 -> best 6. ana: wrong GW1, right
    // from GW2: 4 through GW3, 6 through GW4 (level with ben), 8 through
    // GW5 -> passes ben's record. Level-with-someone-else is not "holding"
    // the record, so this is a new one.
    const ms = season(5);
    const picks = ms.flatMap((m) => [
      m.gameweekNumber === 1 ? wrong("ana", m) : right("ana", m),
      m.gameweekNumber >= 4 ? wrong("ben", m) : right("ben", m),
    ]);
    const wrap = streakWrap(5, [human("ana"), human("ben")], picks);

    const fire = award(wrap.fired, "onFire")!;
    expect(fire.winners[0].playerId).toBe("ana");
    expect(fire.winners[0].streakLength).toBe(8);
    expect(fire.winners[0].newRecord).toBe(true);
  });
});

describe("buildGameweekWrap: Streak Snapped", () => {
  it("fires when a run of 5+ breaks, giving the length it ended at", () => {
    // 6 right through GW3; GW4: right then wrong -> ended at 7.
    const ms = season(4);
    const picks = ms.map((m) =>
      m.id === "g4s2" ? wrong("ana", m) : right("ana", m),
    );
    const wrap = streakWrap(4, [human("ana")], picks);

    const snapped = award(wrap.fired, "streakSnapped")!;
    expect(snapped.winners[0].endedAt).toBe(7);
    expect(snapped.winners[0].stillSeasonBest).toBe(true);
    // The match that broke it, so the card can name it.
    expect(snapped.winners[0].homeTeam).toBe("Home 4.2");
    expect(snapped.winners[0].awayTeam).toBe("Away 4.2");
  });

  it("doesn't fire when the broken run was only 4", () => {
    // 4 right through GW2, wrong in GW3.
    const ms = season(3);
    const picks = ms.map((m) =>
      m.gameweekNumber === 3 ? wrong("ana", m) : right("ana", m),
    );
    const wrap = streakWrap(3, [human("ana")], picks);

    expect(award(wrap.fired, "streakSnapped")).toBe(undefined);
  });

  it("isn't 'still the season best' when someone's run was longer", () => {
    // ben: 8 right GW1-4 (best 8). ana: wrong g1s1, right to GW4 (7), then
    // wrong in GW5 -> ended at 7, not the season best.
    const ms = season(5);
    const picks = ms.flatMap((m) => [
      m.id === "g1s1" || m.gameweekNumber === 5
        ? wrong("ana", m)
        : right("ana", m),
      m.gameweekNumber === 5 ? wrong("ben", m) : right("ben", m),
    ]);
    const wrap = streakWrap(5, [human("ana"), human("ben")], picks);

    const snapped = award(wrap.fired, "streakSnapped")!;
    const ana = snapped.winners.find((w) => w.playerId === "ana")!;
    const ben = snapped.winners.find((w) => w.playerId === "ben")!;
    expect(ana.endedAt).toBe(7);
    expect(ana.stillSeasonBest).toBe(false);
    expect(ben.endedAt).toBe(8);
  });
});

describe("buildGameweekWrap: Furthest Off", () => {
  it("goes to the largest goal error among 0-point picks", () => {
    // Final 2-0. ana 0-3 -> error 2+3 = 5. ben 1-1 -> 1+1 = 2.
    const m = match(1, 1, { home: 2, away: 0 });
    const wrap = buildGameweekWrap(
      base({
        players: [human("ana"), human("ben")],
        matches: [m],
        picks: [pick("ana", m.id, 0, 3), pick("ben", m.id, 1, 1)],
        snapshot: [snap("ana", 0, 0), snap("ben", 0, 0)],
      }),
    );

    const off = award(wrap.fired, "furthestOff")!;
    expect(off.winners.length).toBe(1);
    expect(off.winners[0].playerId).toBe("ana");
    expect(off.winners[0].goalError).toBe(5);
    expect(off.winners[0].pick.away).toBe(3);
    // The card names the fixture, so the award carries it.
    expect(off.winners[0].homeTeam).toBe("Home 1.1");
    expect(off.winners[0].awayTeam).toBe("Away 1.1");
  });

  it("never goes to a Wrong Way Round, a missing pick, or a voided or result-less match", () => {
    // g1s1 final 3-0: ana's 0-3 is a Wrong Way Round (1 point, error 6).
    // g1s2 has no final score yet and g1s3 is voided -- ben's 9-9 misses on
    // them are judged on nothing. cat has no pick at all.
    const wwr = match(1, 1, { home: 3, away: 0 });
    const noResult = match(1, 2, null);
    const voided = { ...match(1, 3, { home: 0, away: 0 }, { voided: true }) };
    const wrap = buildGameweekWrap(
      base({
        players: [human("ana"), human("ben"), human("cat")],
        matches: [wwr, noResult, voided],
        picks: [
          pick("ana", wwr.id, 0, 3),
          pick("ben", noResult.id, 9, 9),
          pick("ben", voided.id, 9, 9),
        ],
        snapshot: [snap("ana", 1, 1), snap("ben", 0, 0), snap("cat", 0, 0)],
      }),
    );

    expect(award(wrap.fired, "furthestOff")).toBe(undefined);
  });

  it("applies the kindness rule as awarded, chained from GW1 (L1)", () => {
    // Every final 2-0. ana's miss (0-5, error 7) is the biggest every week;
    // ben's (1-1, error 2) is second.
    // GW1: ana. GW2: ana was GW1's, so ben. GW3: GW2's was ben, so ana
    // again -- computing GW2 "raw" would wrongly have excluded ana.
    const ms = season(3);
    const picks = ms.flatMap((m) => [
      pick("ana", m.id, 0, 5),
      pick("ben", m.id, 1, 1),
    ]);
    const players = [human("ana"), human("ben")];
    const wrapFor = (n: number) =>
      buildGameweekWrap(
        base({
          gameweekNumber: n,
          scoredGameweekNumbers: Array.from({ length: n }, (_, i) => i + 1),
          players,
          matches: ms,
          picks,
          snapshot: [snap("ana", 0, 0), snap("ben", 0, 0)],
          previousSnapshot:
            n > 1 ? [snap("ana", 0, 0), snap("ben", 0, 0)] : null,
        }),
      );

    expect(award(wrapFor(2).fired, "furthestOff")!.winners[0].playerId).toBe(
      "ben",
    );
    expect(award(wrapFor(3).fired, "furthestOff")!.winners[0].playerId).toBe(
      "ana",
    );
    expect(award(wrapFor(3).fired, "furthestOff")!.winners[0].goalError).toBe(
      7,
    );
  });
});

describe("buildGameweekWrap: the cap of 4, order, and bots", () => {
  it("shows Tipper, the top 2 of the rest by priority, then Furthest Off", () => {
    // GW3, every final 2-0.
    // - ana right on all 6 matches: reaches 5 -> On Fire.
    // - cat: 5th -> 1st on totals -> Top of the Hill AND Rocket (4 places),
    //   and the top gameweek score -> Tipper.
    // - ben: a 1-1 miss in GW3 -> Furthest Off.
    // Five fired; Rocket is the one the cap drops.
    const ms = season(3);
    const picks = [
      ...ms.map((m) => right("ana", m)),
      ...ms.filter((m) => m.gameweekNumber === 3).map((m) => wrong("ben", m)),
    ];
    const players = ["ana", "ben", "cat", "dan", "eve"].map((id) => human(id));
    const wrap = buildGameweekWrap(
      base({
        gameweekNumber: 3,
        scoredGameweekNumbers: [1, 2, 3],
        players: [...players, { id: "bot", isBot: true, joinedAt: JOINED }],
        matches: ms,
        picks,
        previousSnapshot: [
          snap("ben", 0, 50),
          snap("ana", 0, 40),
          snap("dan", 0, 30),
          snap("eve", 0, 20),
          snap("cat", 0, 10),
          snap("bot", 0, 99),
        ],
        snapshot: [
          snap("ben", 0, 50),
          snap("ana", 6, 46),
          snap("dan", 0, 30),
          snap("eve", 0, 20),
          snap("cat", 50, 60),
          snap("bot", 99, 198),
        ],
      }),
    );

    expect(wrap.fired.map((a) => a.kind).join(",")).toBe(
      "tipper,topOfTheHill,onFire,rocket,furthestOff",
    );
    expect(wrap.shown.map((a) => a.kind).join(",")).toBe(
      "tipper,topOfTheHill,onFire,furthestOff",
    );
    expect(wrap.shown.length).toBe(4);
    // The bot's 99-point week and 198 total win nothing.
    const everyone = wrap.fired.flatMap((a) =>
      a.winners.map((w) => w.playerId),
    );
    expect(everyone.includes("bot")).toBe(false);
  });
});
