// Script-side mirror of src/lib/match-selection/rules.ts. Node can't import
// a .ts file directly with a plain `node` invocation, so this file mirrors
// the two pure functions issue #89's seed script needs. Kept line-for-line
// comparable with the TS original -- scripts/lib/parity.test.ts asserts the
// two agree, so this file's own comment is a convenience, not the
// enforcement mechanism (same pattern as scrypt-secret.mjs, see issue #79).

// A promoted club has no previous-season position and counts as position 21
// -- below every returning club (ADR 0006, "Rank source, by phase").
export const PROMOTED_CLUB_SENTINEL_POSITION = 21;

function resolvedPosition(positionByTeamId, teamId) {
  const position = positionByTeamId.get(teamId);
  return position ?? PROMOTED_CLUB_SENTINEL_POSITION;
}

function involvesExcludedClub(fixture, excludedTeamIds) {
  return (
    excludedTeamIds.has(fixture.teamAId) || excludedTeamIds.has(fixture.teamBId)
  );
}

function rankCandidate(fixture, positionByTeamId) {
  const teamAPosition = resolvedPosition(positionByTeamId, fixture.teamAId);
  const teamBPosition = resolvedPosition(positionByTeamId, fixture.teamBId);
  return {
    fixture,
    averagePosition: (teamAPosition + teamBPosition) / 2,
    bestClubPosition: Math.min(teamAPosition, teamBPosition),
  };
}

function isBetterMatchup(candidate, best) {
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

/**
 * Chooses the Match 1 fixture: lowest average league position across its two
 * clubs, tying broken first by the matchup containing the single
 * highest-ranked club, then by earliest kickoff, then by provider_match_id.
 */
export function selectTopMatchup(params) {
  const positionByTeamId = new Map(
    params.positions.map((p) => [p.teamId, p.position]),
  );
  const excludedTeamIds = new Set(params.previousMatch1TeamIds);

  const excludedPool = params.fixtures.filter(
    (f) => !involvesExcludedClub(f, excludedTeamIds),
  );

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

/**
 * Chooses the Match 2 fixture: a uniform random draw over the gameweek's
 * fixtures, excluding Match 1 and anything already kicked off.
 */
export function selectMatch2(params) {
  const random = params.random ?? Math.random;
  const nowMs = params.now.getTime();

  const pool = params.fixtures.filter(
    (f) => f.id !== params.match1FixtureId && f.kickoffTime.getTime() > nowMs,
  );

  if (pool.length === 0) return null;

  const index = Math.floor(random() * pool.length);
  return pool[index];
}

/**
 * Positions come from last season's final table until every club has played
 * at least 10 matches of the current season, then from live standings.
 */
export function chooseRankSource(params) {
  const everyClubHasPlayedTen =
    params.playedCounts.length > 0 &&
    params.playedCounts.every((club) => club.played >= 10);

  if (!everyClubHasPlayedTen) return "previous_season";
  if (!params.liveStandingsAvailable) return "previous_season";
  return "live";
}
