import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMatchLocked } from "@/lib/competitions/scope";
import { isMatchVoided } from "@/lib/matches/voided";
import { botPickFor, type BotType, type HumanPick, type Rng } from "./predict";

/**
 * Production wiring for the three bot types (issue #35). Called from
 * `sync/matches`'s route handler on the existing 30-minute cadence, so bots
 * need no schedule of their own.
 *
 * Deliberately NOT gated on "a match just completed" the way #166's scoring
 * orchestrator is: Random and 1-1 picks have to appear while their match is
 * still days away, on cycles where nothing has finished.
 *
 * D4: the loop key is (competition, slot), never slot alone. `matches` is
 * global but `gameweeks` is competition-scoped, so every bot, every human
 * pick, and every write is resolved through the gameweek's own
 * `competition_id` — the `match_id`-without-`competition_id` leak
 * docs/adr/0004 warns about is exactly what a slot-keyed loop would be.
 *
 * D5: write-once. Nothing here ever rewrites an existing bot pick — a
 * re-rolling Random Bot would show players a different pick each time they
 * looked. This is the deliberate divergence from `writeScores`/
 * `writeStandingsSnapshot`, which upsert because they are derived and must
 * track corrections; a pick is a submission and must not.
 */

interface GameweekRow {
  competition_id: string;
  match_1_id: string | null;
  match_2_id: string | null;
  match_1_voided_at: string | null;
  match_2_voided_at: string | null;
}

interface MatchRow {
  id: string;
  kickoff_time: string;
  status: string;
}

interface PlayerRow {
  id: string;
  competition_id: string;
  is_bot: boolean;
  bot_type: BotType | null;
}

interface PickRow {
  player_id: string;
  match_id: string;
  pred_home_score: number;
  pred_away_score: number;
}

/** One tipped match, resolved against the competition that tipped it. */
interface CandidateSlot {
  competitionId: string;
  matchId: string;
  locked: boolean;
}

export interface GenerateBotPicksOptions {
  /** Injected for tests; server time otherwise, same as `picksForMatch`. */
  now?: Date;
  /** Injected for tests; `Math.random` otherwise. */
  rng?: Rng;
}

export async function generateBotPicks(
  supabase: SupabaseClient,
  options: GenerateBotPicksOptions = {},
): Promise<number> {
  const now = options.now ?? new Date();

  const gameweeks = await loadGameweeks(supabase);
  if (gameweeks.length === 0) return 0;

  const referencedMatchIds = dedupe(
    gameweeks
      .flatMap((gw) => [gw.match_1_id, gw.match_2_id])
      .filter((id): id is string => id !== null),
  );
  if (referencedMatchIds.length === 0) return 0;

  const matchById = await loadMatches(supabase, referencedMatchIds);
  const slots = buildCandidateSlots(gameweeks, matchById, now);
  if (slots.length === 0) return 0;

  const competitionIds = dedupe(slots.map((s) => s.competitionId));
  const players = await loadPlayers(supabase, competitionIds);

  const botsByCompetition = groupBy(
    players.filter((p) => p.is_bot && p.bot_type !== null),
    (p) => p.competition_id,
  );
  const botIds = players.filter((p) => p.is_bot).map((p) => p.id);
  if (botIds.length === 0) return 0;

  const slotMatchIds = dedupe(slots.map((s) => s.matchId));
  const alreadyPicked = await loadExistingBotPicks(
    supabase,
    botIds,
    slotMatchIds,
  );

  // Only the locked slots that still owe a Median pick need human picks
  // loading -- without this the query would grow with every past gameweek.
  const medianMatchIds = dedupe(
    slots
      .filter((slot) => slot.locked)
      .filter((slot) =>
        (botsByCompetition.get(slot.competitionId) ?? []).some(
          (bot) =>
            bot.bot_type === "median" &&
            !alreadyPicked.has(pickKey(bot.id, slot.matchId)),
        ),
      )
      .map((slot) => slot.matchId),
  );

  const humanPicksByCompetitionAndMatch = await loadHumanPicks(
    supabase,
    players,
    medianMatchIds,
  );

  const rows: PickRow[] = [];
  for (const slot of slots) {
    for (const bot of botsByCompetition.get(slot.competitionId) ?? []) {
      if (alreadyPicked.has(pickKey(bot.id, slot.matchId))) continue;
      // Random and 1-1 file before lock; Median only after it (CLAUDE.md ->
      // Predictions). A bot acquiring a random pick after kickoff would be
      // indefensible on the post-lock reveal even though it carries no
      // hindsight; a Median before lock would be a blind guess, not the
      // crowd's consensus.
      const isMedian = bot.bot_type === "median";
      if (isMedian !== slot.locked) continue;

      const pick = botPickFor(bot.bot_type as BotType, {
        humanPicks:
          humanPicksByCompetitionAndMatch.get(
            competitionMatchKey(slot.competitionId, slot.matchId),
          ) ?? [],
        rng: options.rng,
      });

      rows.push({
        player_id: bot.id,
        match_id: slot.matchId,
        pred_home_score: pick.homeScore,
        pred_away_score: pick.awayScore,
      });
    }
  }

  if (rows.length === 0) return 0;

  const { error } = await supabase.from("picks").upsert(rows, {
    onConflict: "player_id,match_id",
    // Not an overwrite: an existing bot pick wins over this computation.
    ignoreDuplicates: true,
  });
  if (error) throw error;

  return rows.length;
}

async function loadGameweeks(supabase: SupabaseClient): Promise<GameweekRow[]> {
  const { data, error } = await supabase
    .from("gameweeks")
    .select(
      "competition_id, match_1_id, match_2_id, match_1_voided_at, match_2_voided_at",
    )
    .order("number");
  if (error) throw error;
  return (data ?? []) as GameweekRow[];
}

async function loadMatches(
  supabase: SupabaseClient,
  matchIds: string[],
): Promise<Map<string, MatchRow>> {
  const { data, error } = await supabase
    .from("matches")
    .select("id, kickoff_time, status")
    .in("id", matchIds);
  if (error) throw error;
  return new Map(((data ?? []) as MatchRow[]).map((m) => [m.id, m]));
}

async function loadPlayers(
  supabase: SupabaseClient,
  competitionIds: string[],
): Promise<PlayerRow[]> {
  const { data, error } = await supabase
    .from("players")
    .select("id, competition_id, is_bot, bot_type")
    .in("competition_id", competitionIds);
  if (error) throw error;
  return (data ?? []) as PlayerRow[];
}

async function loadExistingBotPicks(
  supabase: SupabaseClient,
  botIds: string[],
  matchIds: string[],
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("picks")
    .select("player_id, match_id")
    .in("player_id", botIds)
    .in("match_id", matchIds);
  if (error) throw error;
  return new Set(
    ((data ?? []) as PickRow[]).map((p) => pickKey(p.player_id, p.match_id)),
  );
}

/**
 * Human picks for the Median Bot, keyed by competition AND match. Scoped by
 * player id rather than by `match_id` alone: two competitions can tip the
 * same fixture, and blending their crowds is the ADR 0004 leak (ADR 0009
 * states the Median Bot "must derive from its own competition's human picks
 * only").
 */
async function loadHumanPicks(
  supabase: SupabaseClient,
  players: PlayerRow[],
  matchIds: string[],
): Promise<Map<string, HumanPick[]>> {
  const byKey = new Map<string, HumanPick[]>();
  if (matchIds.length === 0) return byKey;

  const humans = players.filter((p) => !p.is_bot);
  if (humans.length === 0) return byKey;

  const competitionByPlayerId = new Map(
    humans.map((p) => [p.id, p.competition_id]),
  );

  const { data, error } = await supabase
    .from("picks")
    .select("player_id, match_id, pred_home_score, pred_away_score")
    .in(
      "player_id",
      humans.map((p) => p.id),
    )
    .in("match_id", matchIds);
  if (error) throw error;

  for (const pick of (data ?? []) as PickRow[]) {
    const competitionId = competitionByPlayerId.get(pick.player_id);
    if (!competitionId) continue;
    const key = competitionMatchKey(competitionId, pick.match_id);
    const bucket = byKey.get(key) ?? [];
    bucket.push({
      homeScore: pick.pred_home_score,
      awayScore: pick.pred_away_score,
    });
    byKey.set(key, bucket);
  }

  return byKey;
}

function buildCandidateSlots(
  gameweeks: GameweekRow[],
  matchById: Map<string, MatchRow>,
  now: Date,
): CandidateSlot[] {
  const slots: CandidateSlot[] = [];

  for (const gameweek of gameweeks) {
    const pairs: { matchId: string | null; voidedAt: string | null }[] = [
      { matchId: gameweek.match_1_id, voidedAt: gameweek.match_1_voided_at },
      { matchId: gameweek.match_2_id, voidedAt: gameweek.match_2_voided_at },
    ];

    for (const { matchId, voidedAt } of pairs) {
      // A Skipped Slot (fixture postponed before lock, ADR 0001) was never
      // tipped at all.
      if (matchId === null) continue;
      const match = matchById.get(matchId);
      if (!match) continue;
      // A Voided Match scores nothing either way (CLAUDE.md -> Predictions),
      // so a pick on it is pure noise on the reveal. `isMatchVoided` also
      // treats a `postponed` status as voided in its own right, closing the
      // window before `voided_at` has been written.
      if (isMatchVoided([{ voidedAt }], match.status)) continue;

      slots.push({
        competitionId: gameweek.competition_id,
        matchId,
        locked: isMatchLocked(new Date(match.kickoff_time), now),
      });
    }
  }

  return slots;
}

function pickKey(playerId: string, matchId: string): string {
  return `${playerId}:${matchId}`;
}

function competitionMatchKey(competitionId: string, matchId: string): string {
  return `${competitionId}:${matchId}`;
}

function dedupe<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const bucket = grouped.get(key(item)) ?? [];
    bucket.push(item);
    grouped.set(key(item), bucket);
  }
  return grouped;
}
