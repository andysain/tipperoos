import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCurrentSeasonId,
  resolveCurrentGameweekForCompetition,
} from "@/app/_lib/gameweek-access";

// DB-fetching glue for the /admin index counts row (docs/admin-ui-spec.md
// §5). Outside src/lib/** for the same reason as the sibling *-access.ts
// files: there's no meaningful golden value to assert on a Supabase
// round-trip, only the derivation, which is a plain subtraction.
//
// Every query is scoped to the caller's own competition_id (AGENTS.md:38,
// docs/adr/0004) -- filter, never aggregate; more than one `competitions`
// row can exist on a project. The `disabled` sub-count named in spec §5 is
// intentionally absent here: no `disabled_at` column exists until the
// Phase 3 migration.

export interface AdminIndexCounts {
  playersTotal: number;
  botsTotal: number;
  /** Null before gameweek 1 is seeded (no season, or no tipped match yet). */
  currentGameweek: number | null;
  tablePredictions: {
    submitted: number;
    skipped: number;
    /** Non-bot players with neither a submitted nor a skipped prediction. */
    outstanding: number;
  };
}

export async function loadAdminIndexCounts(
  supabase: SupabaseClient,
  competitionId: string,
): Promise<AdminIndexCounts> {
  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id, is_bot")
    .eq("competition_id", competitionId)
    .order("id", { ascending: true });
  if (playersError) throw playersError;

  const roster = players ?? [];
  const playersTotal = roster.length;
  const botsTotal = roster.filter((p) => p.is_bot === true).length;
  const humanCount = playersTotal - botsTotal;

  // table_predictions has no competition_id -- scope via an inner join on
  // players, and drop bots (Predict the Table is human onboarding).
  const { data: predictions, error: predictionsError } = await supabase
    .from("table_predictions")
    .select("is_skipped, submitted_at, players!inner(competition_id, is_bot)")
    .eq("players.competition_id", competitionId)
    .eq("players.is_bot", false)
    .order("player_id", { ascending: true });
  if (predictionsError) throw predictionsError;

  let submitted = 0;
  let skipped = 0;
  for (const row of predictions ?? []) {
    if (row.is_skipped === true) {
      skipped += 1;
    } else if (row.submitted_at !== null) {
      submitted += 1;
    }
    // A partially-filled row (no submitted_at, not skipped) counts as
    // outstanding -- the player hasn't finished.
  }
  const outstanding = Math.max(0, humanCount - submitted - skipped);

  const seasonId = await getCurrentSeasonId(supabase);
  const currentGameweek = seasonId
    ? await resolveCurrentGameweekForCompetition(
        supabase,
        competitionId,
        new Date(),
        seasonId,
      )
    : null;

  return {
    playersTotal,
    botsTotal,
    currentGameweek,
    tablePredictions: { submitted, skipped, outstanding },
  };
}
