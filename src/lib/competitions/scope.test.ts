import { describe, expect, it } from "vitest";
import {
  foldCompetitionPicks,
  foldCompetitionScores,
  isMatchLocked,
} from "./scope";

// Golden values hand-derived from CLAUDE.md:
// - Picks lock 5 minutes before kickoff ("Predictions").
// - Scoring is additive per match, upserted per (player_id, match_id)
//   ("Scoring — additive").
// - Late Joiners score 0 for gameweeks before they joined, with "no
//   special-case logic needed beyond 'no picks exist for those matches'"
//   ("Identity and auth" -> Late joiners).

describe("foldCompetitionScores", () => {
  const players = [
    {
      id: "p1",
      displayName: "Alice",
      emoji: "🦊",
      isBot: false,
      joinedAt: "2026-08-01T00:00:00Z",
    },
    {
      id: "p2",
      displayName: "Bot Bob",
      emoji: null,
      isBot: true,
      joinedAt: "2026-08-01T00:00:00Z",
    },
    {
      id: "p3",
      displayName: "Late Larry",
      emoji: null,
      isBot: false,
      joinedAt: "2026-10-01T00:00:00Z",
    },
  ];

  it("sums a player's points across multiple scored matches", () => {
    const rows = foldCompetitionScores(players, [
      { playerId: "p1", points: 9 },
      { playerId: "p1", points: 3 },
    ]);
    const alice = rows.find((r) => r.playerId === "p1")!;
    expect(alice.points).toBe(12);
    expect(alice.matchesScored).toBe(2);
  });

  it("includes a bot's points using the same fold as a human player", () => {
    const rows = foldCompetitionScores(players, [
      { playerId: "p2", points: 5 },
    ]);
    const bob = rows.find((r) => r.playerId === "p2")!;
    expect(bob.points).toBe(5);
    expect(bob.matchesScored).toBe(1);
  });

  it("gives a player with no score rows 0 points rather than omitting them (Late Joiner)", () => {
    const rows = foldCompetitionScores(players, [
      { playerId: "p1", points: 9 },
    ]);
    const larry = rows.find((r) => r.playerId === "p3")!;
    expect(larry.points).toBe(0);
    expect(larry.matchesScored).toBe(0);
    expect(rows.length).toBe(3);
  });

  it("counts a voided match's score row (writer zeroes it, but it's still a real scored match)", () => {
    const rows = foldCompetitionScores(players, [
      { playerId: "p1", points: 9 },
      { playerId: "p1", points: 0 }, // voided match, recompute already zeroed it
    ]);
    const alice = rows.find((r) => r.playerId === "p1")!;
    expect(alice.points).toBe(9);
    expect(alice.matchesScored).toBe(2);
  });
});

describe("foldCompetitionPicks", () => {
  const players = [
    { id: "p1", displayName: "Alice", emoji: "🦊", isBot: false },
    { id: "p2", displayName: "Bot Bob", emoji: null, isBot: true },
    { id: "p3", displayName: "Nopick Nora", emoji: null, isBot: false },
  ];

  it("attaches a player's submitted pick", () => {
    const rows = foldCompetitionPicks(players, [
      { playerId: "p1", predHomeScore: 2, predAwayScore: 1 },
    ]);
    const alice = rows.find((r) => r.playerId === "p1")!;
    expect(alice.predHomeScore).toBe(2);
    expect(alice.predAwayScore).toBe(1);
  });

  it("includes a bot's pick alongside human players, no special-casing", () => {
    const rows = foldCompetitionPicks(players, [
      { playerId: "p2", predHomeScore: 1, predAwayScore: 1 },
    ]);
    const bob = rows.find((r) => r.playerId === "p2")!;
    expect(bob.predHomeScore).toBe(1);
    expect(bob.predAwayScore).toBe(1);
  });

  it("keeps a non-picker in the roster with null pick fields instead of dropping them", () => {
    const rows = foldCompetitionPicks(players, [
      { playerId: "p1", predHomeScore: 2, predAwayScore: 1 },
    ]);
    const nora = rows.find((r) => r.playerId === "p3")!;
    expect(nora.predHomeScore).toBe(null);
    expect(nora.predAwayScore).toBe(null);
    expect(rows.length).toBe(3);
  });
});

describe("isMatchLocked", () => {
  const kickoff = new Date("2026-08-15T15:00:00Z");

  it("is not locked more than 5 minutes before kickoff", () => {
    expect(isMatchLocked(kickoff, new Date("2026-08-15T14:54:00Z"))).toBe(
      false,
    );
  });

  it("is locked exactly 5 minutes before kickoff", () => {
    expect(isMatchLocked(kickoff, new Date("2026-08-15T14:55:00Z"))).toBe(true);
  });

  it("stays locked after kickoff", () => {
    expect(isMatchLocked(kickoff, new Date("2026-08-15T15:30:00Z"))).toBe(true);
  });
});
