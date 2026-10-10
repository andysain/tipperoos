import { cookies } from "next/headers";
import type { Route } from "next";
import { loadActivePlayer } from "@/app/_lib/session-player";
import {
  getDatabaseTime,
  getPlayerForTablePrediction,
  getTablePredictionRecord,
} from "@/app/_lib/table-prediction-access";
import { decidePredictTableView } from "@/app/_lib/predict-table-view";
import { staleStandingsNote } from "@/app/_lib/standings-note";
import {
  BAND_KEYS,
  type BandKey,
  TABLE_PREDICTION_DEADLINE,
  getTablePredictionEditability,
} from "@/lib/table-predictions/rules";
import { loadScoredCohort } from "@/lib/table-predictions/cohort";
import {
  buildTableSingle,
  isSeasonOver,
} from "@/lib/table-predictions/compare";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  DEFAULT_TIME_ZONE,
  TIMEZONE_COOKIE_NAME,
} from "@/components/nav/timezone-cookie";
import { T, TX } from "@/components/ui/tokens";
import { PredictTableFlow } from "./PredictTableFlow";
import { BandSummary } from "./BandSummary";
import { EditTableLink, TableSingle } from "./TableSingle";
import type { Team } from "./shared";

// Reads the session + DB fresh on every request -- this is a personalized,
// lock-time-sensitive page, not something that can be statically cached.
export const dynamic = "force-dynamic";

// The deadline is the END of its day in Australia/Sydney (rules.ts), so the
// instant itself reads as the next morning; the moment before it names the
// day players know ("31 August"). Derived, never typed.
const DEADLINE_DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  timeZone: "Australia/Sydney",
}).format(new Date(TABLE_PREDICTION_DEADLINE.getTime() - 1));

export default async function PredictTablePage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  // Forced-reset gate first (issue #36).
  const { playerId, competitionId } = await loadActivePlayer();
  const { edit } = await searchParams;

  const supabase = createServerSupabaseClient();

  // One wave: none of these reads depends on another's result. The scored
  // cohort (issue #226 S8) carries Gameweek 1's kickoff, so it replaces the
  // separate two-deep kickoff lookup, and it carries a member's own Bands,
  // so the single view needs no ranks read of its own. Serial depth: the
  // session (1), this wave (2), and -- for the capture board only -- the
  // ranks tail (3). See docs/standards/PERFORMANCE_TESTING_STANDARD.md §7.
  const [
    player,
    { data: teams, error: teamsError },
    databaseTime,
    prediction,
    cohort,
  ] = await Promise.all([
    getPlayerForTablePrediction(supabase, playerId),
    supabase
      .from("teams")
      .select("id, name, display_name, short_code, previous_season_position")
      .eq("active", true)
      .order("name", { ascending: true }),
    getDatabaseTime(supabase),
    getTablePredictionRecord(supabase, playerId),
    // Caught into the page's own "Try refreshing" branch below: unlike
    // the kickoff lookup it replaced, the cohort read throws on failure.
    loadScoredCohort(supabase, competitionId).catch(() => null),
  ]);

  if (!player) {
    return (
      <main className="flex min-h-full flex-1 items-center justify-center bg-paper p-4">
        <p className="text-danger">
          Couldn&apos;t load your player record. Try refreshing.
        </p>
      </main>
    );
  }

  if (teamsError || !teams) {
    return (
      <main className="flex min-h-full flex-1 items-center justify-center bg-paper p-4">
        <p className="text-danger">
          Couldn&apos;t load the teams. Try refreshing.
        </p>
      </main>
    );
  }

  if (!databaseTime) {
    return (
      <main className="flex min-h-full flex-1 items-center justify-center bg-paper p-4">
        <p className="text-danger">
          Couldn&apos;t confirm the deadline. Try refreshing.
        </p>
      </main>
    );
  }

  if (!cohort) {
    return (
      <main className="flex min-h-full flex-1 items-center justify-center bg-paper p-4">
        <p className="text-danger">
          Couldn&apos;t load Predict the Table. Try refreshing.
        </p>
      </main>
    );
  }

  const editability = getTablePredictionEditability({
    joinedAt: player.joinedAt,
    now: databaseTime,
    gameweekOneKickoff: cohort.gameweekOneKickoff,
  });

  const view = decidePredictTableView({
    locked: editability.locked,
    isLateJoiner: editability.isLateJoiner,
    hasSubmittedTable: cohort.players.has(playerId),
    standingsComplete: cohort.actualOrder.length > 0,
    editRequested: edit === "1",
  });

  const teamList: Team[] = teams.map((team) => ({
    id: team.id,
    name: team.name,
    displayName: team.display_name,
    shortCode: team.short_code,
    previousSeasonPosition: team.previous_season_position,
  }));

  const page = (children: React.ReactNode) => (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 bg-paper p-4">
      <h1 className={`${T.h1} font-extrabold ${TX.base}`}>Predict the Table</h1>
      {children}
    </main>
  );

  // S2: on time, never submitted before the deadline -- no table to show.
  if (view === "not-submitted") {
    return page(
      <p className={`${T.body} ${TX.base}`}>
        Your table wasn&apos;t submitted before the deadline ({DEADLINE_DAY}),
        so it isn&apos;t scored this season.
      </p>,
    );
  }

  const ownBands = cohort.bands.get(playerId) ?? new Map<string, number>();

  // S4: submitted and locked, but nothing to score against yet.
  if (view === "awaiting-standings") {
    const assignments = Object.fromEntries(
      [...ownBands].map(([teamId, index]) => [teamId, BAND_KEYS[index]]),
    ) as Record<string, BandKey>;
    return page(
      <>
        <p className={`${T.caption} ${TX.muted}`}>
          Scores show up after the first standings update.
        </p>
        <BandSummary
          assignments={assignments}
          teamsById={new Map(teamList.map((team) => [team.id, team]))}
        />
        {editability.isLateJoiner ? <EditTableLink /> : null}
      </>,
    );
  }

  // S1, S3: your table scored against the real one.
  const ownResult = cohort.results.get(playerId);
  if (view === "single" && ownResult) {
    const timeZone =
      (await cookies()).get(TIMEZONE_COOKIE_NAME)?.value ?? DEFAULT_TIME_ZONE;
    return page(
      <TableSingle
        view={buildTableSingle({
          actualOrder: cohort.actualOrder,
          teams: new Map(
            teamList.map((team) => [
              team.id,
              { id: team.id, name: team.name, shortCode: team.shortCode },
            ]),
          ),
          side: { bands: ownBands, result: ownResult },
        })}
        player={{
          displayName: player.displayName,
          emoji: player.emoji,
          isLateJoiner: editability.isLateJoiner,
        }}
        own
        seasonOver={isSeasonOver(cohort.minPlayed)}
        standingsNote={staleStandingsNote(
          databaseTime,
          cohort.standingsUpdatedAt,
          timeZone,
        )}
        // S3: a Late Joiner can always edit; an on-time table is locked.
        editHref={
          editability.isLateJoiner
            ? ("/predict-table?edit=1" as Route)
            : undefined
        }
      />,
    );
  }

  // The capture board (or a Late Joiner's skipped screen), as before.
  let assignments: Record<string, BandKey> = {};
  if (prediction) {
    const { data: ranks } = await supabase
      .from("table_prediction_ranks")
      .select("team_id, band")
      .eq("table_prediction_id", prediction.id);
    assignments = Object.fromEntries(
      (ranks ?? []).map((rank) => [rank.team_id, rank.band as BandKey]),
    );
  }

  return (
    <PredictTableFlow
      teams={teamList}
      initialAssignments={assignments}
      isLateJoiner={editability.isLateJoiner}
      locked={editability.locked}
      initialIsSkipped={prediction?.skipped ?? false}
      initialSubmittedAt={prediction?.submittedAt ?? null}
    />
  );
}
