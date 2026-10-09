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
  isSeasonOver,
} from "@/lib/table-predictions/compare";
import { LIVE_STANDINGS_STALE_MS } from "@/lib/gameweeks/select-next";
import { T, TX, FOCUS } from "@/components/ui/tokens";
import {
  DEFAULT_TIME_ZONE,
  TIMEZONE_COOKIE_NAME,
} from "@/components/nav/timezone-cookie";
import { TableCompare } from "../TableCompare";

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
  searchParams,
}: {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<{ miss?: string }>;
}) {
  const { playerId: targetId } = await params;
  // TEMPORARY (issue #214 before/after): `?miss=dashed` draws a no-points
  // call's bar dashed instead of faded. Remove before merge.
  const { miss } = await searchParams;
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

  // Two states the comparison can't draw, each said in the leaderboard's
  // muted-caption voice rather than as an empty chart.
  if (!you || !youResult || !themResult) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 bg-paper p-4">
        {top}
        <p className={`${T.caption} ${TX.muted}`}>
          {!you
            ? `You didn't submit a table, so there's nothing to compare with ${them.displayName}'s.`
            : "Nothing to compare yet. Tables are scored against the real league table, and that arrives with the first standings update."}
        </p>
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

  // Stale on the same 48h rule match selection uses. Formatted here, once,
  // in the viewer's tz cookie -- a client-side date format hydrates in a
  // different locale from the server render.
  const stale =
    now !== null &&
    cohort.standingsUpdatedAt !== null &&
    now.getTime() - cohort.standingsUpdatedAt.getTime() >
      LIVE_STANDINGS_STALE_MS;
  const timeZone =
    (await cookies()).get(TIMEZONE_COOKIE_NAME)?.value ?? DEFAULT_TIME_ZONE;
  const standingsNote =
    stale && cohort.standingsUpdatedAt
      ? new Intl.DateTimeFormat("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
          timeZone,
        }).format(cohort.standingsUpdatedAt)
      : null;

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
        seasonOver={isSeasonOver(cohort.minPlayed)}
        standingsNote={standingsNote}
        miss={miss === "dashed" ? "dashed" : "faded"}
      />
    </main>
  );
}
