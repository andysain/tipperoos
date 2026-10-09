import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { loadActivePlayer } from "@/app/_lib/session-player";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  DEFAULT_TIME_ZONE,
  TIMEZONE_COOKIE_NAME,
} from "@/components/nav/timezone-cookie";
import { loadProtoData } from "./data";
import {
  TableComparePrototype,
  type ProtoPayload,
} from "./TableComparePrototype";

// PROTOTYPE ROUTE -- issue #214, throwaway, not linked from nav.
//
// Question: G (the dumbbell view) is chosen -- what closes its open design
// questions (issue "What the in-app prototype must close", 1-10)? One G, on
// real staging data, with each open question as a switchable option in the
// floating prototype panel. The owner picks; the picks go in the issue.
//
// Gates (issue P1): the session gate only. It reads every staging player's
// table, so it is never served by a Production deployment -- a stray merge
// 404s rather than exposing tables. No deadline gate and no tests (P1).
//
// Capture it on a throwaway branch when done; it does not belong on main.
export const dynamic = "force-dynamic";

export default async function TableComparePrototypePage() {
  if (process.env.VERCEL_ENV === "production") notFound();

  const { playerId: viewerId, competitionId } = await loadActivePlayer();
  const supabase = createServerSupabaseClient();
  const data = await loadProtoData(supabase, competitionId);

  // Formatted once, server-side, in the viewer's tz cookie (same pattern as
  // /picks/[playerId]) -- a client-side toLocaleDateString hydrates in a
  // different locale from the server render.
  const timeZone =
    (await cookies()).get(TIMEZONE_COOKIE_NAME)?.value ?? DEFAULT_TIME_ZONE;
  const standingsUpdatedLabel = data.standingsUpdatedAt
    ? new Intl.DateTimeFormat("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone,
      }).format(new Date(data.standingsUpdatedAt))
    : null;

  const payload: ProtoPayload = {
    viewerId,
    players: data.players,
    teams: data.teams,
    actualOrder: data.actualOrder,
    bands: Object.fromEntries(
      [...data.bandsByPlayer].map(([id, bands]) => [
        id,
        Object.fromEntries(bands),
      ]),
    ),
    scores: Object.fromEntries(data.scores),
    standingsUpdatedAt: data.standingsUpdatedAt,
    standingsUpdatedLabel,
    standingsPlayed: data.standingsPlayed,
    standingsStale: data.standingsStale,
    eligibleCohortSize: data.eligibleCohortSize,
  };

  return <TableComparePrototype payload={payload} />;
}
