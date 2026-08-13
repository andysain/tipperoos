---
type: concept
title: Critical Module Guard
description: CI-enforced gate requiring paired test changes, minimum literal-value assertions, and test-first commit ordering for src/lib/**.
tags: [testing, ci, guard, golden-value, test-first]
---

# Critical Module Guard

The critical-module guard at `scripts/ci/critical-module-guard.mjs` enforces the golden-value/test-first discipline for `src/lib/**` (the consequence-critical modules named in TESTING_STANDARD.md section 1).

## What it checks

On every PR that touches `src/lib/**`:

### 1. Paired test required

Any changed `src/lib/**/*.ts` (non-test) must have a corresponding test change listed in the same diff. A changed implementation without a changed test = FAIL.

### 2. Minimum 6 literal-value assertions

The paired test file must contain at least 6 occurrences of `.toBe(` or `.toEqual(` followed by a numeric literal. This prevents tests that exist but don't assert specific expected values.

### 3. Test-first discipline

The test file's first commit in the PR must precede the implementation file's first commit — proven via `git log --reverse --format=%H`. This proves the expected values were decided before (or independently of) the implementation, rather than written to match whatever the code happened to produce.

## What it doesn't prove

A test existing and passing doesn't prove it asserts the _right_ value. The guard checks three things a self-consistent-but-wrong pair (implementation and test written in the same pass) can't fake as easily.

## Running locally

```bash
GITHUB_BASE_REF=main node scripts/ci/critical-module-guard.mjs
```

## Known limitation

A brand-new `src/lib/**` file (one that didn't exist before this PR) cannot literally satisfy the test-first check: there is no prior commit on the base branch that touched the test file, so `git log --reverse --format=%H BASE_REF..HEAD -- "<testFile>"` returns the same commit as the implementation. The guard handles this implicitly — it accepts same-commit ties (a test and implementation committed together), because that's the closest approximation to test-first for an entirely new module. The guard's real value surfaces on **subsequent** changes to existing modules, where an agent that modifies implementation without enlarging or adjusting the test is caught immediately.

## Secondary gate: CODEOWNERS

Beyond the CI guard, the `.github/CODEOWNERS` file requires **explicit human approval** for any change to `src/lib/**`. This means a PR with code changes to these modules cannot be merged by automation alone — a human must review and approve it. This is the second line of defense against the self-consistent-but-wrong pattern the CI guard targets.

## Scope

Only runs on PR events (skipped on `main` branch pushes). Instantly no-ops (exit 0) if the diff doesn't touch `src/lib/**`.

## Related

- [Testing Standards](standards.md)
- [CI Workflow](../standings-sync/github-actions.md)
