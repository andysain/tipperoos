import { CircleCheck } from "lucide-react";
import { formatKickoffInTimeZone } from "@/lib/dates/kickoff-format";
import { lockInstantIso } from "@/lib/competitions/lock-window";
import { T, TX } from "@/components/ui/tokens";

/** ADR-0007: "The Gameweek header shows the earliest lock across the
 * board." `earliestOpenKickoffUtcIso` is null once both slots are locked,
 * voided or skipped -- nothing left to count down to. */
export function GameweekHeader({
  gameweekNumber,
  earliestOpenKickoffUtcIso,
  timeZone,
  filedOpenSlots,
  openSlots,
}: {
  gameweekNumber: number;
  earliestOpenKickoffUtcIso: string | null;
  timeZone: string;
  /** Slots still taking picks that already hold this player's pick. */
  filedOpenSlots: number;
  /** Slots still taking picks. */
  openSlots: number;
}) {
  // The lock instant, not the raw kickoff, or the deadline visibly
  // misleads a player by 5 minutes.
  const earliestLockUtcIso = earliestOpenKickoffUtcIso
    ? lockInstantIso(earliestOpenKickoffUtcIso)
    : null;

  return (
    // wrap + shrink-0 on the title: at 320-375px the two children competed
    // for one line and the TITLE broke, orphaning "1" onto its own row --
    // the gameweek number is the page's primary orientation cue, so it is
    // the one thing that must not wrap. The deadline stacks beneath instead.
    <div className="flex flex-col gap-1">
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
      {/* The week's job has an end: filing both picks is the product's
        success measure, and the board used to look the same whether a
        player had done it or not. */}
      {openSlots > 0 ? (
        filedOpenSlots === openSlots ? (
          <p
            role="status"
            className={`flex items-center gap-1.5 ${T.caption} font-bold ${TX.base}`}
          >
            <CircleCheck
              className="size-4 shrink-0 stroke-success"
              aria-hidden
            />
            {openSlots === 1 ? "Your pick is in." : "Both picks in."}{" "}
            You&apos;re set for Gameweek {gameweekNumber}.
          </p>
        ) : (
          <p role="status" className={`${T.caption} font-semibold ${TX.muted}`}>
            {filedOpenSlots} of {openSlots} picks in
          </p>
        )
      ) : null}
    </div>
  );
}
