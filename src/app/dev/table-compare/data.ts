import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  scorePredictTableCohort,
  type CohortEntry,
  type PredictTableScoreResult,
} from "@/lib/scoring/predict-table";
import {
  BAND_KEYS,
  isBandKey,
  isLateJoiner,
} from "@/lib/table-predictions/rules";

// PROTOTYPE -- issue #214. A page-local copy of the read half of
// `recomputePredictTableCohort` (src/lib/table-predictions/recompute-cohort.ts),
// with the same cohort filters: non-bot players in this competition,
// submitted and not skipped, Late Joiners outside the Bold Call cohort.
// Deliberately NOT a change to src/lib (issue P2) and deliberately serial
// and slow -- the production phase restructures this as one embedded-select
// read (issue D1).

export interface ProtoPlayer {
  id: string;
  displayName: string;
  emoji: string | null;
  isLateJoiner: boolean;
  /** Has a submitted, non-skipped table -- the only tables D2 lets anyone see. */
  hasTable: boolean;
  status: "submitted" | "skipped" | "unsubmitted" | "none";
  storedTotal: number | null;
}

export interface ProtoTeam {
  id: string;
  name: string;
  shortCode: string | null;
}

export interface ProtoData {
  players: ProtoPlayer[];
  teams: ProtoTeam[];
  /** Actual 1-20 order (index 0 = 1st). Empty when no complete standings. */
  actualOrder: string[];
  standingsUpdatedAt: string | null;
  standingsStale: boolean;
  standingsPlayed: { min: number; max: number } | null;
  /** player id -> team id -> predicted Band index (0-7). */
  bandsByPlayer: Map<string, Map<string, number>>;
  /** Read-time scores; empty when standings are incomplete. */
  scores: Map<string, PredictTableScoreResult>;
  eligibleCohortSize: number;
}

// Mirrors LIVE_STANDINGS_STALE_MS in src/lib/gameweeks/select-next.ts
// (not exported, and server-only). Prototype-local copy, flagged so the
// production phase imports one source instead.
const STANDINGS_STALE_MS = 48 * 60 * 60 * 1000;

const bandIndexByKey = new Map(BAND_KEYS.map((key, index) => [key, index]));

export async function loadProtoData(
  supabase: SupabaseClient,
  competitionId: string,
): Promise<ProtoData> {
  const { data: season, error: seasonError } = await supabase
    .from("seasons")
    .select("id")
    .eq("is_current", true)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (seasonError) throw seasonError;
  const seasonId: string | null = season?.id ?? null;

  const [standingsRes, kickoffRes, playersRes, teamsRes] = await Promise.all([
    seasonId
      ? supabase
          .from("team_standings")
          .select("team_id, position, played, updated_at")
          .eq("season_id", seasonId)
          .order("position", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    seasonId
      ? supabase
          .from("matches")
          .select("kickoff_time")
          .eq("season_id", seasonId)
          .order("kickoff_time", { ascending: true })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("players")
      .select("id, display_name, emoji, joined_at")
      .eq("competition_id", competitionId)
      .eq("is_bot", false)
      .order("display_name"),
    supabase.from("teams").select("id, name, short_code").eq("active", true),
  ]);
  if (standingsRes.error) throw standingsRes.error;
  if (kickoffRes.error) throw kickoffRes.error;
  if (playersRes.error) throw playersRes.error;
  if (teamsRes.error) throw teamsRes.error;

  const standings = (standingsRes.data ?? []) as {
    team_id: string;
    position: number;
    played: number;
    updated_at: string;
  }[];
  const gameweekOneKickoff = kickoffRes.data?.kickoff_time
    ? new Date(kickoffRes.data.kickoff_time as string)
    : null;
  const playerRows = (playersRes.data ?? []) as {
    id: string;
    display_name: string;
    emoji: string | null;
    joined_at: string;
  }[];
  const playerIds = playerRows.map((p) => p.id);

  const [predictionsRes, storedRes] = await Promise.all([
    supabase
      .from("table_predictions")
      .select("id, player_id, submitted_at, is_skipped")
      .in("player_id", playerIds),
    supabase
      .from("table_prediction_scores")
      .select("player_id, total_score")
      .in("player_id", playerIds),
  ]);
  if (predictionsRes.error) throw predictionsRes.error;
  if (storedRes.error) throw storedRes.error;

  const predictions = (predictionsRes.data ?? []) as {
    id: string;
    player_id: string;
    submitted_at: string | null;
    is_skipped: boolean;
  }[];
  const storedByPlayer = new Map(
    (
      (storedRes.data ?? []) as { player_id: string; total_score: number }[]
    ).map((row) => [row.player_id, row.total_score]),
  );
  const predictionByPlayer = new Map(predictions.map((p) => [p.player_id, p]));
  const submitted = predictions.filter(
    (p) => p.submitted_at !== null && !p.is_skipped,
  );

  const { data: rankRows, error: ranksError } =
    submitted.length > 0
      ? await supabase
          .from("table_prediction_ranks")
          .select("table_prediction_id, team_id, band")
          .in(
            "table_prediction_id",
            submitted.map((p) => p.id),
          )
      : { data: [], error: null };
  if (ranksError) throw ranksError;

  const playerByPrediction = new Map(submitted.map((p) => [p.id, p.player_id]));
  const bandsByPlayer = new Map<string, Map<string, number>>();
  for (const p of submitted) bandsByPlayer.set(p.player_id, new Map());
  for (const rank of (rankRows ?? []) as {
    table_prediction_id: string;
    team_id: string;
    band: string;
  }[]) {
    const playerId = playerByPrediction.get(rank.table_prediction_id);
    if (!playerId || !isBandKey(rank.band)) continue;
    const index = bandIndexByKey.get(rank.band);
    if (index === undefined) continue;
    bandsByPlayer.get(playerId)?.set(rank.team_id, index);
  }

  const lateById = new Map(
    playerRows.map((p) => [
      p.id,
      isLateJoiner(new Date(p.joined_at), gameweekOneKickoff),
    ]),
  );

  const actualOrder =
    standings.length === 20 ? standings.map((s) => s.team_id) : [];
  const entries: CohortEntry<string>[] = [...bandsByPlayer.entries()].map(
    ([key, bands]) => ({
      key,
      bands,
      boldCallEligible: !(lateById.get(key) ?? false),
    }),
  );
  const scores =
    actualOrder.length === 20
      ? scorePredictTableCohort(entries, actualOrder)
      : new Map<string, PredictTableScoreResult>();

  const players: ProtoPlayer[] = playerRows.map((p) => {
    const prediction = predictionByPlayer.get(p.id);
    const status: ProtoPlayer["status"] = !prediction
      ? "none"
      : prediction.is_skipped
        ? "skipped"
        : prediction.submitted_at === null
          ? "unsubmitted"
          : "submitted";
    return {
      id: p.id,
      displayName: p.display_name,
      emoji: p.emoji,
      isLateJoiner: lateById.get(p.id) ?? false,
      hasTable: status === "submitted",
      status,
      storedTotal: storedByPlayer.get(p.id) ?? null,
    };
  });

  const played = standings.map((s) => s.played);
  const standingsUpdatedAt =
    standings.length > 0
      ? standings.reduce(
          (latest, s) => (s.updated_at > latest ? s.updated_at : latest),
          standings[0].updated_at,
        )
      : null;
  return {
    players,
    teams: (
      (teamsRes.data ?? []) as {
        id: string;
        name: string;
        short_code: string | null;
      }[]
    ).map((t) => ({ id: t.id, name: t.name, shortCode: t.short_code })),
    actualOrder,
    standingsUpdatedAt,
    standingsStale:
      standingsUpdatedAt !== null &&
      Date.now() - new Date(standingsUpdatedAt).getTime() > STANDINGS_STALE_MS,
    standingsPlayed:
      played.length > 0
        ? { min: Math.min(...played), max: Math.max(...played) }
        : null,
    bandsByPlayer,
    scores,
    eligibleCohortSize: entries.filter((e) => e.boldCallEligible).length,
  };
}
