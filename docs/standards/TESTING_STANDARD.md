# Testing Standard

Scaled-down for a solo, 3-week build — adapted from a mature project's
standards, not copied wholesale. The goal is the same: prevent silent drift
and regressions without adding process overhead this project's size doesn't
need.

## 1) Core principle: test-first where correctness actually matters

Not everything needs a test. Split by consequence:

- **Test-first, no exceptions**: pure logic where a silent bug either costs
  someone real points or corrupts data irreversibly — the scoring engine,
  idempotent score recomputation, the Match-2 Picker tiebreak, lock-time
  enforcement, postponement (Voided Match / Skipped Slot) handling, PIN
  hashing/lockout logic. Write the test against the expected behavior before
  or alongside the implementation, not as an afterthought once it "looks
  right" manually.
- **Test when it's cheap and the behavior is non-obvious**: API route
  handlers with real branching logic (signup validation, admin actions).
- **Don't test**: UI layout/styling, trivial pass-through components, generated
  code. Verify these by actually using the feature (see `CLAUDE.md`'s UI
  testing requirement) and `npm run build`, not a test suite.

If behavior is important enough to write down in `CLAUDE.md` or `BUILD_PLAN.md`,
it's important enough to have a test asserting it.

### 1a) Golden-value discipline for `src/lib/**` (mechanically enforced)

"A test exists and passes" doesn't prove it asserts the _right_ value —
an agent can write implementation and test in the same pass and just assert
on the code's own output, which passes trivially while encoding a bug. This
happened for real in this repo's history: `CLAUDE.md` and `BUILD_PLAN.md`
disagreed with each other on the scoring formula for a period before it was
caught. For the five test-first modules above, living under `src/lib/`, CI
mechanically enforces (`scripts/ci/critical-module-guard.mjs`, runs on every
PR touching `src/lib/**`):

1. Any changed `src/lib/**/*.ts` implementation file has a corresponding
   `*.test.ts` change in the same diff.
2. That test file contains at least 6 literal-value assertions
   (`.toBe(<number>)` / `.toEqual(<number>)`) — not just "a test exists
   somewhere," a table of named scenarios with specific expected numbers,
   hand-derived from `CLAUDE.md`'s prose.
3. The test file's first commit precedes the implementation file's first
   commit in the PR's history — test-first, checked via git log ordering,
   not just claimed. **Known limitation**: this only fails a _strict_
   violation (implementation committed, then test committed later). A new
   `src/lib/**` file's test can't literally predate the file it imports —
   `tsc` won't resolve the import — so in practice both land in the same
   commit (the local pre-commit hook requires every commit to typecheck and
   pass tests, which rules out a red-then-green two-commit sequence without
   hackier workarounds than this project's scale warrants). A same-commit
   tie passes the check. This was deliberately left as-is after a real
   attempt to tighten it hit that structural wall — see `BUILD_PLAN.md`.

None of this proves correctness on its own — a determined agent can still
hand-pick golden values that match its own bug. The part that actually
closes the gap is human: `src/lib/**` is CODEOWNERS-gated (see `AGENTS.md`),
so merging requires Andy to read the golden-value table in the test diff and
spot-check it against `CLAUDE.md`'s prose — a two-minute numeric check, not
a code review, which is what actually fits his bandwidth given he doesn't
read the Next.js/TypeScript implementation itself.

Also add at least one property/invariant test per critical module alongside
the example-based golden values where one exists (e.g. idempotency of score
recomputation, lockout still blocking after N+1 attempts) — invariants are
harder to satisfy by accident with a wrong implementation than hand-picked
examples are.

## 2) Stack

- **Vitest** for unit/integration tests — fast, TypeScript-native, no native
  build step (unlike Jest's occasional native-module friction), works cleanly
  with Next.js. Test files live colocated next to the file under test:
  `src/lib/scoring.ts` -> `src/lib/scoring.test.ts`. No mirrored `__tests__/`
  tree to keep in sync.
- No E2E framework for now (Playwright etc.) — the manual dry-run (#34) and
  mobile/UX validation pass (#38) cover the golden path at a fidelity that
  matches this project's scale. Revisit only if a real regression slips
  through that a lightweight E2E smoke test would have caught.

## 3) Validation order

Run in this order; stop at the first failure:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

`typecheck`/lint-staged/`test` run automatically on every commit via a Husky
pre-commit hook; `build` runs on pre-push. Vercel's own build (on every
push/PR, confirmed via `next.config.ts` having no `ignoreBuildErrors`/
`ignoreDuringBuilds` overrides) re-covers typecheck/lint/build independently,
so GitHub Actions CI only adds `test` and the `src/lib/**` golden-value
check (§1a) — no redundant duplicate job.

## 4) Definition of Done

A task is done only if:

- Acceptance criteria (the issue's "Done when:") are met.
- The validation sequence above passes.
- `CLAUDE.md`/`BUILD_PLAN.md`/`CONTEXT.md` are updated when product behavior,
  domain vocabulary, or a decision changed — not as a follow-up.
- No out-of-scope behavior was introduced.
- Any real risk or assumption is stated, not silently absorbed.

## 5) Approved packages

One library per job. Add a row here in the same change that adds a new
dependency for a job not yet listed — don't let a second option for an
already-covered job creep in silently.

| Job               | Package                                                                 |
| ----------------- | ----------------------------------------------------------------------- |
| Backend/DB client | `@supabase/supabase-js` (server-only, see `src/lib/supabase/server.ts`) |
| Styling           | Tailwind CSS                                                            |
| PIN hashing       | Node's built-in `crypto.scrypt` (no dependency)                         |
| Testing           | Vitest                                                                  |
| Formatting        | Prettier (+ `eslint-config-prettier` to kill rule overlap)              |
| Git hooks         | Husky + lint-staged                                                     |

`.editorconfig` was considered and deliberately skipped: its value is
cross-editor consistency for human contributors with varied IDE settings,
which doesn't apply here — every line is written by Claude Code or Andy
through the same tooling. Prettier already covers formatting consistency.

## 6) File layout

```
src/
  app/            Next.js App Router: pages, layouts, API routes
  lib/
    supabase/     server-only Supabase client factory
    ...           other server-only domain logic (scoring, auth, etc.)
```

A module used by exactly one route starts inline or beside it. Promote to
`src/lib/` the moment a second route needs the same logic — don't copy-paste
it.

## 7) Canonical exemplars

Prefer copying a working pattern over inventing a new one. As the codebase
grows, this section should name the first real example of each shape (a
server-only data-fetching pattern, a mutating API route, a form) so later
work copies it instead of drifting into a second, subtly different way of
doing the same thing.

## 8) Commits

Loose, not enforced by tooling: `<type>: <imperative summary>` — `feat`,
`fix`, `docs`, `refactor`, `test`, `chore`. Keeps history scannable across
sessions; not worth more ceremony than that for a solo project.
