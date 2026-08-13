import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionPlayerId } from "@/app/_lib/session-cookie";
import {
  getDatabaseTime,
  getTablePredictionRecord,
} from "@/app/_lib/table-prediction-access";
import {
  loadLastWeekSummary,
  loadPickBoardGameweek,
  loadSeasonStats,
} from "@/app/_lib/pick-board-access";
import { isMatchLocked, resolveCompetitionId } from "@/lib/competitions/scope";
import { TABLE_PREDICTION_DEADLINE } from "@/lib/table-predictions/rules";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { GameweekHeader } from "@/components/pick-board/GameweekHeader";
import { LastWeekStrip } from "@/components/pick-board/LastWeekStrip";
import { PickBoardSlotCard } from "@/components/pick-board/PickBoardSlotCard";
import { SeasonStatsBlock } from "@/components/pick-board/SeasonStatsBlock";
import { StatsStrip } from "@/components/pick-board/StatsStrip";
import { TablePredictionPrompt } from "@/components/pick-board/TablePredictionPrompt";
import { ScoringSummary } from "@/components/scoring/ScoringSummary";
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
  const competitionId = await resolveCompetitionId(supabase, playerId);
  if (!competitionId) {
    redirect("/login");
  }

  const now = new Date();
  const cookieStore = await cookies();
  const timeZone =
    cookieStore.get(TIMEZONE_COOKIE_NAME)?.value ?? DEFAULT_TIME_ZONE;

  const [gameweek, seasonStats, tablePrediction, databaseTime] =
    await Promise.all([
      loadPickBoardGameweek(supabase, competitionId, playerId, now),
      loadSeasonStats(supabase, competitionId, playerId),
      getTablePredictionRecord(supabase, playerId),
      getDatabaseTime(supabase),
    ]);

  const lastWeek = gameweek
    ? await loadLastWeekSummary(
        supabase,
        competitionId,
        playerId,
        gameweek.number,
      )
    : null;

  // ADR-0007's first-run decision: prompt until submitted/skipped or the
  // fixed Table Prediction deadline. Late joiners can still submit any time
  // after that via the Predict the Table tab -- this banner just stops nagging
  // once the literal deadline in the ADR's own wording has passed.
  const showTablePredictionPrompt =
    tablePrediction?.submittedAt == null &&
    !tablePrediction?.skipped &&
    databaseTime !== null &&
    databaseTime < TABLE_PREDICTION_DEADLINE;

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
      {showTablePredictionPrompt ? <TablePredictionPrompt /> : null}

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
        </>
      ) : (
        <p className="text-sm text-ink/60">
          No Tipped Matches yet -- check back soon.
        </p>
      )}

      <SeasonStatsBlock stats={seasonStats} />
    </main>
  );
}
