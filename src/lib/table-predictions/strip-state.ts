// Pick Board's permanent Table Prediction Strip (issue #156) -- pure
// state-derivation so TablePredictionStrip.tsx is a dumb renderer and the
// branching here is golden-value testable per
// docs/standards/TESTING_STANDARD.md §1/§1a.
//
// Gates on `submittedAt`, never on `editability.locked` -- rules.ts returns
// `locked: false` unconditionally for a Late Joiner (issue #156's decision
// log), so gating the Champion's visibility on `locked` would hide a Late
// Joiner's own Champion from them permanently. `editability.editable`
// independently controls only the untidy-Bands warning (issue #157's UI
// pass: only actionable pre-lock, since the Bands are already locked in
// once submitted_locked), never whether the Champion/position/score show
// at all -- those are live and continuous regardless of lock status
// (CLAUDE.md: "computed continuously through the season"), so both
// submitted states carry the same leaguePosition/score fields.

import type { TablePredictionEditability } from "./rules";

export interface TablePredictionStripTeam {
  id: string;
  name: string;
  shortCode: string | null;
}

export type TablePredictionStripState =
  | { kind: "not_submitted" }
  | {
      kind: "submitted_editable";
      champion: TablePredictionStripTeam;
      bandsUntidy: boolean;
      leaguePosition: number | null;
      score: number | null;
    }
  | {
      kind: "submitted_locked";
      champion: TablePredictionStripTeam;
      leaguePosition: number | null;
      score: number | null;
    }
  | { kind: "hidden" };

export interface TablePredictionStripInput {
  prediction: { submittedAt: string | null; skipped: boolean } | null;
  editability: TablePredictionEditability;
  championTeam: TablePredictionStripTeam | null;
  bandCountsOk: boolean;
  leaguePosition: number | null;
  /**
   * Issue #157: the stored Predict the Table score -- computed
   * continuously through the season (CLAUDE.md), so it's shown in both
   * submitted states, not gated on `editability.locked` like everything
   * else that's Champion-adjacent (see the file-level comment). Null
   * before the first cohort recompute has ever run for this player.
   */
  score: number | null;
}

export function deriveTablePredictionStripState(
  input: TablePredictionStripInput,
): TablePredictionStripState {
  const {
    prediction,
    editability,
    championTeam,
    bandCountsOk,
    leaguePosition,
    score,
  } = input;

  // Skipped is final and never reverses (CLAUDE.md's Predict the Table
  // section has no "un-skip" path) -- checked ahead of everything else.
  if (prediction?.skipped) return { kind: "hidden" };

  // A null `prediction` (never touched the flow) reads the same as an
  // un-submitted one -- both fall through to the not-submitted branch below.
  if (prediction?.submittedAt == null) {
    return editability.editable
      ? { kind: "not_submitted" }
      : { kind: "hidden" };
  }

  // Champion Band not holding exactly one team -- either never assigned, or
  // (defensively) the capture UI's "a Band can never exceed its target size"
  // invariant was somehow violated. Either way there's no Champion to show.
  if (!championTeam) return { kind: "hidden" };

  if (editability.editable) {
    return {
      kind: "submitted_editable",
      champion: championTeam,
      bandsUntidy: !bandCountsOk,
      leaguePosition,
      score,
    };
  }

  return {
    kind: "submitted_locked",
    champion: championTeam,
    leaguePosition,
    score,
  };
}
