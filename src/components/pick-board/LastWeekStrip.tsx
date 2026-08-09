import type { LastWeekSummary } from "@/app/_lib/pick-board-access";

/**
 * Compact "here's what happened" strip shown above the new board the
 * moment a Gameweek finishes (ADR-0007: "Home advances immediately...
 * carrying a compact last-week strip"). Absent when there's no previous
 * gameweek, or it hasn't been scored yet (loadLastWeekSummary returns null
 * in both cases).
 */
export function LastWeekStrip({
  summary,
}: {
  summary: LastWeekSummary | null;
}) {
  if (!summary) return null;

  return (
    <div className="flex flex-col gap-2 rounded-card border border-paper-line bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-[0.06em] text-ink/50">
          Gameweek {summary.gameweekNumber} recap
        </span>
        <span className="text-sm font-extrabold tabular-nums text-accent">
          +{summary.points} pts
        </span>
      </div>
      <ul className="flex flex-col gap-1">
        {summary.matches.map((match, index) => (
          <li
            key={index}
            className="flex items-center justify-between text-sm text-ink/70"
          >
            <span>
              {match.home.shortCode ?? match.home.name} v{" "}
              {match.away.shortCode ?? match.away.name}
            </span>
            <span className="font-bold tabular-nums text-ink">
              {match.voided
                ? "Voided"
                : `${match.homeScore ?? "–"}–${match.awayScore ?? "–"}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
