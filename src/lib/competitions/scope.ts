import "server-only";
import { tippedSlots } from "@/lib/gameweeks/tipped-slots";
import type { createServerSupabaseClient } from "@/lib/supabase/server";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

/**
 * Shared query-helper backstop for match_id-keyed data (issue #71).
 *
 * `picks` and `scores` are keyed by (player_id, match_id) with no
 * competition_id column of their own -- `matches` is a global, shared
 * fixture list, so two competitions can legitimately tip the same
 * real-world match. Any hand-rolled query filtering by match_id alone
 * risks leaking one competition's picks/scores into another's view.
 * These helpers are the only sanctioned way to read that data scoped to
 * a competition -- always join back to players.competition_id (the one
 * table in the chain that actually carries it), never trust match_id
 * alone as a boundary.
 */

export interface CompetitionScoreRow {
  playerId: string;
  displayName: string;
  emoji: string | null;
  isBot: boolean;
  joinedAt: string;
  points: number;
  matchesScored: number;
  /** Matches where this player named the exact scoreline. */
  exactTips: number;
  /** Matches where this player got the result right (win/draw/loss). */
  correctResults: number;
}

/**
 * One player's aggregated totals for a set of scored matches -- the shape
 * `competition_score_totals`/`score_totals_for_matches`
 * (supabase/migrations/20260818020000_score_totals_aggregate.sql) compute in
 * SQL. `exactTips`/`correctResults` are derived there straight off each
 * match's points value, because the additive formula's reachable score set
 * is exactly {0, 1, 3, 4, 5, 7}
 * (docs/adr/0009-match-scoring-formula-and-title-eligibility.md, and
 * CLAUDE.md -> Scoring): points = 7 <=> exact scoreline (7 needs all four
 * terms, only possible on the exact scoreline), and points >= 3 <=> correct
 * result (every term but Wrong Way Round requires one, and Wrong Way Round
 * is mutually exclusive with all of them by construction). A deliberate
 * coupling to the formula, not a coincidence -- if the reachable set ever
 * changes, the SQL migration's predicate must change with it.
 */
export interface CompetitionScoreTotal {
  playerId: string;
  points: number;
  matchesScored: number;
  exactTips: number;
  correctResults: number;
}

/**
 * Pure fold: combines a competition's player roster with their pre-aggregated
 * score totals (issue #182 -- computed in SQL, not folded from raw rows here,
 * to stay well under Supabase's 1,000-row cap regardless of season length)
 * into one row per player, players with no totals yet included at 0 --
 * required so a Late Joiner or a brand-new player still appears on the
 * leaderboard instead of vanishing.
 */
export function mergeCompetitionScoreTotals(
  players: {
    id: string;
    displayName: string;
    emoji: string | null;
    isBot: boolean;
    joinedAt: string;
  }[],
  totals: CompetitionScoreTotal[],
): CompetitionScoreRow[] {
  const empty: Omit<CompetitionScoreTotal, "playerId"> = {
    points: 0,
    matchesScored: 0,
    exactTips: 0,
    correctResults: 0,
  };
  const byPlayer = new Map(totals.map((t) => [t.playerId, t]));

  return players.map((player) => {
    const agg = byPlayer.get(player.id) ?? empty;
    return {
      playerId: player.id,
      displayName: player.displayName,
      emoji: player.emoji,
      isBot: player.isBot,
      joinedAt: player.joinedAt,
      points: agg.points,
      matchesScored: agg.matchesScored,
      exactTips: agg.exactTips,
      correctResults: agg.correctResults,
    };
  });
}

/**
 * Leaderboard read, scoped to one competition AND one season (scores has
 * no season column either -- a competition-only filter would silently
 * blend two seasons' points the moment a second season exists, the same
 * latent-corruption shape the match_id leak is).
 *
 * Voided matches are not filtered out here: the scoring recompute is the
 * single authority on their points (zeroed on void), so a voided match's
 * score row already reads 0 by the time this runs. This stays a pure
 * scoped read.
 *
 * Score totals come from the `competition_score_totals` SQL aggregate
 * (issue #182), not a raw per-match `scores` select folded in JS: this
 * repo's season is ~76 scored matches, so a raw select returns up to
 * (matches x roster) rows and crosses Supabase's configured 1,000-row cap
 * (supabase/config.toml) at 14 players -- a silent, arbitrary-row
 * truncation with no `.order()` to make it deterministic. The aggregate
 * returns one row per player regardless of season length.
 */
export async function scoresForCompetition(
  supabase: SupabaseClient,
  competitionId: string,
  seasonId: string,
): Promise<CompetitionScoreRow[]> {
  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id, display_name, emoji, is_bot, joined_at")
    .eq("competition_id", competitionId);
  if (playersError) throw playersError;

  const playerIds = (players ?? []).map((p) => p.id);
  if (playerIds.length === 0) return [];

  const { data: totalRows, error: totalsError } = await supabase.rpc(
    "competition_score_totals",
    { p_player_ids: playerIds, p_season_id: seasonId },
  );
  if (totalsError) throw totalsError;

  return mergeCompetitionScoreTotals(
    (players ?? []).map((p) => ({
      id: p.id,
      displayName: p.display_name,
      emoji: p.emoji,
      isBot: p.is_bot,
      joinedAt: p.joined_at,
    })),
    (
      (totalRows ?? []) as {
        player_id: string;
        points: number;
        matches_scored: number;
        exact_tips: number;
        correct_results: number;
      }[]
    ).map((r) => ({
      playerId: r.player_id,
      points: r.points,
      matchesScored: r.matches_scored,
      exactTips: r.exact_tips,
      correctResults: r.correct_results,
    })),
  );
}

export interface CompetitionPickRow {
  playerId: string;
  displayName: string;
  emoji: string | null;
  isBot: boolean;
  predHomeScore: number | null;
  predAwayScore: number | null;
}

export type PicksForMatchResult =
  { locked: false } | { locked: true; picks: CompetitionPickRow[] };

/** Picks lock 5 minutes before kickoff (CLAUDE.md -> Predictions). */
const LOCK_WINDOW_MS = 5 * 60 * 1000;

export function isMatchLocked(kickoffTime: Date, now: Date): boolean {
  return now.getTime() >= kickoffTime.getTime() - LOCK_WINDOW_MS;
}

/**
 * Pure fold: left-joins a competition's full player roster onto whichever
 * of them picked this match, so non-pickers still appear (pick fields
 * null) rather than silently disappearing from the reveal.
 */
export function foldCompetitionPicks(
  players: {
    id: string;
    displayName: string;
    emoji: string | null;
    isBot: boolean;
  }[],
  pickRows: {
    playerId: string;
    predHomeScore: number;
    predAwayScore: number;
  }[],
): CompetitionPickRow[] {
  const byPlayer = new Map(pickRows.map((row) => [row.playerId, row]));

  return players.map((player) => {
    const pick = byPlayer.get(player.id);
    return {
      playerId: player.id,
      displayName: player.displayName,
      emoji: player.emoji,
      isBot: player.isBot,
      predHomeScore: pick?.predHomeScore ?? null,
      predAwayScore: pick?.predAwayScore ?? null,
    };
  });
}

/**
 * Post-lock pick reveal, scoped to one competition. Enforces the lock
 * itself rather than trusting the caller -- CLAUDE.md: "All lock/deadline
 * enforcement is server-side, always." A helper whose entire job is
 * "return everyone's picks" cannot leave that one line optional; forgetting
 * it breaches pre-lock pick secrecy, which is unrecoverable once it
 * happens (unlike, say, a season-scoping bug, which is visible and
 * fixable after the fact).
 */
export async function picksForMatch(
  supabase: SupabaseClient,
  matchId: string,
  competitionId: string,
): Promise<PicksForMatchResult> {
  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("kickoff_time")
    .eq("id", matchId)
    .single();
  if (matchError) throw matchError;

  if (!isMatchLocked(new Date(match.kickoff_time), new Date())) {
    return { locked: false };
  }

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id, display_name, emoji, is_bot")
    .eq("competition_id", competitionId);
  if (playersError) throw playersError;

  const playerIds = (players ?? []).map((p) => p.id);
  if (playerIds.length === 0) return { locked: true, picks: [] };

  const { data: pickRows, error: picksError } = await supabase
    .from("picks")
    .select("player_id, pred_home_score, pred_away_score")
    .eq("match_id", matchId)
    .in("player_id", playerIds);
  if (picksError) throw picksError;

  return {
    locked: true,
    picks: foldCompetitionPicks(
      (players ?? []).map((p) => ({
        id: p.id,
        displayName: p.display_name,
        emoji: p.emoji,
        isBot: p.is_bot,
      })),
      (pickRows ?? []).map((r) => ({
        playerId: r.player_id,
        predHomeScore: r.pred_home_score,
        predAwayScore: r.pred_away_score,
      })),
    ),
  };
}

export interface PlayerPickRow {
  matchId: string;
  gameweekNumber: number;
  /** True once picks have locked. A caller must never render a pick, or a
   *  slot's pick cell, while this is false. */
  locked: boolean;
  /** Postponed after lock -- tipped, but never scored, for anyone. */
  calledOff: boolean;
  kickoffTime: string;
  homeTeamId: string;
  awayTeamId: string;
  resultHome: number | null;
  resultAway: number | null;
  predHomeScore: number | null;
  predAwayScore: number | null;
}

/**
 * One player's picks across a season, for the picks record
 * (`docs/adr/0013-match-centre-tense-and-axes.md` D9/D10).
 *
 * THIS IS THE ONE QUERY IN THE APP WHOSE NATURAL FORMULATION LEAKS.
 * "Show me everything Andy picked" reads as
 * `select ... from picks where player_id = $1`, which bypasses the per-match
 * lock check entirely and exposes live, unlocked picks to anyone who opens
 * that player's record -- the exact failure `picksForMatch` was written to
 * make impossible, routed around. Issue #17's done-when ("a second test
 * player cannot see another player's pick pre-lock via any route, including
 * direct API calls") applies to this function verbatim.
 *
 * So it resolves the set of Tipped Matches FIRST, marks each locked or not
 * itself rather than trusting its caller, and blanks the pick on anything
 * unlocked before the row leaves this module. A caller cannot opt out, and a
 * caller that forgets cannot leak: there is nothing to leak in the returned
 * shape.
 *
 * `locked` is carried explicitly rather than inferred from a null result.
 * Those are different facts -- "kicked off, no result yet" and "not locked,
 * nobody may see this" -- and conflating them is precisely how the leak gets
 * reintroduced by someone reading the row shape rather than this comment.
 */
export async function picksForPlayer(
  supabase: SupabaseClient,
  playerId: string,
  competitionId: string,
  seasonId: string,
  now: Date = new Date(),
  /**
   * Who is asking. CLAUDE.md -> Predictions: "Before lock: a player can see
   * THEIR OWN pick; other players' and bots' picks for that match are
   * hidden." Blanking every unlocked pick was over-strict -- on your own
   * record it showed an empty cell for a pick you had already filed.
   *
   * Omit it and nothing unlocked is ever returned, which is the safe
   * default: a caller has to name the viewer to see anything pre-lock, and
   * can only ever name one.
   */
  viewerId?: string,
): Promise<PlayerPickRow[]> {
  // The player must belong to the competition being read. Without this a
  // caller could pair any player id with any competition id.
  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("id")
    .eq("id", playerId)
    .eq("competition_id", competitionId)
    .maybeSingle();
  if (playerError) throw playerError;
  if (!player) return [];

  const { data: gameweeks, error: gameweekError } = await supabase
    .from("gameweeks")
    .select(
      "number, match_1_id, match_2_id, match_1_voided_at, match_2_voided_at",
    )
    .eq("competition_id", competitionId)
    .eq("season_id", seasonId)
    .order("number", { ascending: false });
  if (gameweekError) throw gameweekError;

  const slots = tippedSlots(gameweeks ?? []);
  if (slots.length === 0) return [];

  const { data: matches, error: matchError } = await supabase
    .from("matches")
    .select(
      "id, kickoff_time, team_a_id, team_b_id, team_a_score, team_b_score",
    )
    .in(
      "id",
      slots.map((s) => s.matchId),
    );
  if (matchError) throw matchError;
  const matchById = new Map((matches ?? []).map((m) => [m.id, m]));

  // Picks are read only for matches already resolved above, and only for
  // this one player -- never as a standalone picks-by-player scan.
  const { data: pickRows, error: pickError } = await supabase
    .from("picks")
    .select("match_id, pred_home_score, pred_away_score")
    .eq("player_id", playerId)
    .in(
      "match_id",
      slots.map((s) => s.matchId),
    );
  if (pickError) throw pickError;
  const pickByMatch = new Map((pickRows ?? []).map((r) => [r.match_id, r]));

  return slots.flatMap((slot) => {
    const match = matchById.get(slot.matchId);
    if (!match) return [];
    const locked = isMatchLocked(new Date(match.kickoff_time), now);
    // Own picks are visible pre-lock; anyone else's are not. `ownRecord` is
    // computed from the two ids rather than trusted from a flag, so a caller
    // cannot pass `true` and read a stranger's board.
    const ownRecord = viewerId !== undefined && viewerId === playerId;
    const pick =
      locked || ownRecord ? pickByMatch.get(slot.matchId) : undefined;
    return [
      {
        matchId: slot.matchId,
        gameweekNumber: slot.gameweek,
        locked,
        calledOff: slot.calledOff,
        kickoffTime: match.kickoff_time,
        homeTeamId: match.team_a_id,
        awayTeamId: match.team_b_id,
        resultHome: match.team_a_score,
        resultAway: match.team_b_score,
        predHomeScore: pick?.pred_home_score ?? null,
        predAwayScore: pick?.pred_away_score ?? null,
      },
    ];
  });
}

/**
 * Session-cookie -> competition lookup for authenticated routes (the
 * session holds only a player id). Returns null when the player id
 * doesn't exist -- routine here, not exceptional: sessions are stateless
 * and never expire (CLAUDE.md -> Session), so a signed cookie naming a
 * deleted player, or one minted against a different environment, is an
 * expected shape of input, not a failure. A genuine query error (outage,
 * permissions) still throws -- collapsing that into null too would render
 * a Supabase outage as "every session is invalid."
 *
 * Clearing a dead session cookie on a null result is the caller's job
 * (the future session-auth wrapper), not this resolver's.
 */
export async function resolveCompetitionId(
  supabase: SupabaseClient,
  playerId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("players")
    .select("competition_id")
    .eq("id", playerId)
    .maybeSingle();
  if (error) throw error;
  return data?.competition_id ?? null;
}
