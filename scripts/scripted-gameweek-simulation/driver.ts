// The driver seam for issue #22 (Scripted gameweek-simulation test) — D2.
//
// #34 (full end-to-end dry run) reuses this script, driving the same steps
// against the real API routes instead of lib calls. That swap is why every
// step of the gameweek cycle is funneled through the injectable
// `GameweekSimulationDriver` interface below: this repo ships `LibGameweekSimulationDriver`
// (lib + direct DB rows), and #34 implements the same interface against routes,
// so the scenario reads unchanged.

import type { SupabaseClient } from "@supabase/supabase-js";
import { recomputeMatchScores, type ScoreRow } from "@/lib/scoring/match";
import { writeScores } from "@/lib/scoring/write-scores";
import { isMatchVoided } from "@/lib/matches/voided";

// isMatchVoided/MatchSlotVoidSignal moved to src/lib/matches/voided.ts
// (issue #166) once the sync-scoring orchestrator became a second production
// consumer.
export { isMatchVoided, type MatchSlotVoidSignal } from "@/lib/matches/voided";

export interface PickInput {
  playerId: string;
  matchId: string;
  predHomeScore: number;
  predAwayScore: number;
}

export interface MatchScoreRow {
  playerId: string;
  points: number;
}

/** One method per step of the gameweek cycle (pick -> lock -> result -> score). */
export interface GameweekSimulationDriver {
  pick(input: PickInput): Promise<void>;
  lock(matchId: string): Promise<void>;
  setResult(
    matchId: string,
    homeScore: number,
    awayScore: number,
  ): Promise<void>;
  score(matchId: string): Promise<void>;
  readScores(matchId: string): Promise<MatchScoreRow[]>;
}

/**
 * Lib-level driver: `pick` writes a `picks` row directly (the picks write-path
 * is route-level in this app — there is no lib pick-writer), `setResult`
 * writes the match's authoritative result, and `score` recomputes from the
 * match's current state through the real engine (`recomputeMatchScores` +
 * `writeScores`) — never accumulating, always replacing.
 */
export class LibGameweekSimulationDriver implements GameweekSimulationDriver {
  constructor(private readonly supabase: SupabaseClient) {}

  async pick(input: PickInput): Promise<void> {
    const { error } = await this.supabase.from("picks").upsert(
      {
        player_id: input.playerId,
        match_id: input.matchId,
        pred_home_score: input.predHomeScore,
        pred_away_score: input.predAwayScore,
      },
      { onConflict: "player_id,match_id" },
    );
    if (error) throw error;
  }

  async lock(_matchId: string): Promise<void> {
    // Lock enforcement is server-side route logic (CLAUDE.md: picks lock 5
    // minutes before scheduled kickoff; #16 landed as a route lock) — there
    // is nothing to enforce at the lib level (D3). The method exists so the
    // seam stays 1:1 with the cycle and #34's real lock drops in unchanged.
  }

  async setResult(
    matchId: string,
    homeScore: number,
    awayScore: number,
  ): Promise<void> {
    const { error } = await this.supabase
      .from("matches")
      .update({
        team_a_score: homeScore,
        team_b_score: awayScore,
        status: "completed",
        result_updated_at: new Date().toISOString(),
      })
      .eq("id", matchId);
    if (error) throw error;
  }

  async score(matchId: string): Promise<void> {
    const { data: match, error: matchError } = await this.supabase
      .from("matches")
      .select("team_a_score, team_b_score, status")
      .eq("id", matchId)
      .single();
    if (matchError) throw matchError;

    // A match can be tipped by several competitions' gameweeks; the voided
    // signal is per-slot, so gather every slot referencing this match.
    const { data: slots, error: slotsError } = await this.supabase
      .from("gameweeks")
      .select("match_1_id, match_2_id, match_1_voided_at, match_2_voided_at")
      .or(`match_1_id.eq.${matchId},match_2_id.eq.${matchId}`);
    if (slotsError) throw slotsError;

    const slotSignals = (slots ?? []).map((row) => ({
      voidedAt:
        row.match_1_id === matchId
          ? row.match_1_voided_at
          : row.match_2_voided_at,
    }));

    const { data: pickRows, error: picksError } = await this.supabase
      .from("picks")
      .select("player_id, pred_home_score, pred_away_score")
      .eq("match_id", matchId)
      .order("player_id");
    if (picksError) throw picksError;

    const rows: ScoreRow[] = recomputeMatchScores({
      matchId,
      result:
        match.team_a_score !== null && match.team_b_score !== null
          ? { home: match.team_a_score, away: match.team_b_score }
          : null,
      voided: isMatchVoided(slotSignals, match.status),
      picks: (pickRows ?? []).map((p) => ({
        playerId: p.player_id,
        pickHome: p.pred_home_score,
        pickAway: p.pred_away_score,
      })),
    });

    await writeScores(this.supabase, rows);
  }

  async readScores(matchId: string): Promise<MatchScoreRow[]> {
    const { data, error } = await this.supabase
      .from("scores")
      .select("player_id, points")
      .eq("match_id", matchId)
      .order("player_id");
    if (error) throw error;
    return (data ?? []).map((r) => ({
      playerId: r.player_id,
      points: r.points,
    }));
  }
}
