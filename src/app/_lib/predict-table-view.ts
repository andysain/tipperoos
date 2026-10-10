// What /predict-table shows each viewer (issue #226). A pure decision kept
// beside the page's other glue in src/app/_lib (like #214's gate), with a
// branch test over every case -- the page only renders what it returns.
//
//   "flow"               PredictTableFlow as before: the capture board, or
//                        the Late Joiner "You skipped" screen.
//   "single"             your table scored against the real one (S1, S3).
//   "not-submitted"      on time but never submitted before the deadline:
//                        a message, no board -- no table to show (S2).
//   "awaiting-standings" submitted and locked, but nothing to score
//                        against yet: the unscored Bands and a caption (S4).

export type PredictTableView =
  "flow" | "single" | "not-submitted" | "awaiting-standings";

export function decidePredictTableView(params: {
  /** On-time and past the deadline. A Late Joiner is never locked. */
  locked: boolean;
  isLateJoiner: boolean;
  isSkipped: boolean;
  /** A member of the scored cohort: submitted and not skipped. */
  hasSubmittedTable: boolean;
  /** All 20 standings exist, so tables can be scored. */
  standingsComplete: boolean;
  /** `?edit=1` -- honoured for a Late Joiner only (S3). */
  editRequested: boolean;
}): PredictTableView {
  const {
    locked,
    isLateJoiner,
    isSkipped,
    hasSubmittedTable,
    standingsComplete,
    editRequested,
  } = params;

  // S3: a Late Joiner can always edit. They see their scored table when
  // they have one, and the capture board (or skipped screen) otherwise.
  if (isLateJoiner) {
    return hasSubmittedTable &&
      standingsComplete &&
      !editRequested &&
      !isSkipped
      ? "single"
      : "flow";
  }

  // On time, before the deadline: still filling it in.
  if (!locked) return "flow";

  // On time, after the deadline (S1, S2, S4). `?edit=1` is ignored: the
  // server refuses an on-time player's edits once locked.
  if (!hasSubmittedTable) return "not-submitted";
  return standingsComplete ? "single" : "awaiting-standings";
}
