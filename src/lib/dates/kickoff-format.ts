// Kickoff/countdown display formatting -- see
// docs/adr/0007-home-surface-and-pick-entry.md ("Times render in Sydney
// with the overnight case spelled out") and CLAUDE.md -> "Hard constraints"
// (store UTC, do lock comparisons in UTC, render local only). `timeZone` is
// a caller-supplied IANA name rather than a hardcoded "Australia/Sydney" --
// see issue #93, which is expected to eventually resolve it from the
// viewer's browser rather than a fixed default.

const WEEKDAY_SHORT = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

// Kickoffs landing in these local hours read as "still last night" unless
// the previous day is spelled out -- a UK Saturday afternoon kickoff is
// genuinely the small hours of Sydney's Sunday (docs/adr/0007).
const OVERNIGHT_HOUR_CUTOFF = 6;

/**
 * Absolute kickoff label in the given IANA timezone, e.g. "Sat 7:30pm" or,
 * for the overnight case, "Sun 12:00am (Sat night)".
 */
export function formatKickoffInTimeZone(
  kickoffUtcIso: string,
  timeZone: string,
): string {
  const date = new Date(kickoffUtcIso);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;

  const weekday = get("weekday");
  const hour24 = Number(get("hour"));
  const minute = get("minute");
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const ampm = hour24 < 12 ? "am" : "pm";
  const timeLabel = `${hour12}:${minute}${ampm}`;

  if (hour24 < OVERNIGHT_HOUR_CUTOFF) {
    const weekdayIndex = WEEKDAY_SHORT.indexOf(
      weekday as (typeof WEEKDAY_SHORT)[number],
    );
    const previousWeekday = WEEKDAY_SHORT[(weekdayIndex + 6) % 7];
    return `${weekday} ${timeLabel} (${previousWeekday} night)`;
  }
  return `${weekday} ${timeLabel}`;
}

const MS_PER_MINUTE = 60_000;

/**
 * Relative countdown to a UTC instant, coarsening with distance: "2d 4h",
 * "3h 12m", then explicit minutes once inside the last hour (no seconds --
 * matches the granularity already proven out in PredictTableFlow.tsx's
 * inline formatter). Never negative; a past target reads as "0m".
 */
export function formatCountdown(
  targetUtcIso: string,
  nowUtcMs: number,
): string {
  const msRemaining = new Date(targetUtcIso).getTime() - nowUtcMs;
  const totalMinutes = Math.max(0, Math.floor(msRemaining / MS_PER_MINUTE));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
