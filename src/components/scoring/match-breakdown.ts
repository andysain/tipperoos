import { MATCH_SCORING_TERMS, scoreMatch } from "@/lib/scoring/match";

export interface BreakdownRow {
  label: string;
  detail?: string;
  points: number | null;
}

export function getMatchBreakdown(
  pickHome: number | null,
  pickAway: number | null,
  resultHome: number,
  resultAway: number,
): { wrongWayRound: boolean; rows: BreakdownRow[]; total: number } {
  const score = scoreMatch(pickHome, pickAway, resultHome, resultAway);

  if (!score.hasPick || score.breakdown.wrongWayRound) {
    return {
      wrongWayRound: score.breakdown.wrongWayRound,
      rows: [],
      total: score.points,
    };
  }

  const resultWrong = score.breakdown.result === null;
  const rows: BreakdownRow[] = [
    {
      label: MATCH_SCORING_TERMS[0].label,
      points: score.breakdown.result,
    },
    {
      label: MATCH_SCORING_TERMS[1].label,
      points: score.breakdown.goalDifference,
    },
    {
      label: MATCH_SCORING_TERMS[2].label,
      detail: resultWrong ? "The result must also be right" : undefined,
      points: score.breakdown.homeScore,
    },
    {
      label: MATCH_SCORING_TERMS[3].label,
      detail: resultWrong ? "The result must also be right" : undefined,
      points: score.breakdown.awayScore,
    },
  ];

  return { wrongWayRound: false, rows, total: score.points };
}
