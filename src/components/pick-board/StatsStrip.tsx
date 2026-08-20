import type { SeasonStats } from "@/app/_lib/pick-board-access";
import { CARD_SHADOW } from "@/components/ui/tokens";
import { ordinal } from "@/lib/format/ordinal";

/**
 * Compact top-of-board rank + season points. Absent entirely (not shown as
 * dashes) before the competition's first scored match -- the day-one
 * variant, ADR-0007: "the stats strip drops rank and points entirely."
 */
export function StatsStrip({ stats }: { stats: SeasonStats | null }) {
  if (!stats) return null;

  return (
    <div
      className={`flex items-center gap-4 rounded-card bg-surface px-4 py-3 ${CARD_SHADOW}`}
    >
      <div className="flex flex-col">
        <span className="text-[0.65rem] font-bold uppercase tracking-[0.06em] text-ink/50">
          Your rank
        </span>
        <span className="text-lg font-extrabold tabular-nums text-ink">
          {ordinal(stats.rank)}
        </span>
      </div>
      <div className="h-8 w-px bg-paper-line" aria-hidden />
      <div className="flex flex-col">
        <span className="text-[0.65rem] font-bold uppercase tracking-[0.06em] text-ink/50">
          Season points
        </span>
        <span className="text-lg font-extrabold tabular-nums text-ink">
          {stats.points}
        </span>
      </div>
    </div>
  );
}
