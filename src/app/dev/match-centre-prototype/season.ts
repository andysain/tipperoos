// PROTOTYPE season data -- ONE generator, several readers.
//
// Rewritten after review. The previous version had three independent LCGs
// inventing three different seasons: the strip read `seasonFor`, the reveal
// read `matchesForGameweek`, the recap read a third path, and `BOARD` drew
// points from thin air. So gameweek 24 was worth 0 on the strip and +7 on
// the card below it, Grace had 62 points on her record and 118 on the
// leaderboard, and the record and the reveal showed different clubs for the
// same week. A design can't be judged against a fixture that contradicts
// itself.
//
// Now: `matchesForGameweek()` is the only generator. `seasonFor`, `STRIP`,
// `recapFor` and `BOARD` all derive from it, and every score comes from the
// real `scoreMatch()`.

import { scoreMatch } from "@/lib/scoring/match";
import { PLAYERS, SIGNED_IN, type ProtoMatch, type ProtoPick } from "./fixture";

export const CURRENT_GW = 24;
export const TOTAL_GW = 38;

/** Match states this fixture has to be able to express -- CONTEXT.md
 *  requires Voided (postponed AFTER lock, no points either way) and Skipped
 *  (postponed BEFORE lock, the week runs with one match) to be distinct. */
export const VOIDED_GW = 19;
export const SKIPPED_GW = 15;
/** A week the viewer skipped entirely -- "No pick, no points". */
export const BLANK_GW = 12;
/** Zoe joined here. Weeks before it are not hers to have missed. */
export const LATE_JOIN_GW = 13;
export const LATE_JOINER = "zoe";

function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

const CLUBS = [
  ["ARS", "CHE"],
  ["LIV", "MCI"],
  ["MUN", "TOT"],
  ["NEW", "AVL"],
  ["EVE", "BHA"],
  ["WOL", "FUL"],
  ["BOU", "CRY"],
  ["NFO", "BRE"],
  ["WHU", "LEE"],
  ["BUR", "SUN"],
] as const;

const CLUB_NAMES: Record<string, string> = {
  ARS: "Arsenal",
  CHE: "Chelsea",
  LIV: "Liverpool",
  MCI: "Man City",
  MUN: "Man Utd",
  TOT: "Spurs",
  NEW: "Newcastle",
  AVL: "Aston Villa",
  EVE: "Everton",
  BHA: "Brighton",
  WOL: "Wolves",
  FUL: "Fulham",
  BOU: "Bournemouth",
  CRY: "Crystal Palace",
  NFO: "Nott'm Forest",
  BRE: "Brentford",
  WHU: "West Ham",
  LEE: "Leeds",
  BUR: "Burnley",
  SUN: "Sunderland",
};

/** A gameweek is a weekend, not a random day. Season opens Sat 16 Aug and
 *  steps 7 days, so dates ascend with the number and a reader scrolling back
 *  to November finds November. The old generator drew a fresh day-of-month
 *  per week from an already-advanced stream, which is why GW24 read 25 Feb,
 *  GW23 read 3 Feb and GW22 read 25 Feb again. */
const SEASON_START = new Date("2025-08-16T00:00:00Z");

export function dateForGameweek(gw: number): Date {
  return new Date(SEASON_START.getTime() + (gw - 1) * 7 * 86400000);
}

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const MONTH_FMT = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  timeZone: "UTC",
});

export function labelForGameweek(gw: number): string {
  return DATE_FMT.format(dateForGameweek(gw));
}
export function monthForGameweek(gw: number): string {
  return MONTH_FMT.format(dateForGameweek(gw));
}

export type MatchKind = "played" | "voided";

// ---------------------------------------------------------------------------
// The one generator
// ---------------------------------------------------------------------------

/**
 * A gameweek's tipped matches, with every player's pick. Deterministic.
 * `locked` is carried explicitly rather than inferred from `result === null`
 * -- that conflation is what let an UNLOCKED pick render on another player's
 * record (ADR 0013 D10, the one failure the whole feature is written around).
 * A card that can't tell the two apart will happily leak.
 */
export function matchesForGameweek(gw: number): ProtoMatch[] {
  const rand = lcg(gw * 7919 + 13);
  const slots = gw === SKIPPED_GW ? 1 : 2;
  const used = new Set<number>();

  return Array.from({ length: slots }, (_, slot) => {
    let idx = Math.floor(rand() * CLUBS.length);
    while (used.has(idx)) idx = (idx + 1) % CLUBS.length;
    used.add(idx);
    const [homeCode, awayCode] = CLUBS[idx];

    const voided = gw === VOIDED_GW && slot === slots - 1;
    // Everything up to the current gameweek has locked. Within the current
    // week the second slot is locked but not yet played -- ADR 0013 D5's
    // "revealed, not started", the window where every pick is visible and
    // no result exists.
    const locked = gw <= CURRENT_GW;
    const played = locked && !voided && !(gw === CURRENT_GW && slot === 1);
    const result = played
      ? { home: Math.floor(rand() * 3.6), away: Math.floor(rand() * 3.2) }
      : null;

    // A player who hadn't joined yet is absent from the pick set entirely,
    // not present-with-no-pick -- otherwise the reveal says they "sat out"
    // a week they couldn't have played, permanently, on a deep-linked page.
    // Bots ALWAYS pick (CLAUDE.md: the Median Bot even falls back to 1-1),
    // so a bot can never appear in the no-pick list.
    const picks: ProtoPick[] = PLAYERS.filter(
      (p) => gw >= (p.id === LATE_JOINER ? LATE_JOIN_GW : 1),
    ).map((p) => {
      if (p.isBot) {
        return p.id === "bot-oneone"
          ? { playerId: p.id, home: 1, away: 1 }
          : {
              playerId: p.id,
              home: Math.floor(rand() * 3.3),
              away: Math.floor(rand() * 3),
            };
      }
      const absent = (p.id === SIGNED_IN && gw === BLANK_GW) || rand() < 0.1;
      if (absent) return { playerId: p.id, home: null, away: null };
      return {
        playerId: p.id,
        home: Math.floor(rand() * 3.3),
        away: Math.floor(rand() * 3),
      };
    });

    return {
      id: `gw${gw}-${slot}`,
      gameweek: gw,
      home: {
        name: CLUB_NAMES[homeCode],
        shortCode: homeCode,
        position: 1 + Math.floor(rand() * 20),
      },
      away: {
        name: CLUB_NAMES[awayCode],
        shortCode: awayCode,
        position: 1 + Math.floor(rand() * 20),
      },
      kickoffLabel: labelForGameweek(gw),
      provenance:
        slot === 0 ? ("Top Matchup" as const) : ("Random Pick" as const),
      kind: voided ? ("voided" as const) : ("played" as const),
      locked,
      result,
      picks,
      audit:
        gw === CURRENT_GW && slot === 0
          ? { at: labelForGameweek(gw), from: "2–0", to: "2–1" }
          : undefined,
    };
  });
}

export function pickFor(match: ProtoMatch, playerId: string) {
  const own = match.picks.find((p) => p.playerId === playerId);
  return own && own.home !== null && own.away !== null
    ? { home: own.home, away: own.away }
    : null;
}

/**
 * Points for one player on one match. `null` is not zero: a voided match, an
 * unplayed match and a match nobody picked are all non-events, and
 * "No pick, no points" (CLAUDE.md -> Scoring) loses its meaning if absence
 * renders as a score of nothing. scoreMatch() already returns `hasPick`
 * precisely so callers can tell them apart.
 */
export function pointsFor(match: ProtoMatch, playerId: string): number | null {
  if (match.kind === "voided" || !match.result) return null;
  const pick = pickFor(match, playerId);
  if (!pick) return null;
  return scoreMatch(pick.home, pick.away, match.result.home, match.result.away)
    .points;
}

// ---------------------------------------------------------------------------
// Derived readers
// ---------------------------------------------------------------------------

export interface SeasonEntry {
  match: ProtoMatch;
  pick: { home: number; away: number } | null;
  points: number | null;
}
export type WeekOutcome =
  | { kind: "scored"; total: number; pending?: boolean }
  | { kind: "no_picks" }
  | { kind: "not_scored" }
  | { kind: "called_off" };

export interface SeasonWeek {
  gameweek: number;
  dateLabel: string;
  entries: SeasonEntry[];
  /** Kept for sums. `null` means "nothing scored" and is NOT the same fact
   *  as "you didn't pick" -- see `outcome`. */
  total: number | null;
  outcome: WeekOutcome;
}

/** When a player joined. A Late Joiner's record starts where they do -- ADR
 *  0012 D3 works hard to stop absence reading as poor form, and twelve
 *  identical "no pick" rows would undo all of it. */
export function joinGameweek(playerId: string): number {
  return playerId === LATE_JOINER ? LATE_JOIN_GW : 1;
}

export function seasonFor(playerId: string): SeasonWeek[] {
  const from = joinGameweek(playerId);
  const weeks: SeasonWeek[] = [];
  for (let gw = CURRENT_GW; gw >= from; gw--) {
    const entries = matchesForGameweek(gw).map((match) => ({
      match,
      pick: match.locked ? pickFor(match, playerId) : null,
      points: pointsFor(match, playerId),
    }));
    const scored = entries.filter((e) => e.points !== null);
    const total = scored.length
      ? scored.reduce((a, e) => a + (e.points ?? 0), 0)
      : null;

    // "You missed this one" must mean exactly that. It used to fire whenever
    // a week scored nothing -- so a week that was called off, or one that
    // simply hasn't finished, accused the player of not picking.
    let outcome: WeekOutcome;
    // A gameweek can be half-played: one match final, the other locked and
    // still to kick off. The total is real but incomplete, and saying so is
    // the difference between "you scored 5" and "you've scored 5 so far".
    const pending = entries.some(
      (e) => e.match.kind !== "voided" && e.match.result === null,
    );
    if (total !== null) outcome = { kind: "scored", total, pending };
    else if (entries.every((e) => e.match.kind === "voided"))
      outcome = { kind: "called_off" };
    else if (entries.some((e) => e.pick !== null))
      outcome = { kind: "not_scored" };
    else outcome = { kind: "no_picks" };

    weeks.push({
      gameweek: gw,
      dateLabel: labelForGameweek(gw),
      entries,
      total,
      outcome,
    });
  }
  return weeks;
}

export const VIEWER_SEASON = seasonFor(SIGNED_IN);

export const STRIP = Array.from({ length: TOTAL_GW }, (_, i) => {
  const gw = i + 1;
  const week = VIEWER_SEASON.find((w) => w.gameweek === gw);
  return {
    gameweek: gw,
    points: week?.total ?? null,
    picked: week ? week.outcome.kind !== "no_picks" : false,
    month: monthForGameweek(gw),
    future: gw > CURRENT_GW,
  };
});

/** One match line, as every picks surface renders it. The recap on home and
 *  the picks archive are the same table at different lengths, so they share
 *  one row type as well as one component (see PicksTable.tsx). */
export interface PickLine {
  homeCode: string;
  awayCode: string;
  kind: MatchKind;
  locked: boolean;
  pick: { home: number; away: number } | null;
  result: { home: number; away: number } | null;
  points: number | null;
}

export function toPickLine(e: SeasonEntry): PickLine {
  return {
    homeCode: e.match.home.shortCode,
    awayCode: e.match.away.shortCode,
    kind: e.match.kind,
    locked: e.match.locked,
    pick: e.pick,
    result: e.match.result,
    points: e.points,
  };
}

export function recapFor(gw: number): {
  gameweek: number;
  total: number | null;
  outcome: WeekOutcome;
  rows: PickLine[];
} {
  const week = seasonFor(SIGNED_IN).find((w) => w.gameweek === gw);
  const rows = (week?.entries ?? []).map((e) => ({
    homeCode: e.match.home.shortCode,
    awayCode: e.match.away.shortCode,
    kind: e.match.kind,
    locked: e.match.locked,
    pick: e.pick,
    result: e.match.result,
    points: e.points,
  }));
  return {
    gameweek: gw,
    total: week?.total ?? null,
    outcome: week?.outcome ?? { kind: "no_picks" },
    rows,
  };
}

// ---------------------------------------------------------------------------
// Leaderboard fixture -- derived, so a row and its own panel can't disagree
// ---------------------------------------------------------------------------

export interface ProtoBoardRow {
  playerId: string;
  displayName: string;
  emoji: string;
  isBot: boolean;
  isLateJoiner: boolean;
  rank: number | null;
  movement: number | null;
  points: number;
  gameweeksPlayed: number;
  pointsPerGameweek: number | null;
  exactTips: number;
  correctResults: number;
  matchesScored: number;
  isViewer: boolean;
}

export const BOARD: ProtoBoardRow[] = (() => {
  const rand = lcg(31);
  const rows: ProtoBoardRow[] = PLAYERS.map((p) => {
    const season = seasonFor(p.id);
    const scored = season
      .flatMap((w) => w.entries)
      .filter((e) => e.points !== null);
    const points = scored.reduce((a, e) => a + (e.points ?? 0), 0);
    // Derived, never drawn: ADR 0012 D10 makes these counts a *fold of* the
    // score rows. The previous fixture drew them independently, producing
    // three rows whose points were arithmetically impossible given their own
    // panel stats (reachable per-match scores are only {0,1,3,4,5,7}).
    const gameweeksPlayed = CURRENT_GW - joinGameweek(p.id) + 1;
    return {
      playerId: p.id,
      displayName: p.name,
      emoji: p.emoji,
      isBot: p.isBot,
      isLateJoiner: p.id === LATE_JOINER,
      rank: null,
      // No previous-gameweek snapshot means no arrow, not a triangle from
      // nothing (ADR 0012 D2) -- and that only happens to a Late Joiner.
      movement:
        p.id === LATE_JOINER ? null : [1, -1, 0, 2, -2][Math.floor(rand() * 5)],
      points,
      gameweeksPlayed,
      pointsPerGameweek: Number((points / gameweeksPlayed).toFixed(1)),
      exactTips: scored.filter((e) => e.points === 7).length,
      correctResults: scored.filter((e) => (e.points ?? 0) >= 3).length,
      matchesScored: scored.length,
      isViewer: p.id === SIGNED_IN,
    };
  }).sort((a, b) => b.points - a.points);

  let rank = 0;
  let lastPoints = -1;
  for (const row of rows) {
    if (row.isBot) continue;
    if (row.points !== lastPoints) {
      rank += 1;
      lastPoints = row.points;
    }
    row.rank = rank;
  }
  return rows;
})();

export const VIEWER_ROW = BOARD.find((r) => r.isViewer)!;
export const HUMAN_COUNT = BOARD.filter((r) => !r.isBot).length;

/** #157: stored Table Prediction Score out of the 200 maximum (ADR 0010). */
export const TABLE_SCORE = {
  points: 118,
  max: 200,
  champion: "ARS",
  championPosition: 2,
};

// ---------------------------------------------------------------------------
// Predict the Table standings -- its own board, because it is a separate
// title with a separate order (CLAUDE.md: the score is standalone and does
// not fold into Season Total). Humans only: bots have no table prediction.
// A Late Joiner is ineligible here (ADR 0012 D13) even though they are
// eligible for the season title, so they are ranked past, not ranked.
// ---------------------------------------------------------------------------

export interface TableBoardRow {
  playerId: string;
  displayName: string;
  emoji: string;
  rank: number | null;
  points: number;
  isViewer: boolean;
  ineligible: boolean;
}

export const TABLE_MAX = 200;

export const TABLE_BOARD: TableBoardRow[] = (() => {
  const rand = lcg(4051);
  const rows: TableBoardRow[] = PLAYERS.filter((p) => !p.isBot)
    .map((p) => ({
      playerId: p.id,
      displayName: p.name,
      emoji: p.emoji,
      rank: null as number | null,
      points: 70 + Math.floor(rand() * 90),
      isViewer: p.id === SIGNED_IN,
      ineligible: p.id === LATE_JOINER,
    }))
    .sort((a, b) => b.points - a.points);

  let rank = 0;
  let last = -1;
  for (const row of rows) {
    if (row.ineligible) continue;
    if (row.points !== last) {
      rank += 1;
      last = row.points;
    }
    row.rank = rank;
  }
  return rows;
})();

export const TABLE_VIEWER = TABLE_BOARD.find((r) => r.isViewer)!;
