import type { Route } from "next";
import type { TableLeaderboardRow } from "@/lib/leaderboard/table-board";
import {
  BOLD_CALL_BONUS,
  MAX_BOLD_CALLS,
  MAX_PREDICT_TABLE_SCORE,
  PLACEMENT_POINTS_BY_DISTANCE,
  TABLE_BANDS,
  TOTAL_TEAMS,
} from "@/lib/scoring/predict-table";
import type { LeaderboardCardRow } from "./LeaderboardRowCard";

// The Predict the Table segment's row mapping (issue #171,
// docs/adr/0012-leaderboard-view.md D13), lifted out of
// TableLeaderboardList so its decisions -- now including the panel link
// (issue #214) -- can be tested without a component-testing library.

const MAX_PLACEMENT_SCORE = TOTAL_TEAMS * PLACEMENT_POINTS_BY_DISTANCE[0];
const MAX_BAND_BONUS_SCORE = TABLE_BANDS.reduce(
  (sum, band) => sum + band.bonus,
  0,
);
const MAX_BOLD_CALL_SCORE = MAX_BOLD_CALLS * BOLD_CALL_BONUS;

/**
 * The card a Predict the Table row hands LeaderboardRowCard. `tablesVisible`
 * is the peer-visibility rule at page level (issue #214 D5): before the
 * deadline no peer row offers a link at all -- the comparison route would
 * refuse it, and a link that leads to a refusal is a dead link.
 */
export function toTableCardRow(
  row: TableLeaderboardRow,
  tablesVisible: boolean,
): LeaderboardCardRow {
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
    // Streaks are a Season-segment stat (issue #217).
    streakBadge: null,
    panelStats: [
      {
        value: `${row.placementScore}/${MAX_PLACEMENT_SCORE}`,
        label: "Placement",
      },
      {
        value: `${row.bandBonusScore}/${MAX_BAND_BONUS_SCORE}`,
        label: "Bands",
      },
      {
        value: `${row.boldCallScore}/${MAX_BOLD_CALL_SCORE}`,
        label: "Bold calls",
      },
    ],
    // Your own row goes to your own table; another player's row goes to the
    // comparison, but only once tables are visible (issue #214).
    panelLink: row.isViewer
      ? { href: "/predict-table" as Route, label: "See your table" }
      : tablesVisible
        ? {
            href: `/predict-table/${row.playerId}` as Route,
            label: `See ${row.displayName}'s table`,
          }
        : null,
  };
}
