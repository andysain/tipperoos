"use client";

// THE SUMMARY SECTION. See page.tsx's PROBLEM block for what it's solving.
//
// Settled from the A/B/C pass:
//   * standings take C's ladder -- relative position, not absolute rank.
//     "Where does that leave me" is a comparative question in a family
//     competition, and a lone rank numeral can't answer it.
//   * the recap is a MEDIAN of A and C. A carried the detail (what you
//     tipped against what happened); C carried the compression. The detail
//     has to survive, because by the time a player next opens the app the
//     Pick Board has advanced to the new gameweek -- this block is the only
//     place their own tip for the finished week still exists. So: keep the
//     tip, drop A's hero block and its four-column header, and put the total
//     inline on the header line. Roughly half A's height, none of its loss.
//   * the recap and the picks archive are ONE design at two lengths -- both
//     render PicksTable.tsx, so a player learns the grammar once.
//   * one ladder, not two. The side-by-side Predict the Table column was
//     built and rejected: two separate orders can't share a ladder, so it
//     meant two ~185px ladders, and the second competition is a once-a-season
//     interest sitting in weekly space.

import { ChevronRight } from "lucide-react";
import { recapFor, VIEWER_ROW, BOARD, type ProtoBoardRow } from "./season";
import {
  LABEL,
  FOCUS,
  INSET,
  CARD_SHADOW,
  T_CAPTION,
  T_LABEL,
  TEXT,
  TEXT_MUTED,
  TEXT_FAINT,
} from "./shared";
import { PicksLegend, PicksRow, WeekHeading } from "./PicksTable";

const CARD =
  `rounded-card bg-white text-left ${CARD_SHADOW} transition-shadow hover:shadow-[0_14px_28px_-12px_rgba(18,60,67,0.34)] active:translate-y-px ` +
  FOCUS;

// ===========================================================================
// Recap -- the median
// ===========================================================================

function RecapBlock({
  gw,
  go,
}: {
  gw: number;
  go: (t: string, gw?: number) => void;
}) {
  const recap = recapFor(gw);
  return (
    <button
      onClick={() => go("gameweek", gw)}
      aria-label={`Gameweek ${gw} results — see everyone's picks`}
      className={`flex flex-col gap-1.5 ${INSET} py-3 ${CARD}`}
    >
      {/* Home stacks a finished gameweek directly above an open one -- two
          adjacent numbers with nothing separating "done" from "to do". */}
      <span className={`${LABEL} ${TEXT_FAINT}`}>Last week</span>
      <WeekHeading gameweek={recap.gameweek} state={recap.outcome} chevron />
      <PicksLegend />
      <ul className="flex flex-col gap-1">
        {recap.rows.map((line) => (
          <PicksRow key={line.homeCode} line={line} />
        ))}
      </ul>
    </button>
  );
}

// ===========================================================================
// Standings -- C's ladder, always three rows
// ===========================================================================

/** Always three rows, wherever you sit. At the top you see the two below
 *  you; at the bottom, the two above. A two-row edge case would make the
 *  block change shape at exactly the moments a player most wants it stable. */
function windowOf<T>(rows: T[], i: number): T[] {
  if (rows.length <= 3) return rows;
  if (i <= 0) return rows.slice(0, 3);
  if (i >= rows.length - 1) return rows.slice(-3);
  return rows.slice(i - 1, i + 2);
}

function LadderRow({
  rank,
  emoji,
  name,
  points,
  diff,
  you,
}: {
  rank: number | null;
  emoji: string;
  name: string;
  points: number;
  diff: number;
  you: boolean;
}) {
  return (
    <div
      className={`relative flex items-center gap-1.5 ${INSET} py-1.5 ${
        you ? "bg-accent/12" : ""
      }`}
    >
      {you ? (
        <span className="absolute inset-y-0 left-0 w-1 bg-accent" aria-hidden />
      ) : null}
      <span
        className={`w-5 shrink-0 ${T_CAPTION} font-bold tabular-nums ${TEXT_MUTED}`}
      >
        {rank}
      </span>
      <span
        className="grid size-5 shrink-0 place-items-center rounded-full bg-paper text-[0.7rem]"
        aria-hidden
      >
        {emoji}
      </span>
      <span className="min-w-0 flex-1 truncate text-[0.8rem] font-bold text-ink">
        {you ? "You" : name}
      </span>
      <span className={`${T_CAPTION} font-bold tabular-nums ${TEXT}`}>
        {points}
      </span>
      {/* Words, not a sign. `+5` already means "points scored" twice on
          this screen; a third signed number meaning "points ahead of you"
          is one meaning too many for one mark. Your own row shows nothing --
          an empty cell says "no gap to yourself" better than a dash. */}
      <span
        className={`w-14 shrink-0 text-right ${T_LABEL} tabular-nums ${TEXT_MUTED}`}
      >
        {you
          ? ""
          : diff === 0
            ? "level"
            : diff > 0
              ? `${diff} ahead`
              : `${Math.abs(diff)} behind`}
      </span>
    </div>
  );
}

function SeasonLadder({ onOpen }: { onOpen: () => void }) {
  const humans = BOARD.filter((r) => !r.isBot);
  const rows = windowOf(
    humans,
    humans.findIndex((r) => r.isViewer),
  );
  return (
    <button
      onClick={onOpen}
      aria-label="Season leaderboard"
      className={`flex flex-1 flex-col overflow-hidden py-1 ${CARD}`}
    >
      <span
        className={`flex items-center justify-between px-3 pb-0.5 ${LABEL} text-ink/70`}
      >
        Tipping
        <ChevronRight className="size-3.5 stroke-ink/70" aria-hidden />
      </span>
      {rows.map((r: ProtoBoardRow) => (
        <LadderRow
          key={r.playerId}
          rank={r.rank}
          emoji={r.emoji}
          name={r.displayName}
          points={r.points}
          diff={r.points - VIEWER_ROW.points}
          you={r.isViewer}
        />
      ))}
    </button>
  );
}

// ===========================================================================

export function SummaryRow({
  recapGw,
  go,
}: {
  recapGw: number;
  go: (t: string, gw?: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <RecapBlock gw={recapGw} go={go} />
      <SeasonLadder onOpen={() => go("leaderboard")} />
    </div>
  );
}
