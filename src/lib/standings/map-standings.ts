/**
 * Maps a football-data.org /v4/competitions/PL/standings response to
 * team_standings upsert rows. See issue #88's decision log for why only
 * the TOTAL group is read (the payload also carries HOME/AWAY splits) and
 * why an unmatched provider team id is skipped rather than thrown.
 */

export interface FootballDataStandingsTable {
  readonly position: number;
  readonly team: { readonly id: number };
  readonly playedGames: number;
}

export interface FootballDataStandingsGroup {
  readonly type: string;
  readonly table: readonly FootballDataStandingsTable[];
}

export interface FootballDataStandingsResponse {
  readonly standings: readonly FootballDataStandingsGroup[];
}

export interface TeamStandingRow {
  readonly team_id: string;
  readonly season_id: string;
  readonly position: number;
  readonly played: number;
  readonly updated_at: string;
}

export interface MapStandingsResult {
  readonly rows: readonly TeamStandingRow[];
  readonly unmatchedProviderTeamIds: readonly string[];
}

export function mapStandingsToRows(
  response: FootballDataStandingsResponse,
  teamIdByProviderId: ReadonlyMap<string, string>,
  seasonId: string,
  now: Date,
): MapStandingsResult {
  const totalGroup = response.standings.find((group) => group.type === "TOTAL");
  const updatedAt = now.toISOString();

  const rows: TeamStandingRow[] = [];
  const unmatchedProviderTeamIds: string[] = [];

  for (const entry of totalGroup?.table ?? []) {
    const providerTeamId = String(entry.team.id);
    const teamId = teamIdByProviderId.get(providerTeamId);
    if (!teamId) {
      unmatchedProviderTeamIds.push(providerTeamId);
      continue;
    }
    rows.push({
      team_id: teamId,
      season_id: seasonId,
      position: entry.position,
      played: entry.playedGames,
      updated_at: updatedAt,
    });
  }

  return { rows, unmatchedProviderTeamIds };
}
