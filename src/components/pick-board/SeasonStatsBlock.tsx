import type { SeasonStats } from "@/app/_lib/pick-board-access";
import { CARD_SHADOW } from "@/components/ui/tokens";

/**
 * Bottom-of-board season summary. Hidden entirely, not shown as zeros,
 * before the competition's first scored match (ADR-0007's day-one variant
 * -- "the season-stats block is hidden"). Full analytics/stats pages (ELO,
 * streaks, progress charts) are explicitly out of scope (CLAUDE.md); this
 * stays a small, honest season total + rank, nothing more.
 */
export function SeasonStatsBlock({ stats }: { stats: SeasonStats | null }) {
  if (!stats) return null;

  return (
    <div
      className={`flex flex-col gap-1 rounded-card bg-surface p-4 ${CARD_SHADOW}`}
    >
      <span className="text-xs font-bold uppercase tracking-[0.06em] text-ink/50">
        Season so far
      </span>
      <p className="text-sm text-ink/80">
        You&apos;re rank <strong>{stats.rank}</strong> with{" "}
        <strong>{stats.points}</strong> points this season.
      </p>
    </div>
  );
}
