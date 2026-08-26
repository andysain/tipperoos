"use client";

import { useState } from "react";
import type { TableLeaderboardRow } from "@/lib/leaderboard/table-board";
import {
  BOLD_CALL_BONUS,
  MAX_BOLD_CALLS,
  MAX_PREDICT_TABLE_SCORE,
  PLACEMENT_POINTS_BY_DISTANCE,
  TABLE_BANDS,
  TOTAL_TEAMS,
} from "@/lib/scoring/predict-table";
import { LeaderboardRowCard, type LeaderboardCardRow } from "./LeaderboardRowCard";

// The Predict the Table segment (issue #171, docs/adr/0012-leaderboard-view.md
// D13): same list-open-state ownership as LeaderboardList, adapting
// TableLeaderboardRow into the shared LeaderboardRowCard shape instead of
// LeaderboardRow's. Kept as its own small component rather than making
// LeaderboardList generic over both row types -- the two segments' rows
// come from genuinely different sources (season scores vs. Predict the
// Table scores) and the open-state logic is a few lines, not worth
// abstracting a shared list wrapper over.

const MAX_PLACEMENT_SCORE = TOTAL_TEAMS * PLACEMENT_POINTS_BY_DISTANCE[0];
const MAX_BAND_BONUS_SCORE = TABLE_BANDS.reduce(
  (sum, band) => sum + band.bonus,
  0,
);
const MAX_BOLD_CALL_SCORE = MAX_BOLD_CALLS * BOLD_CALL_BONUS;

function toCardRow(row: TableLeaderboardRow): LeaderboardCardRow {
  return {
    playerId: row.playerId,
    displayName: row.displayName,
    emoji: row.emoji,
    isViewer: row.isViewer,
    rank: row.rank,
    // A Late Joiner is ineligible for THIS title only (unlike the season
    // one) and renders exactly as a Bot does on the Season segment (D13).
    ineligibleLabel: row.isLateJoiner ? "Late" : null,
    // No movement, ever -- nothing stores Table Prediction score history
    // to diff against (D13). Every row is null, so `anyMovement` below is
    // always false and the "New" tag never renders either.
    movement: null,
    pointsDisplay: `${row.totalScore}/${MAX_PREDICT_TABLE_SCORE}`,
    pointsSuffix: null,
    mutePoints: false,
    panelStats: [
      { value: `${row.placementScore}/${MAX_PLACEMENT_SCORE}`, label: "Placement" },
      { value: `${row.bandBonusScore}/${MAX_BAND_BONUS_SCORE}`, label: "Bands" },
      { value: `${row.boldCallScore}/${MAX_BOLD_CALL_SCORE}`, label: "Bold calls" },
    ],
    // No "see their table" destination exists -- Predict the Table has no
    // peer-visibility concept anywhere in the spec (unlike match picks,
    // which unlock after lock). Omitted rather than invented.
    panelLink: null,
  };
}

export function TableLeaderboardList({
  rows,
  scored,
}: {
  rows: readonly TableLeaderboardRow[];
  scored: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((row) => (
        <LeaderboardRowCard
          key={row.playerId}
          row={toCardRow(row)}
          scored={scored}
          anyMovement={false}
          open={openId === row.playerId}
          onToggle={() =>
            setOpenId((current) =>
              current === row.playerId ? null : row.playerId,
            )
          }
        />
      ))}
    </ul>
  );
}
