<!-- Appended by run-lane.sh after every lane file below. -->

## What to do with what you find

1. Only inspect files actually touched by the diff above, plus one hop of
   files they directly import/call if you genuinely need it for context. Do
   not do a full repository sweep — you're reviewing one PR's diff, not
   auditing the codebase.
2. **Nothing found in your lane**: run
   `gh pr comment $PR_NUMBER --body "..."` once, summarizing what you
   checked. Make no file changes. Stop.
3. **Found a genuine, safely-fixable bug**: make the smallest change that
   fixes it — don't refactor, don't fix unrelated things you notice, don't
   add speculative tests beyond what `docs/standards/TESTING_STANDARD.md`
   §1 requires for the file you touched. Then:
   - `git add` and `git commit` the fix (the pre-commit hook re-runs
     typecheck/lint/test automatically — if it fails, fix the actual
     problem, don't work around it).
   - **Do not `git push`.** The workflow pushes once, after all three
     lanes have finished, so lanes never race to push to the same branch.
   - `gh pr comment $PR_NUMBER --body "..."` explaining the bug and what
     you changed, so a human reading the PR later can see why the diff
     grew.
4. **Found something real but you can't safely fix it** (needs a product
   decision, or your fix would be a guess): write one line —
   `BLOCK: <reason>` — to the block-file path given to you above, and also
   leave a `gh pr comment`. This fails the check and stops the PR merging
   until a human resolves it; don't create a block file for anything you're
   not genuinely confident is a real, unresolved problem.
5. Never push directly. Never modify anything under
   `.github/workflows/**`, `CODEOWNERS`, or branch-protection settings — if
   you believe one of those needs to change, say so in your PR comment
   instead of touching it.
6. This lane is a bug/security/spec-conformance backstop, not a style pass.
   If you're not confident something is a real problem (vs. a stylistic
   preference, or a hypothetical that can't actually happen given how this
   code is actually called), don't block or fix it — mention it in your
   comment as a lower-confidence note instead.
