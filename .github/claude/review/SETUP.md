# PR review automation — one-time setup

`.github/workflows/pr-review.yml` was drafted by an agent but deliberately
not committed or pushed by it — `AGENTS.md` requires changes under
`.github/workflows/**` to be applied by Andy directly. Everything else in
`.github/claude/review/` is not CODEOWNERS-gated and was merged normally.

## 1. Add the two required secrets

```bash
gh secret set ANTHROPIC_API_KEY --repo andysain/tipperoos
# paste your key from platform.claude.com when prompted

gh secret set GH_PAT_AGENT --repo andysain/tipperoos
# paste the same fine-grained PAT already in day-to-day use for `gh auth`
# (Administration: No access). Must be a real PAT, not GITHUB_TOKEN -- a
# push authenticated with the default token doesn't trigger other workflow
# runs, so the fix commit would never re-trigger this same check and the PR
# would hang on a stale result.
```

## 2. Add the workflow file

```bash
cp .claude/worktrees/post-merge-review-draft/.github/workflows/pr-review.yml .github/workflows/
git checkout -b ci/pr-review-workflow
git add .github/workflows/pr-review.yml
git commit -m "ci: add PR review workflow (blocking, 3 Sonnet lanes)"
git push -u origin ci/pr-review-workflow
gh pr create --title "ci: add PR review workflow" --body "Adds the workflow file for the review automation set up in .github/claude/review/. Needs CODEOWNERS approval since it's under .github/workflows/."
```

This needs your own CODEOWNERS approval to merge, same as any other
workflow change.

## 3. Make it a required check

In GitHub: **Settings → Rules → Rulesets → (the ruleset on `main`) → Require
status checks to pass → add `review`** (the job name in
`pr-review.yml`), alongside the existing `verify` and `Vercel` checks. This
is the actual step that makes it _block_ merge rather than just run — agent
credentials can't touch branch-protection settings, so this has to be you.

## 4. Verify

Open a small test PR after this lands and confirm a "PR review" check
appears, runs 3 sequential steps (Correctness / Security / Spec-conformance
lanes), and the PR either merges cleanly (nothing found) or gets a fix
commit pushed to it with a comment explaining why.

## Cost / latency expectation

Adds roughly 2–5 minutes of agent latency to every PR before it can merge
(3 sequential `--effort low`, capped `--max-turns 12` lanes) — no added
_human_ latency, since nothing here waits on you except the pre-existing
CODEOWNERS-gated paths. This is deliberately a blocking check, not an
after-the-fact comment: the goal is to stop unreviewed code from reaching
`main` (which deploys straight to production), not just to shorten the
cleanup window after it already has.
