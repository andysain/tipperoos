import { formatKickoffInTimeZone } from "@/lib/dates/kickoff-format";

// Picks lock 5 minutes before scheduled kickoff (CLAUDE.md, "Predictions"),
// same window as src/lib/competitions/scope.ts's LOCK_WINDOW_MS -- the
// displayed "Locks from" time must be the lock instant, not the raw
// kickoff instant, or it visibly misleads a player by 5 minutes.
const LOCK_WINDOW_MS = 5 * 60 * 1000;

/** ADR-0007: "The Gameweek header shows the earliest lock across the
 * board." `earliestOpenKickoffUtcIso` is null once both slots are locked,
 * voided or skipped -- nothing left to count down to. */
export function GameweekHeader({
  gameweekNumber,
  earliestOpenKickoffUtcIso,
  timeZone,
}: {
  gameweekNumber: number;
  earliestOpenKickoffUtcIso: string | null;
  timeZone: string;
}) {
  const earliestLockUtcIso = earliestOpenKickoffUtcIso
    ? new Date(
        new Date(earliestOpenKickoffUtcIso).getTime() - LOCK_WINDOW_MS,
      ).toISOString()
    : null;

  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-[1.3rem] font-bold text-ink">
        Gameweek {gameweekNumber}
      </h2>
      {earliestLockUtcIso ? (
        <span className="text-xs font-semibold text-ink/55">
          Locks from {formatKickoffInTimeZone(earliestLockUtcIso, timeZone)}
        </span>
      ) : null}
    </div>
  );
}
