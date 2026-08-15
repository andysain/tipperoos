import { recomputeMatchScores } from "@/lib/scoring/match";

export type Names = Map<string, string>;

function nameOf(names: Names, playerId: string): string {
  return names.get(playerId) ?? playerId.slice(0, 8);
}

/**
 * Per-match scoring report. The "expected" column is computed by the same
 * recomputeMatchScores the driver writes, so expected and actual come from
 * identical logic — any drift between them is visible here.
 */
export function reportMatch(
  title: string,
  picks: { playerId: string; home: number; away: number }[],
  result: { home: number; away: number } | null,
  voided: boolean,
  rows: { playerId: string; points: number }[],
  names: Names,
): void {
  const expected = recomputeMatchScores({
    matchId: "report",
    result,
    voided,
    picks: picks.map((p) => ({
      playerId: p.playerId,
      pickHome: p.home,
      pickAway: p.away,
    })),
  });
  const expectedMap = new Map(expected.map((e) => [e.playerId, e.points]));
  const byPlayer = new Map(rows.map((r) => [r.playerId, r.points]));
  const resultLabel = result ? `${result.home}-${result.away}` : "(none)";
  const voidLabel = voided ? "  •  VOIDED (every picker 0)" : "";
  console.log("");
  console.log(`${title}  •  result ${resultLabel}${voidLabel}`);
  for (const pick of picks) {
    const name = nameOf(names, pick.playerId);
    const exp = expectedMap.get(pick.playerId) ?? 0;
    const actual = byPlayer.get(pick.playerId) !== undefined
      ? String(byPlayer.get(pick.playerId))
      : "—";
    const pickLabel = `${pick.home}-${pick.away}`;
    console.log(
      `  ${name.padEnd(3)}  pick ${pickLabel.padEnd(5)}  expected ${String(exp).padStart(2)}  actual ${actual.padStart(2)}`,
    );
  }
}

/**
 * Aggregated leaderboard for one competition (scoresForCompetition output —
 * each row's points is that player's running competition total), printed
 * ranked by points DESC.
 */
export function reportLeaderboard(
  title: string,
  competitionId: string,
  rows: { playerId: string; points: number }[],
  names: Names,
): void {
  const ranked = [...rows].sort((a, b) => b.points - a.points);
  console.log("");
  console.log(
    `${title}  (competition ${competitionId.slice(0, 8)}…)  ranked by total`,
  );
  for (const row of ranked) {
    console.log(
      `  ${nameOf(names, row.playerId).padEnd(3)}  total ${String(row.points).padStart(3)}`,
    );
  }
}
