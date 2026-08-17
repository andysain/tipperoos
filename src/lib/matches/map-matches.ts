/**
 * Maps a football-data.org /v4/competitions/PL/matches response to `matches`
 * update rows. See issue #11's decision log for the status mapping and why
 * this only ever reads kickoff time, status, and full-time score -- never
 * team+date -- to key a match.
 *
 * This produces per-row UPDATEs (keyed on the internal `id`), not upserts:
 * per CLAUDE.md, all fixtures are seeded once up front and this route only
 * ever applies deltas to an existing row. An upsert here previously failed
 * in production -- Postgres validates the NOT NULL columns (season_id,
 * team_a_id, team_b_id) on the proposed row even for an UPDATE-only conflict
 * resolution, and this mapper never has those values to send.
 */

const COMPLETED_STATUSES = new Set(["FINISHED"]);
const POSTPONED_STATUSES = new Set(["POSTPONED", "SUSPENDED", "CANCELLED"]);

export type MatchStatus = "scheduled" | "completed" | "postponed";

export interface FootballDataMatch {
  readonly id: number;
  readonly utcDate: string;
  readonly status: string;
  readonly matchday: number;
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

export interface MatchUpdate {
  readonly id: string;
  readonly kickoff_time: string;
  readonly status: MatchStatus;
  readonly matchday: number;
  readonly team_a_score: number | null;
  readonly team_b_score: number | null;
  readonly result_updated_at: string | null;
  readonly updated_at: string;
}

export interface MapMatchesResult {
  readonly updates: readonly MatchUpdate[];
  readonly unmatchedProviderMatchIds: readonly string[];
}

export function mapProviderStatus(status: string): MatchStatus {
  if (COMPLETED_STATUSES.has(status)) return "completed";
  if (POSTPONED_STATUSES.has(status)) return "postponed";
  return "scheduled";
}

export function mapMatchesToUpdates(
  response: FootballDataMatchesResponse,
  matchIdByProviderMatchId: ReadonlyMap<string, string>,
  now: Date,
): MapMatchesResult {
  const nowIso = now.toISOString();
  const updates: MatchUpdate[] = [];
  const unmatchedProviderMatchIds: string[] = [];

  for (const match of response.matches) {
    const providerMatchId = String(match.id);
    const id = matchIdByProviderMatchId.get(providerMatchId);
    if (!id) {
      unmatchedProviderMatchIds.push(providerMatchId);
      continue;
    }

    const status = mapProviderStatus(match.status);
    const isCompleted = status === "completed";

    updates.push({
      id,
      kickoff_time: match.utcDate,
      status,
      matchday: match.matchday,
      team_a_score: isCompleted ? match.score.fullTime.home : null,
      team_b_score: isCompleted ? match.score.fullTime.away : null,
      result_updated_at: isCompleted ? nowIso : null,
      updated_at: nowIso,
    });
  }

  return { updates, unmatchedProviderMatchIds };
}
