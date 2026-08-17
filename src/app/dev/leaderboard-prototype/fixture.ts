// PROTOTYPE FIXTURE -- throwaway (issue #24 / docs/adr/0012-leaderboard-view.md).
//
// Hand-built rather than read from Supabase: #166 hasn't wired match-result
// sync to the scoring engine, so `scores` and `standings_snapshots` are
// empty everywhere. An empty route hides exactly the design problems this
// prototype exists to expose, so the roster below is sized and shaped like
// a real mid-season competition -- 16 players, gameweek 8, a rank tie, a
// late joiner with a flattering per-week average, three bots spread across
// the table, and a leader who was 2nd last week.

export interface ProtoRow {
  playerId: string;
  displayName: string;
  emoji: string;
  points: number;
  /** Dense rank over HUMANS ONLY (ties share a place, no skipped numbers).
   * null for a Bot: Bots are ranked past, not ranked -- see ADR 0012 D12. */
  rank: number | null;
  /** Same basis, one gameweek ago; null = a Bot, or a player who joined since. */
  previousRank: number | null;
  /** Scored gameweeks whose first tipped kickoff is at/after joined_at (D3). */
  gameweeksPlayed: number;
  /** Scored matches this player actually has a score row for. */
  matchesScored: number;
  /** count(points === 7) -- 7 is reachable only by an exact scoreline. */
  exactTips: number;
  /** count(points >= 3) -- every term but Wrong Way Round needs the result right. */
  correctResults: number;
  isBot: boolean;
  /** Cannot win the season title. Bots only -- a Late Joiner CAN win it
   * (CLAUDE.md, reversed 2026-08-16); "late" survives for the Predict the
   * Table leaderboard, where they remain ineligible. */
  ineligible: null | "bot" | "late";
  isYou: boolean;
}

export const GAMEWEEK = 8;

export const ROWS: ProtoRow[] = [
  {
    playerId: "p1",
    displayName: "Sophie",
    emoji: "🦊",
    points: 62,
    rank: 1,
    previousRank: 2,
    gameweeksPlayed: 8,
    matchesScored: 16,
    exactTips: 4,
    correctResults: 12,
    isBot: false,
    ineligible: null,
    isYou: false,
  },
  {
    playerId: "b1",
    displayName: "Median Bot",
    emoji: "🤖",
    points: 58,
    rank: null,
    previousRank: null,
    gameweeksPlayed: 8,
    matchesScored: 16,
    exactTips: 2,
    correctResults: 13,
    isBot: true,
    ineligible: "bot",
    isYou: false,
  },
  {
    playerId: "p2",
    displayName: "Andy",
    emoji: "⚡",
    points: 57,
    rank: 2,
    previousRank: 2,
    gameweeksPlayed: 8,
    matchesScored: 16,
    exactTips: 4,
    correctResults: 11,
    isBot: false,
    ineligible: null,
    isYou: true,
  },
  {
    playerId: "p3",
    displayName: "Marcus",
    emoji: "🐉",
    points: 57,
    rank: 2,
    previousRank: 4,
    gameweeksPlayed: 8,
    matchesScored: 16,
    exactTips: 3,
    correctResults: 12,
    isBot: false,
    ineligible: null,
    isYou: false,
  },
  {
    playerId: "p4",
    displayName: "Priya",
    emoji: "🌟",
    points: 51,
    rank: 3,
    previousRank: 5,
    gameweeksPlayed: 8,
    matchesScored: 16,
    exactTips: 3,
    correctResults: 10,
    isBot: false,
    ineligible: null,
    isYou: false,
  },
  {
    playerId: "p5",
    displayName: "Tom",
    emoji: "🦈",
    points: 49,
    rank: 4,
    previousRank: 3,
    gameweeksPlayed: 8,
    matchesScored: 16,
    exactTips: 2,
    correctResults: 11,
    isBot: false,
    ineligible: null,
    isYou: false,
  },
  {
    playerId: "p6",
    displayName: "Ella",
    emoji: "🐧",
    points: 45,
    rank: 5,
    previousRank: 6,
    gameweeksPlayed: 8,
    matchesScored: 16,
    exactTips: 2,
    correctResults: 10,
    isBot: false,
    ineligible: null,
    isYou: false,
  },
  {
    playerId: "p7",
    displayName: "Jack",
    emoji: "🚀",
    points: 44,
    rank: 6,
    previousRank: 8,
    gameweeksPlayed: 8,
    matchesScored: 16,
    exactTips: 3,
    correctResults: 8,
    isBot: false,
    ineligible: null,
    isYou: false,
  },
  {
    playerId: "p8",
    displayName: "Ruby",
    emoji: "🦄",
    points: 41,
    rank: 7,
    previousRank: 7,
    gameweeksPlayed: 8,
    matchesScored: 16,
    exactTips: 1,
    correctResults: 10,
    isBot: false,
    ineligible: null,
    isYou: false,
  },
  {
    playerId: "b2",
    displayName: "1-1 Bot",
    emoji: "🤖",
    points: 38,
    rank: null,
    previousRank: null,
    gameweeksPlayed: 8,
    matchesScored: 16,
    exactTips: 2,
    correctResults: 9,
    isBot: true,
    ineligible: "bot",
    isYou: false,
  },
  {
    playerId: "p9",
    displayName: "Noah",
    emoji: "🐢",
    points: 35,
    rank: 8,
    previousRank: 10,
    gameweeksPlayed: 8,
    matchesScored: 16,
    exactTips: 1,
    correctResults: 8,
    isBot: false,
    ineligible: null,
    isYou: false,
  },
  {
    playerId: "p10",
    displayName: "Mia",
    emoji: "🍕",
    points: 33,
    rank: 9,
    previousRank: 9,
    gameweeksPlayed: 8,
    matchesScored: 16,
    exactTips: 1,
    correctResults: 8,
    isBot: false,
    ineligible: null,
    isYou: false,
  },
  {
    playerId: "p11",
    displayName: "Liam",
    emoji: "🎸",
    points: 28,
    rank: 10,
    previousRank: 11,
    gameweeksPlayed: 8,
    matchesScored: 16,
    exactTips: 0,
    correctResults: 7,
    isBot: false,
    ineligible: null,
    isYou: false,
  },
  // Late Joiner: 3 gameweeks, 24 points -> 8.0/wk, the best per-week number
  // on the board. Deliberate -- this is the case that decides whether the
  // per-week column reads as useful context or as a misleading second rank.
  {
    playerId: "p12",
    displayName: "Ava",
    emoji: "🌈",
    points: 24,
    rank: 11,
    previousRank: null,
    gameweeksPlayed: 3,
    matchesScored: 6,
    exactTips: 2,
    correctResults: 5,
    isBot: false,
    ineligible: null,
    isYou: false,
  },
  {
    playerId: "b3",
    displayName: "Random Bot",
    emoji: "🤖",
    points: 19,
    rank: null,
    previousRank: null,
    gameweeksPlayed: 8,
    matchesScored: 16,
    exactTips: 0,
    correctResults: 5,
    isBot: true,
    ineligible: "bot",
    isYou: false,
  },
  {
    playerId: "p13",
    displayName: "Ben",
    emoji: "🦖",
    points: 12,
    rank: 12,
    previousRank: 12,
    gameweeksPlayed: 8,
    matchesScored: 16,
    exactTips: 0,
    correctResults: 3,
    isBot: false,
    ineligible: null,
    isYou: false,
  },
];

/** Day-one variant (D8): roster only, alphabetical, no ranks or points. */
export const DAY_ONE_ROWS = [...ROWS]
  .map((row) => ({
    ...row,
    points: 0,
    gameweeksPlayed: 0,
    matchesScored: 0,
    exactTips: 0,
    correctResults: 0,
    previousRank: null,
  }))
  .sort((a, b) => a.displayName.localeCompare(b.displayName));

export function movement(row: ProtoRow): number | null {
  if (row.rank === null || row.previousRank === null) return null;
  return row.previousRank - row.rank; // positive = climbed
}

export function perWeek(row: ProtoRow): string | null {
  if (row.gameweeksPlayed === 0) return null;
  return (row.points / row.gameweeksPlayed).toFixed(1);
}

export const INELIGIBLE_LABEL: Record<"bot" | "late", string> = {
  bot: "Bot",
  late: "Joined late",
};

// --- Predict the Table board -------------------------------------------
//
// Second segment (ADR 0012 D1). Deliberately shaped to expose the two ways
// this board is NOT the season board:
//
//  1. No Bots. Bots predict scorelines (Random / 1-1 / Median); nothing in
//     the spec gives them a Table Prediction, so they simply aren't here.
//     The rank column's "can't win" slot is used by a Late Joiner instead.
//  2. No movement arrows. Movement on the season board comes from
//     standings_snapshots; NOTHING stores Table Prediction score history,
//     so there is no previous value to diff against. See ADR 0012 D13.
//
// Ava is placed FIRST on purpose: a Late Joiner is ineligible for this
// title (unlike the season one), so this is the case that forces the board
// to answer "what happens when the leader can't win?"

export interface TableRow {
  playerId: string;
  displayName: string;
  emoji: string;
  /** Table Prediction Score, max 200 (CLAUDE.md -> Predict the Table). */
  score: number;
  /** Placement component, max 100. */
  placement: number;
  /** Band Bonus component, max 85. */
  bandBonus: number;
  /** Bold Call component, max 15. A Late Joiner always scores 0 here --
   * they sit outside the Bold Call process in both directions. */
  boldCall: number;
  /** Dense rank over ELIGIBLE players only; null = ineligible to win. */
  rank: number | null;
  lateJoiner: boolean;
  isYou: boolean;
}

export const TABLE_MAX = 200;

export const TABLE_ROWS: TableRow[] = [
  {
    playerId: "p12",
    displayName: "Ava",
    emoji: "🌈",
    score: 152,
    placement: 77,
    bandBonus: 75,
    boldCall: 0,
    rank: null,
    lateJoiner: true,
    isYou: false,
  },
  {
    playerId: "p3",
    displayName: "Marcus",
    emoji: "🐉",
    score: 148,
    placement: 76,
    bandBonus: 60,
    boldCall: 12,
    rank: 1,
    lateJoiner: false,
    isYou: false,
  },
  {
    playerId: "p1",
    displayName: "Sophie",
    emoji: "🦊",
    score: 141,
    placement: 71,
    bandBonus: 60,
    boldCall: 10,
    rank: 2,
    lateJoiner: false,
    isYou: false,
  },
  {
    playerId: "p8",
    displayName: "Ruby",
    emoji: "🦄",
    score: 133,
    placement: 68,
    bandBonus: 55,
    boldCall: 10,
    rank: 3,
    lateJoiner: false,
    isYou: false,
  },
  {
    playerId: "p5",
    displayName: "Tom",
    emoji: "🦈",
    score: 129,
    placement: 69,
    bandBonus: 50,
    boldCall: 10,
    rank: 4,
    lateJoiner: false,
    isYou: false,
  },
  {
    playerId: "p4",
    displayName: "Priya",
    emoji: "🌟",
    score: 126,
    placement: 66,
    bandBonus: 50,
    boldCall: 10,
    rank: 5,
    lateJoiner: false,
    isYou: false,
  },
  {
    playerId: "p2",
    displayName: "Andy",
    emoji: "⚡",
    score: 121,
    placement: 63,
    bandBonus: 50,
    boldCall: 8,
    rank: 6,
    lateJoiner: false,
    isYou: true,
  },
  {
    playerId: "p6",
    displayName: "Ella",
    emoji: "🐧",
    score: 118,
    placement: 63,
    bandBonus: 45,
    boldCall: 10,
    rank: 7,
    lateJoiner: false,
    isYou: false,
  },
  {
    playerId: "p7",
    displayName: "Jack",
    emoji: "🚀",
    score: 112,
    placement: 57,
    bandBonus: 45,
    boldCall: 10,
    rank: 8,
    lateJoiner: false,
    isYou: false,
  },
  {
    playerId: "p9",
    displayName: "Noah",
    emoji: "🐢",
    score: 104,
    placement: 54,
    bandBonus: 40,
    boldCall: 10,
    rank: 9,
    lateJoiner: false,
    isYou: false,
  },
  {
    playerId: "p10",
    displayName: "Mia",
    emoji: "🍕",
    score: 97,
    placement: 52,
    bandBonus: 35,
    boldCall: 10,
    rank: 10,
    lateJoiner: false,
    isYou: false,
  },
  {
    playerId: "p11",
    displayName: "Liam",
    emoji: "🎸",
    score: 88,
    placement: 48,
    bandBonus: 35,
    boldCall: 5,
    rank: 11,
    lateJoiner: false,
    isYou: false,
  },
  {
    playerId: "p13",
    displayName: "Ben",
    emoji: "🦖",
    score: 74,
    placement: 39,
    bandBonus: 30,
    boldCall: 5,
    rank: 12,
    lateJoiner: false,
    isYou: false,
  },
];

export const DAY_ONE_TABLE_ROWS: TableRow[] = [...TABLE_ROWS]
  .map((row) => ({
    ...row,
    score: 0,
    placement: 0,
    bandBonus: 0,
    boldCall: 0,
    rank: null,
  }))
  .sort((a, b) => a.displayName.localeCompare(b.displayName));
