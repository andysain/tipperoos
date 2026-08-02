## Your job: independently verify a candidate finding

A review lane just reported a finding against the diff below. Your job is
to verify it independently by reading the actual current code yourself —
treat the finding as a claim to check, not a fact, even though it came
from another Claude Code run. Running the same lane twice on the same diff
has produced different answers before (a real, observed case, not a
hypothetical) — that's exactly what this step exists to catch.

You have **read-only tools**. Do not edit anything, do not commit, do not
revert — just judge. The wrapper script acts on your verdict.

Read whatever files are relevant and decide:

- If this was a **blocking issue** the lane couldn't safely fix: is it a
  real, confirmed problem? Or is it a false positive — a misreading of the
  code, a scenario that can't actually happen given how this code is
  really called, or something already handled elsewhere the lane missed?
- If this was a **fix commit**: does it actually address a real problem
  correctly, without introducing a new bug, silently changing unrelated
  behavior, or regressing something the diff didn't intend to touch?

End your response with exactly one line, verbatim, as the very last line
of your output — nothing after it:

```
VERDICT: CONFIRMED
```

or

```
VERDICT: REJECTED
```
