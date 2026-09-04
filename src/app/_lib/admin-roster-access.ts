import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCurrentSeasonId,
  loadTippedMatchIdsForGameweek,
  resolveCurrentGameweekForCompetition,
} from "@/app/_lib/gameweek-access";
import { getGameweekOneKickoff } from "@/app/_lib/table-prediction-access";
import { isLateJoiner } from "@/lib/table-predictions/rules";

// DB glue for the /admin/players roster table (docs/admin-ui-spec.md §6.1).
// Read-only; no write path exists in this issue.
//
// The single most important constraint here (spec §6.3, D3, CLAUDE.md's
// no-elevated-read-visibility rule): the current-gameweek picks column is a
// COUNT, never a scoreline. The `picks` query below selects `player_id`
// only -- it never reads `pred_home_score` / `pred_away_score`, so there is
// nothing for an admin surface to leak even by accident.
//
// Every query is scoped to the admin's own competition_id. `picks` carries
// no competition_id, so it is scoped by an inner join on `players`
// (matches are global and two competitions can tip the same fixture --
// ADR 0004), mirroring loadCurrentGameweekPicks in admin-index-access.ts.

export interface RosterPlayer {
  id: string;
  emoji: string | null;
  displayName: string;
  isAdmin: boolean;
  isBot: boolean;
  isLateJoiner: boolean;
  hasEmail: boolean;
  /** ISO instant -- only set when the lockout is still in the future. */
  lockedUntil: string | null;
  pinResetRequired: boolean;
  joinedAt: string;
  /**
   * Picks filed for the current gameweek's tipped matches (0..tipped count).
   * Null when there is no current gameweek, or it has no tipped matches --
   * the column then renders "—" and this player is never flagged "needs
   * attention" for missing picks (spec §5 Phase 1 note / decision 7).
   */
  currentGameweekPickCount: number | null;
}

export interface AdminRoster {
  players: RosterPlayer[];
  /**
   * Tipped matches in the current gameweek (1 with a Skipped Slot, else 2),
   * or null when there is no current gameweek / no tipped match yet.
   */
  currentGameweekTippedMatchCount: number | null;
}

interface PlayerRow {
  id: string;
  emoji: string | null;
  display_name: string;
  is_admin: boolean | null;
  is_bot: boolean | null;
  email: string | null;
  locked_until: string | null;
  pin_reset_required: boolean | null;
  joined_at: string;
}

async function loadCurrentGameweekPickCounts(
  supabase: SupabaseClient,
  competitionId: string,
  seasonId: string,
  gameweekNumber: number,
): Promise<{
  countByPlayerId: Map<string, number>;
  tippedMatchCount: number;
} | null> {
  const tippedMatchIds = await loadTippedMatchIdsForGameweek(
    supabase,
    competitionId,
    seasonId,
    gameweekNumber,
  );
  if (tippedMatchIds.length === 0) return null;

  // Bots are kept here (the roster lists them), so no is_bot filter -- but
  // still competition-scoped through players, since a fixture is global and
  // another competition may have tipped the same match (AGENTS.md, ADR 0004).
  const { data: picks, error: picksError } = await supabase
    .from("picks")
    .select("player_id, players!inner(competition_id)")
    .in("match_id", tippedMatchIds)
    .eq("players.competition_id", competitionId)
    .order("player_id", { ascending: true });
  if (picksError) throw picksError;

  const countByPlayerId = new Map<string, number>();
  for (const row of picks ?? []) {
    const id = row.player_id as string;
    countByPlayerId.set(id, (countByPlayerId.get(id) ?? 0) + 1);
  }

  return { countByPlayerId, tippedMatchCount: tippedMatchIds.length };
}

/**
 * Every player in the admin's competition (bots included), plus each one's
 * current-gameweek pick count.
 *
 * Round-trip shape: one wave for the season id, gameweek-1 kickoff and the
 * player list; then the current-gameweek resolve (needs the season id);
 * then the gameweek row and its picks (need the gameweek number). Each
 * sequential await genuinely depends on the previous result -- the number
 * to look up isn't known until the resolve returns
 * (docs/standards/PERFORMANCE_TESTING_STANDARD.md §7).
 */
export async function loadAdminRoster(
  supabase: SupabaseClient,
  competitionId: string,
  now: Date,
): Promise<AdminRoster> {
  const [seasonId, gameweekOneKickoff, playersResult] = await Promise.all([
    getCurrentSeasonId(supabase),
    getGameweekOneKickoff(supabase),
    supabase
      .from("players")
      .select(
        "id, emoji, display_name, is_admin, is_bot, email, locked_until, pin_reset_required, joined_at",
      )
      .eq("competition_id", competitionId)
      .order("display_name", { ascending: true }),
  ]);
  if (playersResult.error) throw playersResult.error;

  const currentGameweek = seasonId
    ? await resolveCurrentGameweekForCompetition(
        supabase,
        competitionId,
        now,
        seasonId,
      )
    : null;

  const pickCounts =
    seasonId && currentGameweek !== null
      ? await loadCurrentGameweekPickCounts(
          supabase,
          competitionId,
          seasonId,
          currentGameweek,
        )
      : null;

  const players: RosterPlayer[] = (
    (playersResult.data ?? []) as PlayerRow[]
  ).map((row) => {
    const lockedInFuture =
      row.locked_until !== null &&
      new Date(row.locked_until).getTime() > now.getTime();

    const rawCount = pickCounts?.countByPlayerId.get(row.id) ?? 0;
    const currentGameweekPickCount = pickCounts
      ? Math.min(rawCount, pickCounts.tippedMatchCount)
      : null;

    return {
      id: row.id,
      emoji: row.emoji,
      displayName: row.display_name,
      isAdmin: row.is_admin === true,
      isBot: row.is_bot === true,
      isLateJoiner: isLateJoiner(new Date(row.joined_at), gameweekOneKickoff),
      hasEmail: typeof row.email === "string" && row.email.trim() !== "",
      lockedUntil: lockedInFuture ? row.locked_until : null,
      pinResetRequired: row.pin_reset_required === true,
      joinedAt: row.joined_at,
      currentGameweekPickCount,
    };
  });

  return {
    players,
    currentGameweekTippedMatchCount: pickCounts?.tippedMatchCount ?? null,
  };
}
