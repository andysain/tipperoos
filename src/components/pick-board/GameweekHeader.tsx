import { formatKickoffInTimeZone } from "@/lib/dates/kickoff-format";

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
  return (
    <div className="flex items-baseline justify-between">
      <h1 className="text-xl font-extrabold text-ink">
        Gameweek {gameweekNumber}
      </h1>
      {earliestOpenKickoffUtcIso ? (
        <span className="text-xs font-semibold text-ink/55">
          Locks from{" "}
          {formatKickoffInTimeZone(earliestOpenKickoffUtcIso, timeZone)}
        </span>
      ) : null}
    </div>
  );
}
