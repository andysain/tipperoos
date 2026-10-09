"use client";

import { useState } from "react";
import type { TableLeaderboardRow } from "@/lib/leaderboard/table-board";
import { LeaderboardRowCard } from "./LeaderboardRowCard";
import { toTableCardRow } from "./table-card-row";

// The Predict the Table segment (issue #171, docs/adr/0012-leaderboard-view.md
// D13): same list-open-state ownership as LeaderboardList, adapting
// TableLeaderboardRow into the shared LeaderboardRowCard shape (via
// table-card-row.ts) instead of LeaderboardRow's. Kept as its own small component rather than making
// LeaderboardList generic over both row types -- the two segments' rows
// come from genuinely different sources (season scores vs. Predict the
// Table scores) and the open-state logic is a few lines, not worth
// abstracting a shared list wrapper over.

export function TableLeaderboardList({
  rows,
  scored,
  tablesVisible,
}: {
  rows: readonly TableLeaderboardRow[];
  scored: boolean;
  /** Whether other players' tables can be opened yet (issue #214 D5). */
  tablesVisible: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((row) => (
        <LeaderboardRowCard
          key={row.playerId}
          row={toTableCardRow(row, tablesVisible)}
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
