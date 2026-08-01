<!-- Appended by scripts/review/local-pr-review.mjs after every lane file below. -->

## What to do with what you find

1. Only inspect files actually touched by the diff above, plus one hop of
   files they directly import/call if you genuinely need it for context. Do
   not do a full repository sweep — you're reviewing one branch's diff
   against `main`, not auditing the codebase.
2. **Nothing found in your lane**: print a one-line summary to stdout (e.g.
   "correctness: no issues found") and stop. Make no file changes.
3. **Found a genuine, safely-fixable bug**: make the smallest change that
   fixes it — don't refactor, don't fix unrelated things you notice, don't
   add speculative tests beyond what `docs/standards/TESTING_STANDARD.md`
   §1 requires for the file you touched. Then `git add` and `git commit`
   the fix (the pre-commit hook re-runs typecheck/lint/test automatically —
   if it fails, fix the actual problem, don't work around it). Print a
   one-line summary of what you changed and why. Don't push — the wrapper
   script handles that.
4. **Found something real but you can't safely fix it** (needs a product
   decision, or your fix would be a guess): write one line —
   `BLOCK: <reason>` — to the block-file path given to you above, and print
   the same reason to stdout. Don't create a block file for anything you're
   not genuinely confident is a real, unresolved problem.
5. Never push. Never modify anything under `.github/workflows/**`,
   `CODEOWNERS`, or branch-protection settings — if you believe one of
   those needs to change, print that instead of touching it.
6. This lane is a bug/security/spec-conformance backstop, not a style pass.
   If you're not confident something is a real problem (vs. a stylistic
   preference, or a hypothetical that can't actually happen given how this
   code is actually called), don't block or fix it — mention it in your
   stdout summary as a lower-confidence note instead.
