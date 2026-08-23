"use client";

import { useState } from "react";
import type { LeaderboardRow } from "@/lib/leaderboard/board";
import { LeaderboardRowCard } from "./LeaderboardRowCard";

/**
 * Owns which row is open.
 *
 * `docs/adr/0012-leaderboard-view.md` D11 chose the tap-to-open panel over an
 * always-visible stat line on one guarantee: _"One card is open at a time, so
 * the list never doubles in height."_ The state lived in each row, so every
 * panel could be open at once and the guarantee was never true -- which also
 * meant two full-width panels could stack in a single viewport on a page
 * whose subject is the ranking.
 */
export function LeaderboardList({
  rows,
  scored,
}: {
  rows: readonly LeaderboardRow[];
  scored: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const anyMovement = rows.some((row) => row.movement !== null);

  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((row) => (
        <LeaderboardRowCard
          key={row.playerId}
          row={row}
          scored={scored}
          anyMovement={anyMovement}
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
