import { scoreMatch } from "@/lib/scoring/match";
import {
  compareStreakMatches,
  computeStreaks,
  countsTowardStreak,
  isRightResult,
  STREAK_BADGE_MIN,
  type StreakMatch,
  type StreakPick,
  type StreakPlayer,
} from "./streaks";
import { rankScores } from "./rank";

/**
 * The Gameweek wrap (issue #218): a few awards about the last snapshotted
 * gameweek N, derived on every request from snapshots, picks and matches.
 * Pure -- the loader in src/app/_lib/leaderboard-access.ts feeds it.
 *
 * Returns structured facts, never prose: the Season tab and the admin
 * panel (#219) each compose their own copy from them.
 */

export interface WrapMatch extends StreakMatch {
  gameweekNumber: number;
}

export interface WrapSnapshotRow {
  playerId: string;
  gameweekScore: number;
  seasonTotal: number;
}

export interface GameweekWrapInput {
  /** N: the highest-numbered gameweek with snapshot rows. */
  gameweekNumber: number;
  /** The live roster, bots included -- filtered here. */
  players: readonly StreakPlayer[];
  /** Every Tipped Match this season, with its gameweek number. */
  matches: readonly WrapMatch[];
  /** Human picks on completed, non-voided tipped matches. */
  picks: readonly StreakPick[];
  /** Every snapshotted gameweek number, for the kindness chain (L1). */
  scoredGameweekNumbers: readonly number[];
  /** N's snapshot rows. */
  snapshot: readonly WrapSnapshotRow[];
  /** N-1's snapshot rows; null when N-1 has none (GW1, or fully void). */
  previousSnapshot: readonly WrapSnapshotRow[] | null;
}

export interface Scoreline {
  home: number;
  away: number;
}

export type WrapAward =
  | {
      kind: "tipper";
      winners: {
        playerId: string;
        points: number;
        /** An exact score no other human called, if the winner had one. */
        onlyCall: Scoreline | null;
      }[];
    }
  | {
      kind: "topOfTheHill";
      /** Only players NEW to rank 1 -- a leader who stays top isn't listed. */
      winners: { playerId: string; jointTop: boolean }[];
    }
  | {
      kind: "onFire";
      winners: {
        playerId: string;
        streakLength: number;
        /** Passed every human's best through N-1 (L3). */
        newRecord: boolean;
      }[];
    }
  | {
      kind: "rocket";
      winners: { playerId: string; placesClimbed: number; newRank: number }[];
    }
  | {
      kind: "streakSnapped";
      winners: {
        playerId: string;
        /** The streak's value just before the match that broke it (L2). */
        endedAt: number;
        /** No human's run this season is longer. */
        stillSeasonBest: boolean;
      }[];
    }
  | {
      kind: "furthestOff";
      winners: {
        playerId: string;
        pick: Scoreline;
        result: Scoreline;
        /** |pick home - result home| + |pick away - result away|. */
        goalError: number;
      }[];
    };

type FurthestOffWinner = Extract<
  WrapAward,
  { kind: "furthestOff" }
>["winners"][number];

/** Fired order, and the cap's priority between the middle awards (D5). */
const KIND_ORDER: readonly WrapAward["kind"][] = [
  "tipper",
  "topOfTheHill",
  "onFire",
  "rocket",
  "streakSnapped",
  "furthestOff",
];
const MIDDLE_AWARD_CAP = 2;

/** The smallest climb that earns a Rocket (D4). */
const ROCKET_MIN_PLACES = 3;

export interface GameweekWrap {
  gameweekNumber: number;
  /** Capped at 4 and ordered (D5) -- what the Season tab renders. */
  shown: WrapAward[];
  /** Every award that fired, uncapped, same order -- for #219. */
  fired: WrapAward[];
}

/** A gameweek's matches that have a final score and aren't voided, in
 *  streak order -- the only ones a pick can be judged on. */
function finishedMatchesOf(
  matches: readonly WrapMatch[],
  gameweekNumber: number,
): (WrapMatch & { result: Scoreline })[] {
  return matches
    .filter((m) => m.gameweekNumber === gameweekNumber && countsTowardStreak(m))
    .sort(compareStreakMatches)
    .flatMap((m) => (m.result === null ? [] : [{ ...m, result: m.result }]));
}

/** Skip rank by season total -- callers pass humans only (ADR 0012 D12). */
function ranksOf(rows: readonly WrapSnapshotRow[]): Map<string, number> {
  return new Map(
    rankScores(
      rows.map((row) => ({ playerId: row.playerId, points: row.seasonTotal })),
    ).map((row) => [row.playerId, row.rank]),
  );
}

function earliestKickoff(
  matches: readonly WrapMatch[],
  gameweekNumber: number,
): number | null {
  const times = matches
    .filter((m) => m.gameweekNumber === gameweekNumber)
    .map((m) => new Date(m.kickoffUtcIso).getTime());
  return times.length > 0 ? Math.min(...times) : null;
}

/**
 * The 0-point human picks in one gameweek with the largest goal error,
 * skipping anyone in `excluded` -- the kindness rule passes the award on
 * to the next-largest error rather than withholding it.
 */
function furthestOffIn(
  matches: readonly WrapMatch[],
  picks: readonly StreakPick[],
  gameweekNumber: number,
  excluded: ReadonlySet<string>,
): FurthestOffWinner[] {
  const worstByPlayer = new Map<string, FurthestOffWinner>();
  for (const m of finishedMatchesOf(matches, gameweekNumber)) {
    for (const p of picks) {
      if (p.matchId !== m.id || excluded.has(p.playerId)) continue;
      // A Wrong Way Round scores 1, so `points === 0` excludes it too.
      if (
        scoreMatch(p.home, p.away, m.result.home, m.result.away).points !== 0
      ) {
        continue;
      }
      const goalError =
        Math.abs(p.home - m.result.home) + Math.abs(p.away - m.result.away);
      const current = worstByPlayer.get(p.playerId);
      if (current === undefined || goalError > current.goalError) {
        worstByPlayer.set(p.playerId, {
          playerId: p.playerId,
          pick: { home: p.home, away: p.away },
          result: { home: m.result.home, away: m.result.away },
          goalError,
        });
      }
    }
  }
  const candidates = [...worstByPlayer.values()];
  const worst = Math.max(0, ...candidates.map((c) => c.goalError));
  return worst > 0 ? candidates.filter((c) => c.goalError === worst) : [];
}

function sameScore(a: Scoreline, b: Scoreline): boolean {
  return a.home === b.home && a.away === b.away;
}

export function buildGameweekWrap(input: GameweekWrapInput): GameweekWrap {
  const humanIds = new Set(
    input.players.filter((p) => !p.isBot).map((p) => p.id),
  );
  const picks = input.picks.filter((p) => humanIds.has(p.playerId));
  const finishedN = finishedMatchesOf(input.matches, input.gameweekNumber);

  /** The first of N's matches where this player alone called the exact score. */
  const onlyCallFor = (playerId: string): Scoreline | null => {
    for (const m of finishedN) {
      const exact = picks.filter(
        (p) => p.matchId === m.id && sameScore(p, m.result),
      );
      if (exact.length === 1 && exact[0].playerId === playerId) {
        return { home: m.result.home, away: m.result.away };
      }
    }
    return null;
  };
  const snapshot = input.snapshot.filter((row) => humanIds.has(row.playerId));

  const fired: WrapAward[] = [];

  const topScore = Math.max(0, ...snapshot.map((row) => row.gameweekScore));
  if (topScore > 0) {
    fired.push({
      kind: "tipper",
      winners: snapshot
        .filter((row) => row.gameweekScore === topScore)
        .map((row) => ({
          playerId: row.playerId,
          points: row.gameweekScore,
          onlyCall: onlyCallFor(row.playerId),
        })),
    });
  }

  const previous =
    input.previousSnapshot?.filter((row) => humanIds.has(row.playerId)) ?? null;
  if (previous !== null && previous.length > 0) {
    const ranksN = ranksOf(snapshot);
    const ranksPrev = ranksOf(previous);

    const leadersN = [...ranksN].filter(([, rank]) => rank === 1);
    const newLeaders = leadersN.filter(([id]) => ranksPrev.get(id) !== 1);
    if (newLeaders.length > 0) {
      fired.push({
        kind: "topOfTheHill",
        winners: newLeaders.map(([playerId]) => ({
          playerId,
          jointTop: leadersN.length > 1,
        })),
      });
    }

    // L6: a player who joined after N-1 began has an N-1 row only because
    // the sync re-wrote that snapshot after they joined -- a zero, not a
    // standing they climbed from.
    const previousKickoff = earliestKickoff(
      input.matches,
      input.gameweekNumber - 1,
    );
    const joinedAtById = new Map(
      input.players.map((p) => [p.id, new Date(p.joinedAt).getTime()]),
    );
    const climbs = [...ranksN].flatMap(([playerId, newRank]) => {
      const previousRank = ranksPrev.get(playerId);
      const joinedAt = joinedAtById.get(playerId);
      if (
        previousRank === undefined ||
        joinedAt === undefined ||
        previousKickoff === null ||
        joinedAt > previousKickoff
      ) {
        return [];
      }
      return [{ playerId, placesClimbed: previousRank - newRank, newRank }];
    });
    const bestClimb = Math.max(0, ...climbs.map((c) => c.placesClimbed));
    if (bestClimb >= ROCKET_MIN_PLACES) {
      fired.push({
        kind: "rocket",
        winners: climbs.filter((c) => c.placesClimbed === bestClimb),
      });
    }
  }

  // Streaks "through N" and "through N-1" are bounded by gameweek, never
  // "everything final so far" -- an N+1 match completed before this
  // request must not leak in (L9).
  const humans = input.players.filter((p) => !p.isBot);
  const streaksThrough = (gameweekNumber: number) =>
    new Map(
      computeStreaks({
        matches: input.matches.filter(
          (m) => m.gameweekNumber <= gameweekNumber,
        ),
        picks,
        players: humans,
      }).map((s) => [s.playerId, s]),
    );
  const throughN = streaksThrough(input.gameweekNumber);
  const throughPrev = streaksThrough(input.gameweekNumber - 1);
  const recordPrev = Math.max(
    0,
    ...[...throughPrev.values()].map((s) => s.best),
  );
  const recordN = Math.max(0, ...[...throughN.values()].map((s) => s.best));

  const onFire = humans.flatMap((player) => {
    const now = throughN.get(player.id)?.current ?? 0;
    const before = throughPrev.get(player.id)?.current ?? 0;
    if (now < STREAK_BADGE_MIN) return [];
    const reached = before < STREAK_BADGE_MIN;
    // A record only when the streak PASSED one it didn't hold alone --
    // otherwise a record holder's continuing streak "breaks the record"
    // every week, which is exactly the continuing case D4 excludes. Level
    // with someone else's record isn't holding it. (Level with only this
    // player's OWN earlier run can't be told apart from holding it with
    // computeStreaks' output; that rare tie reads as continuing.)
    const recordSharedWithOthers = humans.some(
      (other) =>
        other.id !== player.id &&
        (throughPrev.get(other.id)?.best ?? 0) === recordPrev,
    );
    const newRecord =
      now > recordPrev && (before < recordPrev || recordSharedWithOthers);
    if (!reached && !newRecord) return [];
    return [{ playerId: player.id, streakLength: now, newRecord }];
  });
  if (onFire.length > 0) fired.push({ kind: "onFire", winners: onFire });

  const pickByKey = new Map(
    picks.map((p) => [`${p.playerId}:${p.matchId}`, p]),
  );
  const snapped = humans.flatMap((player) => {
    const before = throughPrev.get(player.id)?.current ?? 0;
    if (before < STREAK_BADGE_MIN) return [];
    const joinedAt = new Date(player.joinedAt).getTime();
    let value = before;
    for (const m of finishedN) {
      if (new Date(m.kickoffUtcIso).getTime() < joinedAt) continue;
      const p = pickByKey.get(`${player.id}:${m.id}`);
      if (p === undefined || !isRightResult(p, m.result)) {
        return [
          {
            playerId: player.id,
            endedAt: value,
            stillSeasonBest: value >= recordN,
          },
        ];
      }
      value += 1;
    }
    return [];
  });
  if (snapped.length > 0)
    fired.push({ kind: "streakSnapped", winners: snapped });

  // L1: the kindness rule uses who was actually SHOWN as Furthest Off the
  // week before -- which had its own kindness rule applied -- so walk the
  // scored gameweeks in order, carrying each week's winners forward. A
  // gameweek with no snapshot shows no wrap, so it excludes nobody.
  const scored = new Set(input.scoredGameweekNumbers);
  let previousWinners = new Set<string>();
  let furthestOff: FurthestOffWinner[] = [];
  for (let g = 1; g <= input.gameweekNumber; g += 1) {
    if (!scored.has(g)) {
      previousWinners = new Set();
      continue;
    }
    furthestOff = furthestOffIn(input.matches, picks, g, previousWinners);
    previousWinners = new Set(furthestOff.map((w) => w.playerId));
  }
  if (scored.has(input.gameweekNumber) && furthestOff.length > 0) {
    fired.push({ kind: "furthestOff", winners: furthestOff });
  }

  fired.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  const middle = fired.filter(
    (a) => a.kind !== "tipper" && a.kind !== "furthestOff",
  );
  const shown = [
    ...fired.filter((a) => a.kind === "tipper"),
    ...middle.slice(0, MIDDLE_AWARD_CAP),
    ...fired.filter((a) => a.kind === "furthestOff"),
  ];

  return { gameweekNumber: input.gameweekNumber, shown, fired };
}
