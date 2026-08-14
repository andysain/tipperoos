/**
 * Maps a football-data.org /v4/competitions/PL/matches response to `matches`
 * upsert rows. See issue #11's decision log for the status mapping and why
 * this only ever reads kickoff time, status, and full-time score -- never
 * team+date -- to key a match.
 */

const COMPLETED_STATUSES = new Set(["FINISHED"]);
const POSTPONED_STATUSES = new Set(["POSTPONED", "SUSPENDED", "CANCELLED"]);

export type MatchStatus = "scheduled" | "completed" | "postponed";

export interface FootballDataMatch {
  readonly id: number;
  readonly utcDate: string;
  readonly status: string;
  readonly homeTeam: { readonly id: number };
  readonly awayTeam: { readonly id: number };
  readonly score: {
    readonly fullTime: {
      readonly home: number | null;
      readonly away: number | null;
    };
  };
}

export interface FootballDataMatchesResponse {
  readonly matches: readonly FootballDataMatch[];
}

export interface MatchRow {
  readonly provider_name: string;
  readonly provider_match_id: string;
  readonly kickoff_time: string;
  readonly status: MatchStatus;
  readonly team_a_score: number | null;
  readonly team_b_score: number | null;
  readonly result_updated_at: string | null;
}

export interface MapMatchesResult {
  readonly rows: readonly MatchRow[];
  readonly unmatchedProviderMatchIds: readonly string[];
}

export function mapProviderStatus(status: string): MatchStatus {
  if (COMPLETED_STATUSES.has(status)) return "completed";
  if (POSTPONED_STATUSES.has(status)) return "postponed";
  return "scheduled";
}

export function mapMatchesToRows(
  response: FootballDataMatchesResponse,
  knownProviderMatchIds: ReadonlySet<string>,
  providerName: string,
  now: Date,
): MapMatchesResult {
  const nowIso = now.toISOString();
  const rows: MatchRow[] = [];
  const unmatchedProviderMatchIds: string[] = [];

  for (const match of response.matches) {
    const providerMatchId = String(match.id);
    if (!knownProviderMatchIds.has(providerMatchId)) {
      unmatchedProviderMatchIds.push(providerMatchId);
      continue;
    }

    const status = mapProviderStatus(match.status);
    const isCompleted = status === "completed";

    rows.push({
      provider_name: providerName,
      provider_match_id: providerMatchId,
      kickoff_time: match.utcDate,
      status,
      team_a_score: isCompleted ? match.score.fullTime.home : null,
      team_b_score: isCompleted ? match.score.fullTime.away : null,
      result_updated_at: isCompleted ? nowIso : null,
    });
  }

  return { rows, unmatchedProviderMatchIds };
}
