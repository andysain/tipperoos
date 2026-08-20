import { redirect } from "next/navigation";
import { getSessionPlayerId } from "@/app/_lib/session-cookie";
import {
  getCurrentSeasonId,
  resolveCurrentGameweekForCompetition,
} from "@/app/_lib/gameweek-access";
import { loadLeaderboard } from "@/app/_lib/leaderboard-access";
import { resolveCompetitionId } from "@/lib/competitions/scope";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LeaderboardList } from "@/components/leaderboard/LeaderboardList";
import { T, TX } from "@/components/ui/tokens";

// Same freshness contract as the Pick Board: rank is derived per request
// from live scores, never cached and never read from a stored standing, so
// this route can't disagree with the Pick Board's stats strip
// (docs/adr/0012-leaderboard-view.md D2).
export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const playerId = await getSessionPlayerId();
  if (!playerId) {
    redirect("/login");
  }

  const supabase = createServerSupabaseClient();
  const competitionId = await resolveCompetitionId(supabase, playerId);
  if (!competitionId) {
    redirect("/login");
  }

  const seasonId = await getCurrentSeasonId(supabase);
  const gameweekNumber = seasonId
    ? await resolveCurrentGameweekForCompetition(
        supabase,
        competitionId,
        new Date(),
        seasonId,
      )
    : null;

  const view = seasonId
    ? await loadLeaderboard(
        supabase,
        competitionId,
        seasonId,
        playerId,
        gameweekNumber !== null ? gameweekNumber - 1 : null,
      )
    : null;

  const rows = view?.rows ?? [];
  const scored = view?.scored ?? false;

  // Day one drops the numbers rather than showing a column of zeros, and
  // shows who's playing instead (D8) -- alphabetical, since there's no
  // ranking to order by yet.
  const ordered = scored
    ? rows
    : [...rows].sort((a, b) => a.displayName.localeCompare(b.displayName));

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 bg-paper p-4">
      <h1 className={`${T.h1} font-extrabold text-text`}>Leaderboard</h1>

      {rows.length === 0 ? (
        <p className={`${T.caption} ${TX.muted}`}>
          Nobody&apos;s here yet — the leaderboard fills up as players join.
        </p>
      ) : (
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
          {scored ? (
            <p className={`${T.caption} ${TX.muted}`}>
              Bots play too, but only a real player can win the season. Beat the
              Median Bot and you beat the whole group&apos;s average.
            </p>
          ) : null}

          <LeaderboardList rows={ordered} scored={scored} />

          {scored ? (
            <p className={`${T.caption} ${TX.muted}`}>
              &ldquo;/wk&rdquo; is your points for each gameweek since you
              joined. Tap a player to see how they&apos;re doing.
            </p>
          ) : null}
        </>
      )}
    </main>
  );
}
