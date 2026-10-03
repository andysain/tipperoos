import { cookies } from "next/headers";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { redirect } from "next/navigation";
import { loadActivePlayer } from "@/app/_lib/session-player";
import {
  getCurrentSeasonId,
  resolveCurrentGameweekForCompetition,
} from "@/app/_lib/gameweek-access";
import {
  getDatabaseTime,
  getGameweekOneKickoff,
  getPlayerForTablePrediction,
  getTablePredictionRecord,
  getTablePredictionStripData,
} from "@/app/_lib/table-prediction-access";
import { loadPickBoardGameweek } from "@/app/_lib/pick-board-access";
import { loadLadder, loadRecap } from "@/app/_lib/summary-access";
import { isMatchLocked } from "@/lib/competitions/scope";
import {
  getTablePredictionEditability,
  validateBandCounts,
} from "@/lib/table-predictions/rules";
import { deriveTablePredictionStripState } from "@/lib/table-predictions/strip-state";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { GameweekHeader } from "@/components/pick-board/GameweekHeader";
import { SummarySection } from "@/components/pick-board/SummarySection";
import { PickBoardSlotCard } from "@/components/pick-board/PickBoardSlotCard";
import { TablePredictionStrip } from "@/components/pick-board/TablePredictionStrip";
import { ScoringSummary } from "@/components/scoring/ScoringSummary";
import { T, TX, FOCUS } from "@/components/ui/tokens";
import { EmojiChip } from "@/components/ui/PlayerChip";
import {
  DEFAULT_TIME_ZONE,
  TIMEZONE_COOKIE_NAME,
} from "@/components/nav/timezone-cookie";

// The current gameweek is derived per request (docs/adr/0007), never
// cached -- this route has to be as fresh as the resolver it calls. Also
// what makes reading the `tz` cookie below free: this route was already
// opting out of static rendering for an unrelated reason.
export const dynamic = "force-dynamic";

// `/` is the Pick Board itself, per docs/adr/0007-home-surface-and-pick-entry.md
// ("No hub, no routing step, no redirect"). All reads below go through
// src/app/_lib/pick-board-access.ts, which scopes every picks/scores query
// to this session's player -- see that file's own doc comment for the
// security property this route depends on.
export default async function PickBoardPage() {
  // Forced-reset gate first (issue #36) -- redirects a logged-out or
  // pin_reset_required session before any page work.
  const { playerId } = await loadActivePlayer();

  const supabase = createServerSupabaseClient();
  const player = await getPlayerForTablePrediction(supabase, playerId);
  if (!player) {
    redirect("/login");
  }
  const { competitionId, joinedAt } = player;

  const now = new Date();
  const cookieStore = await cookies();
  const timeZone =
    cookieStore.get(TIMEZONE_COOKIE_NAME)?.value ?? DEFAULT_TIME_ZONE;

  // Resolved once and shared across every loader below instead of each
  // re-deriving it independently -- see
  // docs/standards/PERFORMANCE_TESTING_STANDARD.md §4.1. gameweekNumber
  // depends on seasonId, so this pair stays sequential; everything else that
  // depended on either now runs in the single Promise.all beneath it,
  // including the last-week summary, which previously ran serially after
  // the whole block above resolved.
  //
  // `tablePrediction` runs alongside `seasonId` here rather than inside the
  // wave below (issue #156's decision log): it depends on neither `seasonId`
  // nor `competitionId`, and the Table Prediction Strip's Champion/Band/
  // standings loader needs `tablePrediction.id` as an *input* to a promise
  // in that wave -- which a same-wave peer can't supply. Resolving it one
  // hop earlier keeps the total round-trip count unchanged (still 3 hops)
  // while making that id available in time.
  // `gameweekOneKickoff` is resolved here rather than in the wave below so
  // it can be passed into `getTablePredictionStripData` (a peer in that
  // wave can't supply it) for the Late-Joiner-aware rank -- same "resolve
  // one hop earlier so an id/input is ready in time" move as
  // `tablePrediction` itself. Hop-neutral: this Promise.all already awaited.
  const [seasonId, tablePrediction, gameweekOneKickoff] = await Promise.all([
    getCurrentSeasonId(supabase),
    getTablePredictionRecord(supabase, playerId),
    getGameweekOneKickoff(supabase),
  ]);
  const gameweekNumber = seasonId
    ? await resolveCurrentGameweekForCompetition(
        supabase,
        competitionId,
        now,
        seasonId,
      )
    : null;
  const previousGameweekNumber =
    gameweekNumber !== null ? gameweekNumber - 1 : null;

  const [gameweek, recap, ladder, databaseTime, tablePredictionStripData] =
    await Promise.all([
      seasonId && gameweekNumber !== null
        ? loadPickBoardGameweek(
            supabase,
            competitionId,
            playerId,
            now,
            seasonId,
            gameweekNumber,
          )
        : Promise.resolve(null),
      seasonId && previousGameweekNumber !== null
        ? loadRecap(
            supabase,
            competitionId,
            seasonId,
            playerId,
            previousGameweekNumber,
            now,
            timeZone,
          )
        : Promise.resolve(null),
      seasonId
        ? loadLadder(supabase, competitionId, seasonId, playerId)
        : Promise.resolve([]),
      getDatabaseTime(supabase),
      seasonId && tablePrediction
        ? getTablePredictionStripData(
            supabase,
            tablePrediction.id,
            seasonId,
            playerId,
            competitionId,
            gameweekOneKickoff,
          )
        : Promise.resolve({
            championTeam: null,
            bandCounts: {},
            leaguePosition: null,
            score: null,
            rank: null,
          }),
    ]);

  // Fails closed (hidden) if the DB clock couldn't be read -- same "don't
  // show a stale/unconfirmed state" posture the old prompt took by
  // requiring `databaseTime !== null` before ever rendering.
  const tablePredictionStripState = databaseTime
    ? deriveTablePredictionStripState({
        prediction: tablePrediction,
        editability: getTablePredictionEditability({
          joinedAt,
          now: databaseTime,
          gameweekOneKickoff,
        }),
        championTeam: tablePredictionStripData.championTeam,
        bandCountsOk: validateBandCounts(tablePredictionStripData.bandCounts)
          .ok,
        leaguePosition: tablePredictionStripData.leaguePosition,
        score: tablePredictionStripData.score,
        rank: tablePredictionStripData.rank,
      })
    : ({ kind: "hidden" } as const);

  // Slots still taking picks, and how many of those already hold one --
  // drives the header's "you're set" line, the board's finished state.
  const openMatchSlots = (gameweek?.slots ?? []).filter(
    (slot) =>
      slot.kind === "match" &&
      !slot.voided &&
      !isMatchLocked(new Date(slot.match.kickoffUtcIso), now),
  );
  const openSlots = openMatchSlots.length;
  const filedOpenSlots = openMatchSlots.filter(
    (slot) => slot.kind === "match" && slot.ownPick !== null,
  ).length;

  return (
    // md:max-w-4xl mx-auto matches predict-table's mobile/desktop pivot
    // (PredictTableFlow.tsx) -- one column on phone, room for two slot
    // cards side by side once there's a tablet/desktop-width viewport.
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 bg-paper p-4">
      {/* Names whose board this is. On a shared family phone the board
          never said, so a parent filing straight after a child had no way
          to confirm the switch worked before tapping digits. It replaces
          a "Pick Board" title that only restated the active tab. */}
      <h1 className="flex min-w-0 items-center gap-2">
        <EmojiChip emoji={player.emoji} />
        <span className={`min-w-0 truncate ${T.h2} font-extrabold text-text`}>
          {player.displayName}&apos;s picks
        </span>
      </h1>

      {/* The summary sits above the picks (ADR 0013 D15). To keep the
          entry controls as high as that allows, the scoring explainer now
          sits below the slots instead of between the header and the
          first card. */}
      <SummarySection recap={recap} ladder={ladder} />
      <TablePredictionStrip state={tablePredictionStripState} />

      {gameweek ? (
        <>
          <GameweekHeader
            gameweekNumber={gameweek.number}
            earliestOpenKickoffUtcIso={gameweek.earliestOpenKickoffUtcIso}
            timeZone={timeZone}
            filedOpenSlots={filedOpenSlots}
            openSlots={openSlots}
          />
          <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:items-start md:gap-4">
            {gameweek.slots.map((slot, index) => (
              <PickBoardSlotCard
                // Keyed by match, not position, so a card's local state can
                // never carry over to a different fixture.
                key={slot.kind === "match" ? slot.match.id : `skipped-${index}`}
                slot={slot}
                locked={
                  slot.kind === "match"
                    ? isMatchLocked(new Date(slot.match.kickoffUtcIso), now)
                    : false
                }
                nowIso={now.toISOString()}
                timeZone={timeZone}
              />
            ))}
          </div>

          {/* Once a match locks there is a room to look at, and until then
              there deliberately isn't (ADR 0013 D3/D6). */}
          {gameweek.slots.some(
            (slot) =>
              slot.kind === "match" &&
              isMatchLocked(new Date(slot.match.kickoffUtcIso), now),
          ) ? (
            <Link
              href={`/gameweek/${String(gameweek.number)}`}
              className={`flex min-h-11 items-center justify-between rounded-btn bg-ink px-3.5 text-on-ink ${FOCUS}`}
            >
              <span className={`${T.caption} font-bold`}>
                See everyone&apos;s picks
              </span>
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          ) : null}

          <ScoringSummary kind="matches" />
        </>
      ) : (
        <p className={`${T.caption} ${TX.muted}`}>
          No matches to pick yet. The next two land a few days before the
          gameweek starts.
        </p>
      )}
    </main>
  );
}
