// Match 1 (Top Matchup) and rank-source selection rules -- see
// docs/adr/0006-auto-selected-tipped-matches.md -> "Decision" for the rule
// text these functions encode. Both are pure: callers own resolving which
// gameweek's fixtures and positions to pass in (issue #89's seed script and
// the per-gameweek selection runner), this module never reimplements that.

export interface SelectionFixture {
  id: string;
  teamAId: string;
  teamBId: string;
  kickoffTime: Date;
  providerMatchId: string;
}

export interface ClubPosition {
  teamId: string;
  // null = promoted, no previous-season position -- resolved to the sentinel below.
  position: number | null;
}

// A promoted club has no previous-season position and counts as position 21
// -- below every returning club (ADR 0006, "Rank source, by phase").
export const PROMOTED_CLUB_SENTINEL_POSITION = 21;

export interface SelectTopMatchupParams {
  fixtures: readonly SelectionFixture[];
  positions: readonly ClubPosition[];
  // Team ids that appeared in the previous gameweek's Match 1 -- excluded so
  // no club is the marquee two gameweeks running.
  previousMatch1TeamIds: readonly string[];
}

function resolvedPosition(
  positionByTeamId: ReadonlyMap<string, number | null>,
  teamId: string,
): number {
  const position = positionByTeamId.get(teamId);
  return position ?? PROMOTED_CLUB_SENTINEL_POSITION;
}

function involvesExcludedClub(
  fixture: SelectionFixture,
  excludedTeamIds: ReadonlySet<string>,
): boolean {
  return (
    excludedTeamIds.has(fixture.teamAId) || excludedTeamIds.has(fixture.teamBId)
  );
}

interface RankedCandidate {
  fixture: SelectionFixture;
  averagePosition: number;
  // The lower (better-ranked) of the matchup's two club positions -- the
  // ADR's "single highest-ranked club" tiebreak.
  bestClubPosition: number;
}

function rankCandidate(
  fixture: SelectionFixture,
  positionByTeamId: ReadonlyMap<string, number | null>,
): RankedCandidate {
  const teamAPosition = resolvedPosition(positionByTeamId, fixture.teamAId);
  const teamBPosition = resolvedPosition(positionByTeamId, fixture.teamBId);
  return {
    fixture,
    averagePosition: (teamAPosition + teamBPosition) / 2,
    bestClubPosition: Math.min(teamAPosition, teamBPosition),
  };
}

/**
 * Chooses the Match 1 fixture: lowest average league position across its two
 * clubs, tying broken first by the matchup containing the single
 * highest-ranked club, then by earliest kickoff, then by provider_match_id --
 * a deterministic final tiebreak so the result never depends on arbitrary
 * row order (AGENTS.md).
 */
export function selectTopMatchup(
  params: SelectTopMatchupParams,
): SelectionFixture | null {
  const positionByTeamId = new Map(
    params.positions.map((p) => [p.teamId, p.position] as const),
  );
  const excludedTeamIds = new Set(params.previousMatch1TeamIds);

  const excludedPool = params.fixtures.filter(
    (f) => !involvesExcludedClub(f, excludedTeamIds),
  );

  // Degenerate case: excluding the previous gameweek's clubs would empty the
  // pool (only possible for a gameweek reduced to one or two fixtures) --
  // fall back to the unexcluded pool rather than returning nothing.
  const pool = excludedPool.length > 0 ? excludedPool : params.fixtures;

  if (pool.length === 0) return null;

  const [first, ...rest] = pool;
  let best = rankCandidate(first, positionByTeamId);

  for (const fixture of rest) {
    const candidate = rankCandidate(fixture, positionByTeamId);
    if (isBetterMatchup(candidate, best)) best = candidate;
  }

  return best.fixture;
}

function isBetterMatchup(
  candidate: RankedCandidate,
  best: RankedCandidate,
): boolean {
  if (candidate.averagePosition !== best.averagePosition) {
    return candidate.averagePosition < best.averagePosition;
  }
  if (candidate.bestClubPosition !== best.bestClubPosition) {
    return candidate.bestClubPosition < best.bestClubPosition;
  }
  const candidateKickoff = candidate.fixture.kickoffTime.getTime();
  const bestKickoff = best.fixture.kickoffTime.getTime();
  if (candidateKickoff !== bestKickoff) return candidateKickoff < bestKickoff;

  // provider_match_id is a numeric id from the external provider (see
  // AGENTS.md); comparing it as a string would sort "100" before "99".
  return (
    Number(candidate.fixture.providerMatchId) <
    Number(best.fixture.providerMatchId)
  );
}

export type RankSource = "previous_season" | "live";

export interface ClubPlayedCount {
  teamId: string;
  played: number;
}

export interface ChooseRankSourceParams {
  // Matches played this season, one entry per club. Empty = season not
  // started yet.
  playedCounts: readonly ClubPlayedCount[];
  // False if live standings are missing or stale at selection time.
  liveStandingsAvailable: boolean;
}

/**
 * Positions come from last season's final table until every club has played
 * at least 10 matches of the current season, then from live standings -- a
 * minimum across all clubs, not a per-club check, so postponements can't
 * shift the switchover early. Falls back to last season's table if live
 * standings are unavailable or stale rather than blocking selection (ADR
 * 0006, "Rank source, by phase").
 */
export function chooseRankSource(params: ChooseRankSourceParams): RankSource {
  const everyClubHasPlayedTen =
    params.playedCounts.length > 0 &&
    params.playedCounts.every((club) => club.played >= 10);

  if (!everyClubHasPlayedTen) return "previous_season";
  if (!params.liveStandingsAvailable) return "previous_season";
  return "live";
}
