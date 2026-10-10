import { cookies } from "next/headers";
import Link from "next/link";
import type { Route } from "next";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { loadActivePlayer } from "@/app/_lib/session-player";
import { loadTableComparison } from "@/app/_lib/table-compare-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  buildTableComparison,
  buildTableSingle,
  isSeasonOver,
} from "@/lib/table-predictions/compare";
import { staleStandingsNote } from "@/app/_lib/standings-note";
import { T, TX, FOCUS } from "@/components/ui/tokens";
import {
  DEFAULT_TIME_ZONE,
  TIMEZONE_COOKIE_NAME,
} from "@/components/nav/timezone-cookie";
import { TableCompare } from "../TableCompare";
import { TableSingle } from "../TableSingle";

// Compare your Predict the Table entry with another player's, against the
// real table (issue #214). Reached from a row on the leaderboard's Predict
// the Table segment, like /picks/[playerId] from the Season segment.
//
// The gate (loadTableComparison -> decideTableCompareAccess) is the
// peer-visibility rule's server-side enforcement: your own id redirects to
// your own table; anything else is a 404 before the deadline (on DB time),
// outside your competition, or without a submitted table. Serial Supabase
// depth is 2: loadActivePlayer, then one wave.
export const dynamic = "force-dynamic";

export default async function CompareTablePage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId: targetId } = await params;
  const { playerId: viewerId, competitionId } = await loadActivePlayer();
  // Your own id goes to your own table before anything is read (D6): it
  // never waits on, or fails with, the comparison's reads.
  if (targetId === viewerId) redirect("/predict-table");
  const supabase = createServerSupabaseClient();

  const { decision, cohort, teams, now } = await loadTableComparison(
    supabase,
    { id: viewerId, competitionId },
    targetId,
  );
  if (decision === "own-table") redirect("/predict-table");
  if (decision === "not-found") notFound();

  const them = cohort.players.get(targetId);
  if (!them) notFound();
  const you = cohort.players.get(viewerId);

  const top = (
    <>
      {/* Back to the segment you came from, not the Season one (D7). */}
      <Link
        href={"/leaderboard?segment=table" as Route}
        className={`-ml-2 flex min-h-11 w-fit items-center gap-0.5 rounded-btn-sm px-2 ${T.caption} font-bold ${TX.muted} hover:bg-ink/5 ${FOCUS}`}
      >
        <ChevronLeft className="size-4" aria-hidden />
        Leaderboard
      </Link>
      <h1 className={`${T.h1} font-extrabold leading-tight ${TX.base}`}>
        Predict the Table
      </h1>
    </>
  );

  const youResult = cohort.results.get(viewerId);
  const themResult = cohort.results.get(targetId);
  const timeZone =
    (await cookies()).get(TIMEZONE_COOKIE_NAME)?.value ?? DEFAULT_TIME_ZONE;
  const standingsNote = staleStandingsNote(
    now,
    cohort.standingsUpdatedAt,
    timeZone,
  );
  const seasonOver = isSeasonOver(cohort.minPlayed);

  // Nothing scored yet -- checked first (#226 S5), whoever is viewing: said
  // in the leaderboard's muted-caption voice, not drawn as an empty chart.
  if (!themResult) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 bg-paper p-4">
        {top}
        <p className={`${T.caption} ${TX.muted}`}>
          Nothing scored yet. Tables are scored against the real league table,
          and that arrives with the first standings update.
        </p>
      </main>
    );
  }

  // You have no submitted table: their table on its own (owner decision,
  // #226) -- their outline mark and neutral wording, never "you" (S5).
  if (!you || !youResult) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 bg-paper p-4">
        {top}
        <TableSingle
          view={buildTableSingle({
            actualOrder: cohort.actualOrder,
            teams,
            side: {
              bands: cohort.bands.get(targetId) ?? new Map(),
              result: themResult,
            },
          })}
          player={{
            displayName: them.displayName,
            emoji: them.emoji,
            isLateJoiner: them.isLateJoiner,
          }}
          own={false}
          seasonOver={seasonOver}
          standingsNote={standingsNote}
        />
      </main>
    );
  }

  const comparison = buildTableComparison({
    actualOrder: cohort.actualOrder,
    teams,
    you: { bands: cohort.bands.get(viewerId) ?? new Map(), result: youResult },
    them: {
      bands: cohort.bands.get(targetId) ?? new Map(),
      result: themResult,
    },
  });

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 bg-paper p-4">
      {top}
      <TableCompare
        comparison={comparison}
        you={{
          displayName: "You",
          emoji: you.emoji,
          isLateJoiner: you.isLateJoiner,
        }}
        them={{
          displayName: them.displayName,
          emoji: them.emoji,
          isLateJoiner: them.isLateJoiner,
        }}
        seasonOver={seasonOver}
        standingsNote={standingsNote}
      />
    </main>
  );
}
