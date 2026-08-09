import { redirect } from "next/navigation";
import { getSessionPlayerId } from "@/app/_lib/session-cookie";
import {
  getGameweekOneKickoff,
  getTablePredictionRecord,
} from "@/app/_lib/table-prediction-access";
import {
  loadLastWeekSummary,
  loadPickBoardGameweek,
  loadSeasonStats,
} from "@/app/_lib/pick-board-access";
import { isMatchLocked, resolveCompetitionId } from "@/lib/competitions/scope";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { GameweekHeader } from "@/components/pick-board/GameweekHeader";
import { LastWeekStrip } from "@/components/pick-board/LastWeekStrip";
import { PickBoardSlotCard } from "@/components/pick-board/PickBoardSlotCard";
import { SeasonStatsBlock } from "@/components/pick-board/SeasonStatsBlock";
import { StatsStrip } from "@/components/pick-board/StatsStrip";
import { TablePredictionPrompt } from "@/components/pick-board/TablePredictionPrompt";

// Hardcoded pending issue #93 (resolve from the viewer's browser) -- same
// value src/app/login/page.tsx already uses.
const TIME_ZONE = "Australia/Sydney";

// The current gameweek is derived per request (docs/adr/0007), never
// cached -- this route has to be as fresh as the resolver it calls.
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

  const [gameweek, seasonStats, tablePrediction, gameweekOneKickoff] =
    await Promise.all([
      loadPickBoardGameweek(supabase, competitionId, playerId, now),
      loadSeasonStats(supabase, competitionId, playerId),
      getTablePredictionRecord(supabase, playerId),
      getGameweekOneKickoff(supabase),
    ]);

  const lastWeek = gameweek
    ? await loadLastWeekSummary(
        supabase,
        competitionId,
        playerId,
        gameweek.number,
      )
    : null;

  // ADR-0007's first-run decision: prompt until submitted/skipped or
  // Gameweek 1 kicks off. Late joiners can still submit any time after
  // that via the Predict the Table tab -- this banner just stops nagging
  // once the literal deadline in the ADR's own wording has passed.
  const showTablePredictionPrompt =
    tablePrediction?.submittedAt == null &&
    !tablePrediction?.skipped &&
    (!gameweekOneKickoff || now < gameweekOneKickoff);

  return (
    // pr-14 clears SwitchPlayerButton (fixed top-3 right-3, size-10) -- it's
    // fixed-positioned so it reserves no space on its own, and without this
    // GameweekHeader's right-aligned "Locks from…" text renders underneath it.
    <main className="flex flex-col gap-4 bg-paper p-4 pr-14">
      <StatsStrip stats={seasonStats} />
      <LastWeekStrip summary={lastWeek} />
      {showTablePredictionPrompt ? <TablePredictionPrompt /> : null}

      {gameweek ? (
        <>
          <GameweekHeader
            gameweekNumber={gameweek.number}
            earliestOpenKickoffUtcIso={gameweek.earliestOpenKickoffUtcIso}
            timeZone={TIME_ZONE}
          />
          <div className="flex flex-col gap-3">
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
                timeZone={TIME_ZONE}
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
