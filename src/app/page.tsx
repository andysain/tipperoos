import { cookies } from "next/headers";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { redirect } from "next/navigation";
import { getSessionPlayerId } from "@/app/_lib/session-cookie";
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
import {
  loadLastWeekSummary,
  loadPickBoardGameweek,
  loadSeasonStats,
} from "@/app/_lib/pick-board-access";
import { isMatchLocked } from "@/lib/competitions/scope";
import {
  getTablePredictionEditability,
  validateBandCounts,
} from "@/lib/table-predictions/rules";
import { deriveTablePredictionStripState } from "@/lib/table-predictions/strip-state";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { GameweekHeader } from "@/components/pick-board/GameweekHeader";
import { LastWeekStrip } from "@/components/pick-board/LastWeekStrip";
import { PickBoardSlotCard } from "@/components/pick-board/PickBoardSlotCard";
import { SeasonStatsBlock } from "@/components/pick-board/SeasonStatsBlock";
import { StatsStrip } from "@/components/pick-board/StatsStrip";
import { TablePredictionStrip } from "@/components/pick-board/TablePredictionStrip";
import { ScoringSummary } from "@/components/scoring/ScoringSummary";
import { T, TX, FOCUS } from "@/components/ui/tokens";
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
  const playerId = await getSessionPlayerId();
  if (!playerId) {
    redirect("/login");
  }

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
  const [seasonId, tablePrediction] = await Promise.all([
    getCurrentSeasonId(supabase),
    getTablePredictionRecord(supabase, playerId),
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

  const [
    gameweek,
    seasonStats,
    lastWeek,
    databaseTime,
    gameweekOneKickoff,
    tablePredictionStripData,
  ] = await Promise.all([
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
    seasonId
      ? loadSeasonStats(supabase, competitionId, playerId, seasonId)
      : Promise.resolve(null),
    seasonId && previousGameweekNumber !== null
      ? loadLastWeekSummary(
          supabase,
          competitionId,
          playerId,
          seasonId,
          previousGameweekNumber,
        )
      : Promise.resolve(null),
    getDatabaseTime(supabase),
    getGameweekOneKickoff(supabase),
    seasonId && tablePrediction
      ? getTablePredictionStripData(supabase, tablePrediction.id, seasonId)
      : Promise.resolve({
          championTeam: null,
          bandCounts: {},
          leaguePosition: null,
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
      })
    : ({ kind: "hidden" } as const);

  return (
    // SwitchPlayerButton (fixed top-3 right-3, size-10) floats above content
    // as it scrolls -- no reserved gutter (ADR-0005: the shell owns chrome,
    // pages own content; the button's bg-paper + shadow make the overlay
    // read as intentional rather than a rendering glitch).
    // md:max-w-4xl mx-auto matches predict-table's mobile/desktop pivot
    // (PredictTableFlow.tsx) -- one column on phone, room for two slot
    // cards side by side once there's a tablet/desktop-width viewport.
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 bg-paper p-4">
      <h1 className="text-[1.9rem] font-extrabold text-ink">Pick Board</h1>
      <StatsStrip stats={seasonStats} />
      <LastWeekStrip summary={lastWeek} />
      <TablePredictionStrip state={tablePredictionStripState} />

      {gameweek ? (
        <>
          <GameweekHeader
            gameweekNumber={gameweek.number}
            earliestOpenKickoffUtcIso={gameweek.earliestOpenKickoffUtcIso}
            timeZone={timeZone}
          />
          <ScoringSummary kind="matches" />
          <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:items-start md:gap-4">
            {gameweek.slots.map((slot, index) => (
              <PickBoardSlotCard
                key={index}
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

          {/* The link the Pick Board has been holding a comment for since
              #90: once a match locks there is a room to look at, and until
              then there deliberately isn't (ADR 0013 D3/D6). */}
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
        </>
      ) : (
        <p className={`${T.caption} ${TX.muted}`}>
          No Tipped Matches yet -- check back soon.
        </p>
      )}

      <SeasonStatsBlock stats={seasonStats} />
    </main>
  );
}
