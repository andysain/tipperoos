import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { scoresForCompetition } from "@/lib/competitions/scope";
import { buildLadder, type LadderRow } from "@/lib/leaderboard/ladder";
import { loadPicksRecord } from "./picks-record-access";
import type { PickLine } from "@/components/gameweek/PicksTable";
import type { WeekOutcome } from "@/lib/gameweeks/week-outcome";

/**
 * The Pick Board's summary section (docs/adr/0013 D15).
 *
 * The recap reuses `loadPicksRecord` rather than growing a second reader:
 * the recap and the season record are the same table at different lengths,
 * so they should also be the same query. It also means the recap inherits
 * the record's lock enforcement for free.
 */
export interface SummaryRecap {
  gameweek: number;
  lines: PickLine[];
  outcome: WeekOutcome;
}

export type LadderEntry = LadderRow;

export async function loadRecap(
  supabase: SupabaseClient,
  competitionId: string,
  seasonId: string,
  playerId: string,
  gameweekNumber: number,
  now: Date,
): Promise<SummaryRecap | null> {
  const record = await loadPicksRecord(
    supabase,
    competitionId,
    seasonId,
    playerId,
    now,
  );
  const week = record?.weeks.find((w) => w.gameweek === gameweekNumber);
  if (!week) return null;
  return { gameweek: week.gameweek, lines: week.lines, outcome: week.outcome };
}

/**
 * The viewer and their nearest neighbours.
 *
 * "Where does that leave me" is a comparative question in a family
 * competition, and a bare rank numeral can't answer it -- ADR 0012 deferred
 * exactly this idea ("12 behind the top") rather than rejecting it.
 *
 * Always three rows, wherever the viewer sits: at the top they see the two
 * below, at the bottom the two above. A two-row edge case would change the
 * block's shape at the moments a player is most invested in it.
 *
 * Bots are excluded. They can't be caught or lost to, because they can't
 * win (docs/adr/0012 D12), and the rank shown here must match the
 * leaderboard's or the two surfaces disagree.
 */
export async function loadLadder(
  supabase: SupabaseClient,
  competitionId: string,
  seasonId: string,
  playerId: string,
): Promise<LadderEntry[]> {
  const totals = await scoresForCompetition(supabase, competitionId, seasonId);

  // Day one drops the numbers rather than showing a column of zeros
  // (CLAUDE.md -> Home surface; docs/adr/0012 D8). /leaderboard already does
  // this; the ladder did not, so one product rule had two answers inside one
  // branch and the Pick Board rendered "1st, 0 points" three times over.
  const scored = totals.some((t) => t.matchesScored > 0);
  if (!scored) return [];

  return buildLadder(totals, playerId);
}
