#!/usr/bin/env bash
# Invoked by .github/workflows/pr-review.yml once per lane (correctness,
# security, spec-conformance). Expects LANE, PR_NUMBER, ANTHROPIC_API_KEY,
# GH_TOKEN in the environment, and $RUNNER_TEMP/shared-context.md to exist.
#
# The prompt is piped in via stdin, never interpolated through a GitHub
# Actions ${{ }} expression -- gh pr diff output (already baked into
# shared-context.md) can contain arbitrary characters, and string-substituting
# that into a shell command line is a real injection vector.
set -euo pipefail

BLOCK_FILE="$RUNNER_TEMP/block-${LANE}.txt"
rm -f "$BLOCK_FILE"

{
  cat "$RUNNER_TEMP/shared-context.md"
  echo
  cat ".github/claude/review/${LANE}.md"
  echo
  echo "Your block-file path if you need it (see the procedure below): ${BLOCK_FILE}"
  echo
  cat ".github/claude/review/_procedure.md"
} | claude -p \
  --model claude-sonnet-5 \
  --effort low \
  --max-turns 12 \
  --bare \
  --permission-mode acceptEdits \
  --allowedTools "Read,Grep,Glob,Edit,Write,Bash(git add *),Bash(git commit *),Bash(git diff *),Bash(git log *),Bash(git status),Bash(gh pr comment *),Bash(npm run typecheck),Bash(npm run lint),Bash(npm run test),Bash(npm run build)"
