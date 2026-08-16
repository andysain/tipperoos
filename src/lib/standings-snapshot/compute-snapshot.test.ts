import { describe, expect, it } from "vitest";
import { recomputeMatchScores } from "@/lib/scoring/match";
import {
  computeGameweekStandings,
  type StandingsScoreRow,
} from "./compute-snapshot";

// Golden values hand-derived per issue #23's decision log:
// - gameweek_score sums a player's `scores` rows for exactly this gameweek's
//   matches; season_total sums every gameweek 1..N's matches (D1/D2).
// - season_standing is dense rank on season_total descending, rank 1 = best
//   (D3, CONTEXT.md's "Season Standing" entry).
// - A Late Joiner (no score rows at all) still appears at 0, ranked (D3,
//   CLAUDE.md "Late joiners": no special-case beyond "no picks exist").
// - A Bot is folded in exactly like any other player (D3, CONTEXT.md "Player").

const players = [
  { playerId: "alice" },
  { playerId: "bot-bob" },
  { playerId: "late-larry" },
];

describe("computeGameweekStandings", () => {
  it("sums each player's gameweek_score from just this gameweek's rows", () => {
    const gameweekRows: StandingsScoreRow[] = [
      { playerId: "alice", points: 7 },
      { playerId: "alice", points: 3 },
      { playerId: "bot-bob", points: 4 },
    ];
    const seasonRows: StandingsScoreRow[] = gameweekRows;

    const result = computeGameweekStandings({
      players: players,
      gameweekScoreRows: gameweekRows,
      seasonScoreRows: seasonRows,
    });

    expect(result.find((r) => r.playerId === "alice")?.gameweekScore).toBe(10);
    expect(result.find((r) => r.playerId === "bot-bob")?.gameweekScore).toBe(4);
  });

  it("sums season_total across every gameweek's rows, not just the current one", () => {
    const gameweekRows: StandingsScoreRow[] = [
      { playerId: "alice", points: 3 },
    ];
    const seasonRows: StandingsScoreRow[] = [
      { playerId: "alice", points: 7 }, // gameweek 1
      { playerId: "alice", points: 3 }, // gameweek 2 (this gameweek)
    ];

    const result = computeGameweekStandings({
      players: players,
      gameweekScoreRows: gameweekRows,
      seasonScoreRows: seasonRows,
    });

    const alice = result.find((r) => r.playerId === "alice")!;
    expect(alice.gameweekScore).toBe(3);
    expect(alice.seasonTotal).toBe(10);
  });

  it("gives a Late Joiner with no score rows 0 rather than omitting them", () => {
    const gameweekRows: StandingsScoreRow[] = [
      { playerId: "alice", points: 7 },
    ];
    const seasonRows: StandingsScoreRow[] = gameweekRows;

    const result = computeGameweekStandings({
      players: players,
      gameweekScoreRows: gameweekRows,
      seasonScoreRows: seasonRows,
    });

    const larry = result.find((r) => r.playerId === "late-larry")!;
    expect(larry.gameweekScore).toBe(0);
    expect(larry.seasonTotal).toBe(0);
    expect(result.length).toBe(3);
  });

  it("includes a Bot in the ranking exactly like a human player", () => {
    const gameweekRows: StandingsScoreRow[] = [
      { playerId: "bot-bob", points: 12 },
    ];
    const seasonRows: StandingsScoreRow[] = gameweekRows;

    const result = computeGameweekStandings({
      players: players,
      gameweekScoreRows: gameweekRows,
      seasonScoreRows: seasonRows,
    });

    const bob = result.find((r) => r.playerId === "bot-bob")!;
    expect(bob.seasonTotal).toBe(12);
    expect(bob.seasonStanding).toBe(1);
  });

  it("ranks season_standing dense, rank 1 = best, ties sharing a place", () => {
    const seasonRows: StandingsScoreRow[] = [
      { playerId: "alice", points: 20 },
      { playerId: "bot-bob", points: 20 },
    ];

    const result = computeGameweekStandings({
      players: players,
      gameweekScoreRows: [],
      seasonScoreRows: seasonRows,
    });

    expect(result.find((r) => r.playerId === "alice")?.seasonStanding).toBe(1);
    expect(result.find((r) => r.playerId === "bot-bob")?.seasonStanding).toBe(
      1,
    );
    // Late Larry is on 0, strictly behind the tied leaders -- dense rank 2, not 3.
    expect(
      result.find((r) => r.playerId === "late-larry")?.seasonStanding,
    ).toBe(2);
  });

  it("recomputes from the current row set only -- a corrected result replaces, never accumulates", () => {
    const originalSeasonRows: StandingsScoreRow[] = [
      { playerId: "alice", points: 7 },
    ];
    const original = computeGameweekStandings({
      players: players,
      gameweekScoreRows: [],
      seasonScoreRows: originalSeasonRows,
    });
    expect(original.find((r) => r.playerId === "alice")?.seasonTotal).toBe(7);

    // The scoring engine recomputes-from-current (issue #21) -- a corrected
    // result produces a *replacement* row, e.g. 7 -> 4, never a second row
    // that would sum to 11.
    const correctedSeasonRows: StandingsScoreRow[] = [
      { playerId: "alice", points: 4 },
    ];
    const corrected = computeGameweekStandings({
      players: players,
      gameweekScoreRows: [],
      seasonScoreRows: correctedSeasonRows,
    });
    expect(corrected.find((r) => r.playerId === "alice")?.seasonTotal).toBe(4);
  });
});

// Issue #23 D5: "constructs a synthetic gameweek-1 result set (players,
// picks, match results, resulting `scores` rows)" -- this builds the whole
// pipeline (picks + match results -> issue #21's recomputeMatchScores ->
// scores rows -> computeGameweekStandings), not just hand-picked point
// totals, so the snapshot is proven against a realistic gameweek-1 shape.
describe("computeGameweekStandings -- full pipeline from picks and match results", () => {
  it("derives the snapshot from real scoreMatch output for a simulated gameweek 1", () => {
    // Match 1 finishes 2-1. Alice predicts the exact scoreline (max 7:
    // result 3 + goal difference 2 + home 1 + away 1). Bot Bob predicts a
    // 1-1 draw -- wrong result, so 0 (CLAUDE.md: team-score points require
    // a correct result). Late Larry never picks match 1.
    const match1Scores = recomputeMatchScores({
      matchId: "match-1",
      result: { home: 2, away: 1 },
      voided: false,
      picks: [
        { playerId: "alice", pickHome: 2, pickAway: 1 },
        { playerId: "bot-bob", pickHome: 1, pickAway: 1 },
      ],
    });

    // Match 2 finishes 0-0. Alice predicts a 1-0 home win -- wrong result,
    // 0. Bot Bob predicts the exact 0-0 draw -- max 7. Late Larry never
    // picks match 2 either (Late Joiner: no picks, no points).
    const match2Scores = recomputeMatchScores({
      matchId: "match-2",
      result: { home: 0, away: 0 },
      voided: false,
      picks: [
        { playerId: "alice", pickHome: 1, pickAway: 0 },
        { playerId: "bot-bob", pickHome: 0, pickAway: 0 },
      ],
    });

    const gameweek1ScoreRows: StandingsScoreRow[] = [
      ...match1Scores,
      ...match2Scores,
    ];

    const players = [
      { playerId: "alice" },
      { playerId: "bot-bob" },
      { playerId: "late-larry" },
    ];

    // Gameweek 1 is also the whole season so far, so gameweek and season
    // rows are the same set.
    const result = computeGameweekStandings({
      players: players,
      gameweekScoreRows: gameweek1ScoreRows,
      seasonScoreRows: gameweek1ScoreRows,
    });

    const alice = result.find((r) => r.playerId === "alice")!;
    expect(alice.gameweekScore).toBe(7);
    expect(alice.seasonTotal).toBe(7);

    const bob = result.find((r) => r.playerId === "bot-bob")!;
    expect(bob.gameweekScore).toBe(7);
    expect(bob.seasonTotal).toBe(7);

    // Alice and Bot Bob are tied on 7 -- dense rank 1 for both.
    expect(alice.seasonStanding).toBe(1);
    expect(bob.seasonStanding).toBe(1);

    // Late Larry never picked either match: no `scores` rows, 0 points,
    // still ranked (dense rank 2, strictly behind the tied leaders).
    const larry = result.find((r) => r.playerId === "late-larry")!;
    expect(larry.gameweekScore).toBe(0);
    expect(larry.seasonTotal).toBe(0);
    expect(larry.seasonStanding).toBe(2);
  });
});
