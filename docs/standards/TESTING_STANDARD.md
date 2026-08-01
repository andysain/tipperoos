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

| Job | Package |
|---|---|
| Backend/DB client | `@supabase/supabase-js` (server-only, see `src/lib/supabase/server.ts`) |
| Styling | Tailwind CSS |
| PIN hashing | Node's built-in `crypto.scrypt` (no dependency) |
| Testing | Vitest |

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
