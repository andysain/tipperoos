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
    recap,
    ladder,
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
    getGameweekOneKickoff(supabase),
    seasonId && tablePrediction
      ? getTablePredictionStripData(
          supabase,
          tablePrediction.id,
          seasonId,
          playerId,
        )
      : Promise.resolve({
          championTeam: null,
          bandCounts: {},
          leaguePosition: null,
          score: null,
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
      })
    : ({ kind: "hidden" } as const);

  return (
    // md:max-w-4xl mx-auto matches predict-table's mobile/desktop pivot
    // (PredictTableFlow.tsx) -- one column on phone, room for two slot
    // cards side by side once there's a tablet/desktop-width viewport.
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 bg-paper p-4">
      {/* Home carries a title like every other surface, for consistency
          across four surfaces. Help/Switch Player used to live as fixed
          top-right chrome with no reserved gutter, which this h1 partially
          mitigated by giving them something to sit beside above the fold
          (issue #185) -- they've since moved into the bottom tab bar's
          "More" menu (ADR-0005 amendment), so this h1 is now just the
          page's title, nothing more. */}
      <h1 className={`${T.h1} font-extrabold text-text`}>Pick Board</h1>

      {/* The summary sits above the picks. Recorded honestly: a review
          measured that this pushes the second match card's entry controls
          toward the fold on a pre-lock phone visit, against ADR 0007's
          cost-of-missing logic. It is a deliberate call made with the
          alternative on screen (ADR 0013 D15), helped by home no longer
          carrying an H1 that restated the tab the player is standing on. */}
      <SummarySection recap={recap} ladder={ladder} />
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
    </main>
  );
}
