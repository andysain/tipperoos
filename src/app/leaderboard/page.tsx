import { redirect } from "next/navigation";
import { getSessionPlayerId } from "@/app/_lib/session-cookie";
import { getCurrentSeasonId } from "@/app/_lib/gameweek-access";
import { loadLeaderboard } from "@/app/_lib/leaderboard-access";
import { loadTableLeaderboard } from "@/app/_lib/table-leaderboard-access";
import { resolveCompetitionId } from "@/lib/competitions/scope";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LeaderboardList } from "@/components/leaderboard/LeaderboardList";
import { TableLeaderboardList } from "@/components/leaderboard/TableLeaderboardList";
import { LeaderboardSegmentedControl } from "@/components/leaderboard/LeaderboardSegmentedControl";
import { T, TX } from "@/components/ui/tokens";
import type { LeaderboardRow } from "@/lib/leaderboard/board";
import type { TableLeaderboardRow } from "@/lib/leaderboard/table-board";

// Same freshness contract as the Pick Board: rank is derived per request
// from live scores, never cached and never read from a stored standing, so
// this route can't disagree with the Pick Board's stats strip
// (docs/adr/0012-leaderboard-view.md D2).
export const dynamic = "force-dynamic";

function SeasonSegment({
  rows,
  scored,
}: {
  rows: readonly LeaderboardRow[];
  scored: boolean;
}) {
  // Day one drops the numbers rather than showing a column of zeros, and
  // shows who's playing instead (D8) -- alphabetical, since there's no
  // ranking to order by yet.
  const ordered = scored
    ? rows
    : [...rows].sort((a, b) => a.displayName.localeCompare(b.displayName));

  if (rows.length === 0) {
    return (
      <p className={`${T.caption} ${TX.muted}`}>
        Nobody&apos;s here yet — the leaderboard fills up as players join.
      </p>
    );
  }

  return (
    <>
      {!scored ? (
        <p className={`${T.caption} ${TX.muted}`}>
          No points yet — the season starts here. Everyone below is in.
        </p>
      ) : null}

      {/* Above the list, not below it. This is the only thing that
          actually TEACHES D12's rule -- a muted row and a small BOT label
          can hint that a bot sits outside the competition, but a sentence
          can say it, and this is where the confusion happens. */}
      {/* NOT gated on `scored`. Day one is the first time a player sees
          this list, so it is exactly when three robots sitting in their
          family competition need explaining -- gating it meant the one
          view guaranteed to confuse was the one view with no explanation.
          Only the second sentence waits, since it needs scores to mean
          anything. */}
      {rows.some((row) => row.isBot) ? (
        <p className={`${T.caption} ${TX.muted}`}>
          Bots play too, but only a real player can win the season.
          {scored
            ? " Beat the Median Bot and you beat the whole group's average."
            : ""}
        </p>
      ) : null}

      <LeaderboardList rows={ordered} scored={scored} />

      {/* The per-week figure only appears once a gameweek has COMPLETED
          (it needs a standings snapshot), so mid-gameweek the board shows
          points and ranks but no "/wk" — and explaining a figure that
          isn't on screen is worse than not explaining it. */}
      {scored ? (
        <p className={`${T.caption} ${TX.muted}`}>
          {rows.some((row) => row.pointsPerGameweek !== null)
            ? "“/wk” is your points for each gameweek since you joined. Tap a player to see how they’re doing."
            : "Tap a player to see how they’re doing."}
        </p>
      ) : null}
    </>
  );
}

function TableSegment({
  rows,
  scored,
}: {
  rows: readonly TableLeaderboardRow[];
  scored: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className={`${T.caption} ${TX.muted}`}>
        Nobody&apos;s scored here yet — check back once Predict the Table
        submissions have been through a standings sync.
      </p>
    );
  }

  return (
    <>
      {rows.some((row) => row.isLateJoiner) ? (
        <p className={`${T.caption} ${TX.muted}`}>
          A Late Joiner&apos;s score counts, but they can&apos;t win this title
          — joining after Gameweek 1 is an information advantage this board
          doesn&apos;t rank.
        </p>
      ) : null}

      <TableLeaderboardList rows={rows} scored={scored} />

      <p className={`${T.caption} ${TX.muted}`}>
        Tap a player to see how their score breaks down.
      </p>
    </>
  );
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ segment?: string }>;
}) {
  const playerId = await getSessionPlayerId();
  if (!playerId) {
    redirect("/login");
  }

  const supabase = createServerSupabaseClient();
  const competitionId = await resolveCompetitionId(supabase, playerId);
  if (!competitionId) {
    redirect("/login");
  }

  const { segment } = await searchParams;
  const isTableSegment = segment === "table";

  if (isTableSegment) {
    const view = await loadTableLeaderboard(supabase, competitionId, playerId);

    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 bg-paper p-4">
        <h1 className={`${T.h1} font-extrabold text-text`}>Leaderboard</h1>
        <LeaderboardSegmentedControl active="table" />
        <TableSegment rows={view.rows} scored={view.scored} />
      </main>
    );
  }

  const seasonId = await getCurrentSeasonId(supabase);

  const view = seasonId
    ? await loadLeaderboard(supabase, competitionId, seasonId, playerId)
    : null;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 bg-paper p-4">
      <h1 className={`${T.h1} font-extrabold text-text`}>Leaderboard</h1>
      <LeaderboardSegmentedControl active="season" />
      <SeasonSegment rows={view?.rows ?? []} scored={view?.scored ?? false} />
    </main>
  );
}
