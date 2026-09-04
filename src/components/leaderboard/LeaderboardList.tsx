"use client";

import { useState } from "react";
import type { Route } from "next";
import type { LeaderboardRow } from "@/lib/leaderboard/board";
import { LeaderboardRowCard, type LeaderboardCardRow } from "./LeaderboardRowCard";

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
function toCardRow(row: LeaderboardRow): LeaderboardCardRow {
  return {
    playerId: row.playerId,
    displayName: row.displayName,
    emoji: row.emoji,
    isViewer: row.isViewer,
    rank: row.rank,
    ineligibleLabel: row.isBot ? "Bot" : null,
    movement: row.movement,
    pointsDisplay: String(row.points),
    pointsSuffix:
      row.pointsPerGameweek !== null
        ? `${row.pointsPerGameweek.toFixed(1)}/wk`
        : null,
    mutePoints: row.isBot,
    panelStats: [
      // "Exact score", not "Spot on": the app had four names for one
      // concept. "Right result" already matches MATCH_SCORING_TERMS[0], so
      // the others conform to the engine's vocabulary rather than inventing
      // panel-local words. Both counts carry their denominator -- a bare
      // count reads as a second ranking, and a Late Joiner's 5 means
      // something different from an on-time player's 5 (D10).
      { value: `${row.exactTips} of ${row.matchesScored}`, label: "Exact score" },
      { value: `${row.correctResults} of ${row.matchesScored}`, label: "Right result" },
      { value: String(row.gameweeksPlayed), label: "Weeks" },
    ],
    panelLink: {
      href: `/picks/${row.playerId}` as Route,
      label: `See ${row.isViewer ? "your" : `${row.displayName}'s`} picks`,
    },
  };
}

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
          row={toCardRow(row)}
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
