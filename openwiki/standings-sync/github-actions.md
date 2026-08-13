---
type: concept
title: GitHub Actions Workflows
description: CI pipeline (tests + critical-module guard) and OpenWiki auto-update workflow. No scheduled standings sync workflow exists yet.
tags: [github-actions, ci, wiki, workflows]
---

# GitHub Actions Workflows

Two workflows exist in `.github/workflows/`:

## CI (`ci.yml`)

```yaml
on:
  push:
    branches: [main]
  pull_request:
```

Runs on `ubuntu-latest` with Node 22:

1. `npm ci` — clean install
2. `npm run test` — Vitest test suite (Vercel's own build covers typecheck + lint + build)
3. **Critical-module guard** (`scripts/ci/critical-module-guard.mjs`) — only on PRs, checks:
   - Any changed `src/lib/**/*.ts` (non-test) has a paired test change in the same diff
   - The test file has ≥6 literal-value assertions (`toBe`/`toEqual` with numeric literal)
   - The test's first commit precedes the implementation's first commit (test-first discipline)

The `git checkout` uses `fetch-depth: 0` (full history) so the critical-module guard can diff and log against the base branch.

## OpenWiki Update (`openwiki-update.yml`)

Scheduled workflow for auto-updating the project wiki. Runs on a cron schedule and has `workflow_dispatch` for manual triggering. Not related to standings sync.

## Note: No scheduled sync workflow

Despite the sync endpoint (`POST /api/sync/standings`) being ready, no GitHub Actions workflow currently calls it on a schedule. Sync is **manual-only** for now (issue #11 deferred, per BUILD_PLAN.md). This will be added as a cron job on match days once match-result sync is built.

## Related

- [Standings Sync Overview](overview.md)
- [Testing Standards](../testing/standards.md)
- [Critical Module Guard](../testing/critical-module-guard.md)
