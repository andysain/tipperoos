import { LIVE_STANDINGS_STALE_MS } from "@/lib/gameweeks/select-next";

/**
 * The date a scored Predict the Table view is "measured against", shown
 * only when the standings are stale -- the same 48h rule match selection
 * uses, judged on DB time. Formatted on the server in the viewer's tz
 * cookie: a client-side date format hydrates in a different locale from
 * the server render. Null when the standings are fresh or unknown.
 */
export function staleStandingsNote(
  now: Date | null,
  standingsUpdatedAt: Date | null,
  timeZone: string,
): string | null {
  if (now === null || standingsUpdatedAt === null) return null;
  if (now.getTime() - standingsUpdatedAt.getTime() <= LIVE_STANDINGS_STALE_MS) {
    return null;
  }
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  }).format(standingsUpdatedAt);
}
