import { formatKickoffInTimeZone } from "@/lib/dates/kickoff-format";
import { T, TX } from "@/components/ui/tokens";

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
    // wrap + shrink-0 on the title: at 320-375px the two children competed
    // for one line and the TITLE broke, orphaning "1" onto its own row --
    // the gameweek number is the page's primary orientation cue, so it is
    // the one thing that must not wrap. The deadline stacks beneath instead.
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <h2 className={`shrink-0 ${T.h2} font-bold text-text`}>
        Gameweek {gameweekNumber}
      </h2>
      {earliestLockUtcIso ? (
        // The deadline is the fact that converts a visit into a pick, so it
        // is not the quietest text on the page: text-muted is the AA floor,
        // and ink/55 (3.0:1) was below it.
        <span className={`${T.caption} font-bold ${TX.muted}`}>
          Picks close {formatKickoffInTimeZone(earliestLockUtcIso, timeZone)}
        </span>
      ) : null}
    </div>
  );
}
