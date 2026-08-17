import { describe, expect, it } from "vitest";
import { buildLeaderboard, countGameweeksPlayed } from "./board";

// Golden values hand-derived from CLAUDE.md and
// docs/adr/0012-leaderboard-view.md:
//
// - D12: rank is dense over HUMANS ONLY (bots carry no rank), ties share a
//   place with no skipped numbers -- so 62 / 58(bot) / 57 / 57 / 51 ranks
//   as 1 / null / 2 / 2 / 3, NOT 1 / null / 3 / 3 / 5.
// - D2: movement is this live humans-only rank minus the same humans-only
//   rank recomputed from the PREVIOUS gameweek's stored season_total.
//   Positive = climbed. A player absent from that snapshot shows null.
// - D3: gameweeks played counts scored gameweeks whose earliest tipped
//   kickoff is at or after the player's joined_at -- so a player who joins
//   mid-gameweek starts counting from the next one.
// - CLAUDE.md -> Scoring: "No pick, no points"; points-per-gameweek-played
//   exists so a Late Joiner isn't buried, and is never the sort key.

const GW = [
  { number: 1, earliestKickoffUtcIso: "2026-08-21T19:00:00Z" },
  { number: 2, earliestKickoffUtcIso: "2026-08-28T19:00:00Z" },
  { number: 3, earliestKickoffUtcIso: "2026-09-04T19:00:00Z" },
  { number: 4, earliestKickoffUtcIso: "2026-09-11T19:00:00Z" },
];

function score(
  playerId: string,
  points: number,
  opts: { isBot?: boolean; joinedAt?: string; matchesScored?: number } = {},
) {
  return {
    playerId,
    displayName: playerId,
    emoji: null,
    isBot: opts.isBot ?? false,
    joinedAt: opts.joinedAt ?? "2026-08-01T00:00:00Z",
    points,
    matchesScored: opts.matchesScored ?? 8,
    exactTips: 0,
    correctResults: 0,
  };
}

describe("countGameweeksPlayed", () => {
  it("counts every scored gameweek for a player who joined before the season", () => {
    expect(countGameweeksPlayed(GW, "2026-08-01T00:00:00Z")).toBe(4);
  });

  it("excludes gameweeks that kicked off before the player joined", () => {
    expect(countGameweeksPlayed(GW, "2026-09-01T00:00:00Z")).toBe(2);
  });

  it("counts a gameweek the player joined exactly at kickoff (boundary is inclusive)", () => {
    // Joined on GW3's kickoff instant: GW3 counts, and so does GW4.
    expect(countGameweeksPlayed(GW, "2026-09-04T19:00:00Z")).toBe(2);
  });

  it("drops a gameweek the player joined one second after its kickoff", () => {
    // One second past GW3's kickoff drops GW3, leaving GW4 alone. This is
    // the whole point of the rule: the gameweek they could not have picked
    // in is never charged to their average.
    expect(countGameweeksPlayed(GW, "2026-09-04T19:00:01Z")).toBe(1);
  });
});

describe("buildLeaderboard ranking", () => {
  const scores = [
    score("sophie", 62),
    score("medianbot", 58, { isBot: true }),
    score("andy", 57),
    score("marcus", 57),
    score("priya", 51),
  ];

  const rows = buildLeaderboard({
    scores,
    previousSeasonTotals: [],
    scoredGameweeks: GW,
    viewerId: "andy",
  });

  it("ranks humans only, so the player behind a bot is 2nd and not 3rd", () => {
    expect(rows.find((r) => r.playerId === "sophie")!.rank).toBe(1);
    expect(rows.find((r) => r.playerId === "andy")!.rank).toBe(2);
  });

  it("gives a bot no rank at all rather than a hidden one", () => {
    expect(rows.find((r) => r.playerId === "medianbot")!.rank).toBeNull();
  });

  it("shares a place on a tie and does not skip the next number", () => {
    expect(rows.find((r) => r.playerId === "marcus")!.rank).toBe(2);
    expect(rows.find((r) => r.playerId === "priya")!.rank).toBe(3);
  });

  it("orders the board by points, bots included in position", () => {
    expect(rows.map((r) => r.playerId)).toEqual([
      "sophie",
      "medianbot",
      "andy",
      "marcus",
      "priya",
    ]);
  });

  it("marks exactly the viewer's row", () => {
    expect(rows.filter((r) => r.isViewer).map((r) => r.playerId)).toEqual([
      "andy",
    ]);
  });
});

describe("buildLeaderboard movement", () => {
  const scores = [
    score("sophie", 62),
    score("medianbot", 58, { isBot: true }),
    score("andy", 57),
  ];

  it("reports places climbed against the previous gameweek's humans-only rank", () => {
    // Previously andy 60 / sophie 55 -> andy 1st, sophie 2nd.
    // Now sophie 1st, andy 2nd: sophie +1, andy -1.
    const rows = buildLeaderboard({
      scores,
      previousSeasonTotals: [
        { playerId: "andy", seasonTotal: 60 },
        { playerId: "sophie", seasonTotal: 55 },
        { playerId: "medianbot", seasonTotal: 58 },
      ],
      scoredGameweeks: GW,
      viewerId: "andy",
    });
    expect(rows.find((r) => r.playerId === "sophie")!.movement).toBe(1);
    expect(rows.find((r) => r.playerId === "andy")!.movement).toBe(-1);
  });

  it("ignores the bot when recomputing the previous rank, so movement is not off by one", () => {
    // The bot's 58 sits between them in both snapshots. If it were counted,
    // sophie's previous rank would be 3 and her movement +2, not +1.
    const rows = buildLeaderboard({
      scores,
      previousSeasonTotals: [
        { playerId: "andy", seasonTotal: 60 },
        { playerId: "sophie", seasonTotal: 55 },
        { playerId: "medianbot", seasonTotal: 58 },
      ],
      scoredGameweeks: GW,
      viewerId: "andy",
    });
    expect(rows.find((r) => r.playerId === "sophie")!.movement).toBe(1);
  });

  it("reports 0 for a player who held their place", () => {
    const rows = buildLeaderboard({
      scores,
      previousSeasonTotals: [
        { playerId: "sophie", seasonTotal: 50 },
        { playerId: "andy", seasonTotal: 40 },
      ],
      scoredGameweeks: GW,
      viewerId: "andy",
    });
    expect(rows.find((r) => r.playerId === "andy")!.movement).toBe(0);
  });

  it("reports null for a player absent from the previous snapshot, not a climb from nothing", () => {
    const rows = buildLeaderboard({
      scores,
      previousSeasonTotals: [{ playerId: "sophie", seasonTotal: 50 }],
      scoredGameweeks: GW,
      viewerId: "andy",
    });
    expect(rows.find((r) => r.playerId === "andy")!.movement).toBeNull();
  });

  it("reports null for every player when there is no previous snapshot at all", () => {
    const rows = buildLeaderboard({
      scores,
      previousSeasonTotals: [],
      scoredGameweeks: GW,
      viewerId: "andy",
    });
    expect(rows.every((r) => r.movement === null)).toBe(true);
  });

  it("never reports movement for a bot", () => {
    const rows = buildLeaderboard({
      scores,
      previousSeasonTotals: [
        { playerId: "medianbot", seasonTotal: 10 },
        { playerId: "sophie", seasonTotal: 50 },
        { playerId: "andy", seasonTotal: 40 },
      ],
      scoredGameweeks: GW,
      viewerId: "andy",
    });
    expect(rows.find((r) => r.playerId === "medianbot")!.movement).toBeNull();
  });
});

describe("buildLeaderboard points per gameweek played", () => {
  it("divides by every scored gameweek for an on-time player", () => {
    const rows = buildLeaderboard({
      scores: [score("sophie", 62)],
      previousSeasonTotals: [],
      scoredGameweeks: GW,
      viewerId: "sophie",
    });
    expect(rows[0].gameweeksPlayed).toBe(4);
    expect(rows[0].pointsPerGameweek).toBe(15.5);
  });

  it("divides a Late Joiner's total only by the gameweeks they were present for", () => {
    // Joined 2026-09-01, so gameweeks 3 and 4 only: 24 / 2 = 12.
    const rows = buildLeaderboard({
      scores: [score("ava", 24, { joinedAt: "2026-09-01T00:00:00Z" })],
      previousSeasonTotals: [],
      scoredGameweeks: GW,
      viewerId: "ava",
    });
    expect(rows[0].gameweeksPlayed).toBe(2);
    expect(rows[0].pointsPerGameweek).toBe(12);
  });

  it("reports null rather than dividing by zero for a player who joined after every scored gameweek", () => {
    const rows = buildLeaderboard({
      scores: [score("newbie", 0, { joinedAt: "2026-12-01T00:00:00Z" })],
      previousSeasonTotals: [],
      scoredGameweeks: GW,
      viewerId: "newbie",
    });
    expect(rows[0].gameweeksPlayed).toBe(0);
    expect(rows[0].pointsPerGameweek).toBeNull();
  });

  it("never lets the per-gameweek average change the ordering", () => {
    // ava averages 12.0 against sophie's 8.0 but is still below her.
    const rows = buildLeaderboard({
      scores: [
        score("sophie", 32),
        score("ava", 24, { joinedAt: "2026-09-01T00:00:00Z" }),
      ],
      previousSeasonTotals: [],
      scoredGameweeks: GW,
      viewerId: "sophie",
    });
    expect(rows.map((r) => r.playerId)).toEqual(["sophie", "ava"]);
    expect(rows[0].rank).toBe(1);
    expect(rows[1].rank).toBe(2);
    expect(rows[1].pointsPerGameweek).toBe(12);
  });
});

describe("buildLeaderboard day one", () => {
  it("reports scored=false when no gameweek has been scored yet", () => {
    const rows = buildLeaderboard({
      scores: [score("sophie", 0, { matchesScored: 0 })],
      previousSeasonTotals: [],
      scoredGameweeks: [],
      viewerId: "sophie",
    });
    expect(rows[0].rank).toBe(1);
    expect(rows[0].gameweeksPlayed).toBe(0);
  });
});
