import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { arePeerTablesVisible } from "@/lib/table-predictions/compare";
import {
  loadScoredCohort,
  type ScoredCohort,
} from "@/lib/table-predictions/cohort";
import type { ComparisonTeam } from "@/lib/table-predictions/compare";
import { getDatabaseTime } from "./table-prediction-access";

// The server-side gate and data load for /predict-table/[playerId] (issue
// #214). Deliberately outside src/lib/** -- DB-fetching glue, like
// admin-access.ts -- with the decision itself a pure function so its every
// branch carries a committed test (table-compare-access.test.ts).
//
// The peer-visibility rule this enforces (CLAUDE.md -> Predict the Table):
// no other player's table before the deadline, judged on DB time; after it,
// every submitted table in your competition. Hiding the leaderboard link is
// not enough -- this route refuses on its own.

export type TableCompareDecision = "own-table" | "not-found" | "allow";

export interface TableCompareTarget {
  competitionId: string;
  hasSubmittedTable: boolean;
}

/**
 * Precedence, in order: your own id always goes to your own table (D6);
 * no DB time refuses (fail closed); a peer refuses before the deadline;
 * then a target outside your competition, or with no submitted table,
 * refuses (D4). `target` is null when the id matches no such player.
 */
export function decideTableCompareAccess(params: {
  viewerId: string;
  viewerCompetitionId: string;
  targetId: string;
  target: TableCompareTarget | null;
  now: Date | null;
}): TableCompareDecision {
  const { viewerId, viewerCompetitionId, targetId, target, now } = params;
  if (targetId === viewerId) return "own-table";
  if (now === null || !arePeerTablesVisible(now)) return "not-found";
  if (!target || target.competitionId !== viewerCompetitionId) {
    return "not-found";
  }
  if (!target.hasSubmittedTable) return "not-found";
  return "allow";
}

export interface TableCompareData {
  decision: TableCompareDecision;
  cohort: ScoredCohort;
  teams: Map<string, ComparisonTeam>;
  /** DB time for this request; null if it couldn't be read. */
  now: Date | null;
}

/**
 * One wave after the session: the competition's scored cohort (itself a
 * single wave of three embedded-select queries), the teams, and DB time.
 * Serial depth from the page is 2 -- `loadActivePlayer`, then this.
 *
 * The target's competition scope comes from the cohort itself (D4): the
 * cohort read is competition-scoped and holds only submitted, non-skipped
 * tables, so a target outside it -- another competition, a skipped or
 * un-submitted table, a bot, a made-up id -- reads as null.
 */
export async function loadTableComparison(
  supabase: SupabaseClient,
  viewer: { id: string; competitionId: string },
  targetId: string,
): Promise<TableCompareData> {
  const [cohort, teamsResult, now] = await Promise.all([
    loadScoredCohort(supabase, viewer.competitionId),
    supabase
      .from("teams")
      .select("id, name, short_code")
      .eq("active", true)
      .order("name"),
    getDatabaseTime(supabase),
  ]);
  if (teamsResult.error) throw teamsResult.error;

  const decision = decideTableCompareAccess({
    viewerId: viewer.id,
    viewerCompetitionId: viewer.competitionId,
    targetId,
    target: cohort.players.has(targetId)
      ? { competitionId: viewer.competitionId, hasSubmittedTable: true }
      : null,
    now,
  });

  const teams = new Map(
    (
      (teamsResult.data ?? []) as {
        id: string;
        name: string;
        short_code: string | null;
      }[]
    ).map((t) => [t.id, { id: t.id, name: t.name, shortCode: t.short_code }]),
  );

  return { decision, cohort, teams, now };
}
