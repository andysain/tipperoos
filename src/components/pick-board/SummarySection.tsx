import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { EmojiChip } from "@/components/ui/PlayerChip";
import {
  PicksLegend,
  PicksRow,
  WeekHeading,
} from "@/components/gameweek/PicksTable";
import {
  LABEL,
  T,
  TX,
  INSET,
  CARD_SHADOW,
  FOCUS,
} from "@/components/ui/tokens";
import type { LadderEntry, SummaryRecap } from "@/app/_lib/summary-access";

const CARD = `rounded-card bg-surface text-left ${CARD_SHADOW} ${FOCUS}`;

/**
 * The Pick Board's summary: what just happened, and where that leaves you
 * (docs/adr/0013-match-centre-tense-and-axes.md D15).
 *
 * The recap's detail is load-bearing, not decorative: by the time a player
 * next opens the app the Pick Board has advanced to the next gameweek, so
 * this is the ONLY place their own pick for the finished week still exists.
 *
 * Both blocks are doors, tappable at the HEADING only -- the rows inside are
 * inert, so a scroll that ends in a slight tap can't navigate away.
 */
export function SummarySection({
  recap,
  ladder,
}: {
  recap: SummaryRecap | null;
  ladder: readonly LadderEntry[];
}) {
  if (!recap && ladder.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {recap ? (
        <div className={`flex flex-col gap-1.5 ${INSET} py-3 ${CARD}`}>
          <Link
            href={`/gameweek/${String(recap.gameweek)}`}
            aria-label={`Gameweek ${recap.gameweek} results — see everyone's picks`}
            className={`rounded-btn-sm ${FOCUS}`}
          >
            <WeekHeading
              gameweek={recap.gameweek}
              label="Last Gameweek"
              outcome={recap.outcome}
              chevron
            />
          </Link>
          <PicksLegend />
          <ul className="flex flex-col gap-1">
            {recap.lines.map((line) => (
              <PicksRow key={line.key} line={line} />
            ))}
          </ul>
        </div>
      ) : null}

      {ladder.length > 0 ? (
        <div className={`flex flex-col overflow-hidden pt-3 pb-1 ${CARD}`}>
          {/* The door names where it goes. "Tipping" only made sense against
              a second (Predict the Table) ladder that was cut. */}
          <Link
            href="/leaderboard"
            aria-label="Season leaderboard"
            className={`flex items-center justify-between ${INSET} pb-0.5 ${LABEL} ${TX.muted} ${FOCUS}`}
          >
            Leaderboard
            <ChevronRight className="size-3.5 stroke-text-muted" aria-hidden />
          </Link>
          {ladder.map((row) => (
            <div
              key={row.playerId}
              className={`relative flex items-center gap-1.5 ${INSET} py-1.5 ${
                row.isViewer ? "bg-accent/12" : ""
              }`}
            >
              {row.isViewer ? (
                <span
                  className="absolute inset-y-0 left-0 w-1 bg-accent"
                  aria-hidden
                />
              ) : null}
              <span
                className={`w-5 shrink-0 ${T.caption} font-bold tabular-nums ${TX.muted}`}
              >
                {row.rank}
              </span>
              <EmojiChip emoji={row.emoji} size="sm" />
              <span
                className={`min-w-0 flex-1 truncate ${T.caption} font-bold ${TX.base}`}
              >
                {row.isViewer ? "You" : row.displayName}
              </span>
              <span
                className={`${T.caption} font-bold tabular-nums ${TX.base}`}
              >
                {row.points}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
