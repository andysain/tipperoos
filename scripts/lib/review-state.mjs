// What a local review run's outcome means for the push, and for the
// per-branch "already reviewed" SHA that `local-pr-review.mjs` records.
//
// Pure and separate from that script purely so it can be tested: the script
// itself runs its work at import time, so a test can't load it without
// launching a review.

/**
 * @param {object} run
 * @param {boolean} run.blocked      a lane flagged something it couldn't fix, confirmed on verify
 * @param {boolean} run.fixed        a lane committed a fix, confirmed on verify
 * @param {boolean} run.laneFailed   a lane's `claude` invocation itself errored, so that lane
 *                                   reviewed nothing
 * @param {string}  run.headBeforeFixes  HEAD as the run started -- the content every lane
 *                                       actually looked at
 * @param {string}  run.headNow          HEAD now, including any fix commits
 * @returns {{ push: "allow" | "abort", record: string | null, reason: string }}
 *   `record` is the SHA to store as reviewed, or null to store nothing.
 */
export function resolveRunOutcome({
  blocked,
  fixed,
  laneFailed,
  headBeforeFixes,
  headNow,
}) {
  // An unresolved finding lives *inside* the range just reviewed. Narrowing
  // past it would mean the next push never looks at the code the block was
  // about, and sails through.
  if (blocked) return { push: "abort", record: null, reason: "blocked" };

  if (fixed) {
    // The push still aborts -- git resolved which SHA to push before the
    // hook ran, so a commit made during this run can't join it. But every
    // lane did review everything up to `headBeforeFixes` and came back
    // clean on it, so that point is genuinely reviewed. Recording it leaves
    // the next push reviewing only the fix commits instead of re-paying for
    // the whole PR: the difference between one small diff and three full
    // lane passes over every file on the branch.
    return {
      push: "abort",
      record: laneFailed ? null : headBeforeFixes,
      reason: "fixed",
    };
  }

  // A lane whose invocation errored reviewed nothing, so nothing here is
  // safe to call reviewed -- recording progress would quietly skip whatever
  // that lane would have caught. The push still goes ahead: a tooling
  // failure isn't evidence of a defect (the script's long-standing call).
  if (laneFailed) return { push: "allow", record: null, reason: "lane-failed" };

  return { push: "allow", record: headNow, reason: "clean" };
}
