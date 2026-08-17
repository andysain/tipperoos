import { redirect } from "next/navigation";
import { getSessionPlayerId } from "@/app/_lib/session-cookie";
import {
  getCurrentSeasonId,
  resolveCurrentGameweekForCompetition,
} from "@/app/_lib/gameweek-access";
import { loadLeaderboard } from "@/app/_lib/leaderboard-access";
import { resolveCompetitionId } from "@/lib/competitions/scope";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LeaderboardRowCard } from "@/components/leaderboard/LeaderboardRowCard";

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
      <h1 className="text-[1.9rem] font-extrabold text-ink">Leaderboard</h1>

      {rows.length === 0 ? (
        <p className="text-sm text-ink/70">
          Nobody&apos;s here yet — the leaderboard fills up as players join.
        </p>
      ) : (
        <>
          {!scored ? (
            <p className="text-sm text-ink/70">
              No points yet — the season starts here. Everyone below is in.
            </p>
          ) : null}

          <ul className="flex flex-col gap-1.5">
            {ordered.map((row) => (
              <LeaderboardRowCard
                key={row.playerId}
                row={row}
                scored={scored}
              />
            ))}
          </ul>

          {scored ? (
            <p className="text-xs text-ink/50">
              Bots play along for fun, but can&apos;t win the season — so they
              don&apos;t take a place. &ldquo;/wk&rdquo; is your points for each
              gameweek since you joined. Tap a player to see how they&apos;re
              doing.
            </p>
          ) : null}
        </>
      )}
    </main>
  );
}
