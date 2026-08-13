export interface BreakdownRow {
  label: string;
  detail?: string;
  points: number | null;
}

export const MATCH_SCORING_TERMS = [
  { label: "Right result", points: 3 },
  { label: "Right goal difference", points: 2 },
  { label: "Home team's score", points: 1 },
  { label: "Away team's score", points: 1 },
] as const;

export const WRONG_WAY_ROUND_POINTS = 1;
export const NO_PICK_POINTS = 0;

export function getMatchBreakdown(
  pickHome: number | null,
  pickAway: number | null,
  resultHome: number,
  resultAway: number,
): { wrongWayRound: boolean; rows: BreakdownRow[]; total: number } {
  if (pickHome === null || pickAway === null) {
    return { wrongWayRound: false, rows: [], total: NO_PICK_POINTS };
  }

  const pickResult = Math.sign(pickHome - pickAway);
  const result = Math.sign(resultHome - resultAway);
  const wrongWayRound =
    pickHome === resultAway && pickAway === resultHome && pickHome !== pickAway;

  if (wrongWayRound) {
    return { wrongWayRound, rows: [], total: WRONG_WAY_ROUND_POINTS };
  }

  const rows: BreakdownRow[] = [
    {
      label: MATCH_SCORING_TERMS[0].label,
      points: pickResult === result ? MATCH_SCORING_TERMS[0].points : null,
    },
    {
      label: "Right goal difference",
      points:
        pickHome - pickAway === resultHome - resultAway && pickResult === result
          ? MATCH_SCORING_TERMS[1].points
          : null,
    },
    {
      label: "Home team's score",
      detail:
        pickResult !== result ? "The result must also be right" : undefined,
      points:
        pickResult === result && pickHome === resultHome
          ? MATCH_SCORING_TERMS[2].points
          : null,
    },
    {
      label: "Away team's score",
      detail:
        pickResult !== result ? "The result must also be right" : undefined,
      points:
        pickResult === result && pickAway === resultAway
          ? MATCH_SCORING_TERMS[3].points
          : null,
    },
  ];

  return {
    wrongWayRound,
    rows,
    total: rows.reduce((sum, row) => sum + (row.points ?? 0), 0),
  };
}
