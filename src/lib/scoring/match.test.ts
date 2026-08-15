import { describe, expect, it } from "vitest";
import { recomputeMatchScores, scoreMatch } from "./match";

describe("scoreMatch — golden values (derived from CLAUDE.md 'Scoring — additive')", () => {
  it("scores 7 for an exact home-win scoreline (result + GD + both team scores)", () => {
    const score = scoreMatch(2, 1, 2, 1);

    expect(score.points).toBe(7);
    expect(score.breakdown.result).toBe(3);
    expect(score.breakdown.goalDifference).toBe(2);
    expect(score.breakdown.homeScore).toBe(1);
    expect(score.breakdown.awayScore).toBe(1);
  });

  it("scores 7 for an exact draw", () => {
    expect(scoreMatch(1, 1, 1, 1).points).toBe(7);
  });

  it("scores 5 when result and goal difference are right but no team score", () => {
    const score = scoreMatch(2, 1, 3, 2);

    expect(score.points).toBe(5);
    expect(score.breakdown.result).toBe(3);
    expect(score.breakdown.goalDifference).toBe(2);
    expect(score.breakdown.homeScore).toBeNull();
    expect(score.breakdown.awayScore).toBeNull();
  });

  it("scores 4 when the result and one team score are right but the goal difference is not", () => {
    const score = scoreMatch(2, 1, 2, 0);

    expect(score.points).toBe(4);
    expect(score.breakdown.result).toBe(3);
    expect(score.breakdown.goalDifference).toBeNull();
    expect(score.breakdown.homeScore).toBe(1);
    expect(score.breakdown.awayScore).toBeNull();
  });

  it("scores 3 when only the result is right", () => {
    const score = scoreMatch(2, 0, 3, 2);

    expect(score.points).toBe(3);
    expect(score.breakdown.result).toBe(3);
    expect(score.breakdown.goalDifference).toBeNull();
    expect(score.breakdown.homeScore).toBeNull();
    expect(score.breakdown.awayScore).toBeNull();
  });

  it("scores 0 when nothing is right", () => {
    const score = scoreMatch(2, 1, 0, 0);

    expect(score.points).toBe(0);
    expect(score.breakdown.result).toBeNull();
    expect(score.breakdown.goalDifference).toBeNull();
  });

  it("scores 1 for Wrong Way Round and never the component terms with it", () => {
    const score = scoreMatch(2, 1, 1, 2);

    expect(score.points).toBe(1);
    expect(score.breakdown.wrongWayRound).toBe(true);
    expect(score.breakdown.result).toBeNull();
    expect(score.breakdown.goalDifference).toBeNull();
    expect(score.breakdown.homeScore).toBeNull();
    expect(score.breakdown.awayScore).toBeNull();
  });

  it("does not award a team score when the result is wrong even though that team's score is right", () => {
    const score = scoreMatch(1, 1, 1, 0);

    expect(score.points).toBe(0);
    expect(score.breakdown.homeScore).toBeNull();
  });

  it("treats a reversed draw as a normal exact scoreline, not Wrong Way Round", () => {
    const score = scoreMatch(2, 2, 2, 2);

    expect(score.points).toBe(7);
    expect(score.breakdown.wrongWayRound).toBe(false);
  });

  it("scores nothing and reports no pick when a pick is missing", () => {
    const noPick = scoreMatch(null, null, 2, 1);
    const halfPick = scoreMatch(2, null, 2, 1);

    expect(noPick.hasPick).toBe(false);
    expect(noPick.points).toBe(0);
    expect(halfPick.hasPick).toBe(false);
    expect(halfPick.points).toBe(0);
  });
});

describe("recomputeMatchScores — idempotent recompute from a match's current state", () => {
  const picks = [
    { playerId: "player-a", pickHome: 2, pickAway: 1 },
    { playerId: "player-b", pickHome: 0, pickAway: 2 },
  ];

  it("is deterministic: recomputing the same inputs twice yields an identical row set", () => {
    const input = {
      matchId: "match-1",
      result: { home: 3, away: 2 },
      voided: false,
      picks,
    };

    expect(recomputeMatchScores(input)).toEqual(recomputeMatchScores(input));
  });

  it("replaces prior rows rather than accumulating when the result changes", () => {
    const first = recomputeMatchScores({
      matchId: "match-1",
      result: { home: 3, away: 2 },
      voided: false,
      picks,
    });
    const second = recomputeMatchScores({
      matchId: "match-1",
      result: { home: 2, away: 1 },
      voided: false,
      picks,
    });
    const third = recomputeMatchScores({
      matchId: "match-1",
      result: { home: 2, away: 1 },
      voided: false,
      picks,
    });

    expect(first).toEqual([
      { playerId: "player-a", matchId: "match-1", points: 5 },
      { playerId: "player-b", matchId: "match-1", points: 0 },
    ]);
    expect(second).toEqual([
      { playerId: "player-a", matchId: "match-1", points: 7 },
      { playerId: "player-b", matchId: "match-1", points: 0 },
    ]);
    expect(third).toEqual(second);
  });

  it("zeros every picker's row when the match is voided, whatever the previous result", () => {
    const rows = recomputeMatchScores({
      matchId: "match-1",
      result: { home: 2, away: 1 },
      voided: true,
      picks,
    });

    expect(rows).toEqual([
      { playerId: "player-a", matchId: "match-1", points: 0 },
      { playerId: "player-b", matchId: "match-1", points: 0 },
    ]);
  });

  it("emits no rows for a match that has no result yet and is not voided", () => {
    const rows = recomputeMatchScores({
      matchId: "match-1",
      result: null,
      voided: false,
      picks,
    });

    expect(rows).toEqual([]);
  });

  it("scores each picker independently from their own pick", () => {
    const rows = recomputeMatchScores({
      matchId: "match-1",
      result: { home: 1, away: 2 },
      voided: false,
      picks: [
        { playerId: "player-a", pickHome: 2, pickAway: 1 },
        { playerId: "player-b", pickHome: 1, pickAway: 2 },
        { playerId: "player-c", pickHome: 0, pickAway: 0 },
      ],
    });

    expect(rows).toEqual([
      { playerId: "player-a", matchId: "match-1", points: 1 },
      { playerId: "player-b", matchId: "match-1", points: 7 },
      { playerId: "player-c", matchId: "match-1", points: 0 },
    ]);
  });
});
