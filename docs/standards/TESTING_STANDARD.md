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
   `*.test.ts` change in the same diff. A change whose added/removed lines
   are all blank or comments (`//`, `/* */`, `*`-prefixed) is exempt — it
   can't encode a scoring bug, so a paired golden-value test change would be
   noise.
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

### 1b) Scripted simulation — the multi-step-scenario category

A **scripted simulation** is a third check category, distinct from both the
committed Vitest tests above and a one-off manual staging check: an ad hoc
script (not necessarily a `*.test.ts` file, doesn't need to live under
`src/lib/**`, and isn't subject to the golden-value guard) that drives a
scenario end-to-end across several modules — e.g. pick → lock → result →
score → corrected result → rescore, asserting totals don't drift. Canonical
exemplar: issue #22 / the Week 2 gameweek-simulation script named in
`BUILD_PLAN.md`.

Reach for it when a check genuinely spans multiple modules and neither a
unit test (too narrow — it'd just re-test each module in isolation, missing
the integration seam) nor a one-off manual staging check (not repeatable,
and the scenario has too many steps to trust by hand) fits. It isn't a
permanent CI gate by default — run it manually before trusting a pipeline
against real data (per `BUILD_PLAN.md`'s Week 2 usage) — but keep it as a
committed script under `scripts/` if it's likely to be rerun (e.g. once per
season, not just once at launch). `docs/standards/ISSUE_STANDARD.md` §3/§6
point here when an issue's done-when needs this verification method — don't
redefine the category there.

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

None of the above proves the change is _correct_, only that it's
technically valid — a further `pre-push` Husky step
(`scripts/review/local-pr-review.mjs`, see `.github/claude/review/`) runs
three low-cost Sonnet agent passes (correctness, security invariants, spec
conformance) against the diff vs. `main` before every push, and can commit
a fix locally if it finds something it can safely fix (the push is then
aborted, since git already resolved what to push before the hook ran —
just push again to include the fix). This is what actually closes the gap
left by decision 30 in `BUILD_PLAN.md`: without it, everything outside
`src/lib/**` merges with no human or agent review at all. It's a local
hook, not a server-side required check (see `BUILD_PLAN.md` decision 36 for
why, and the trade-off that implies — bypassable with `--no-verify`, unlike
`verify`/`Vercel` above).

A lane's block/fix isn't trusted on its own — when one flags something, a
separate read-only verify pass (`.github/claude/review/verify.md`) independently
re-checks it before the script actually blocks the push or keeps the fix
commit, only running when there's something to verify — and skipped
outright for a docs-only diff (every changed file a `*.md`), where a
lane's finding is trusted directly. See `BUILD_PLAN.md` decision 36's
verify-pass entries for why (a real, observed case of the same lane giving
different answers on two runs against the same diff; and why docs-only
diffs don't pay for the extra pass).

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

| Job                | Package                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| Backend/DB client  | `@supabase/supabase-js` (server-only, see `src/lib/supabase/server.ts`)                                         |
| Styling            | Tailwind CSS                                                                                                    |
| Component variants | `tailwind-variants` — for any component with more than one visual variant, see `docs/DESIGN_SYSTEM.md`          |
| Icons              | `lucide-react`, restyled to match the brand — never emoji for functional UI chrome, see `docs/DESIGN_SYSTEM.md` |
| PIN hashing        | Node's built-in `crypto.scrypt` (no dependency)                                                                 |
| Testing            | Vitest                                                                                                          |
| Formatting         | Prettier (+ `eslint-config-prettier` to kill rule overlap)                                                      |
| Git hooks          | Husky + lint-staged                                                                                             |

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

Before writing the first real example of a shape, check whether an installed
skill (`.claude/skills/`, see §9) already covers it: a Server Component or
Route Handler → `nextjs-app-router-patterns`; a migration or schema change →
`supabase-postgres-best-practices`; a non-trivial test → `vitest-testing`; a
generic/utility-type-heavy module → `typescript-advanced-types`.

- **Postgres function / RPC call** (multi-statement atomicity `@supabase/supabase-js`
  can't get via PostgREST alone): `create_competition_with_admin()` in
  `supabase/migrations/20260808000000_create_competition_with_admin.sql`,
  called from `scripts/bootstrap-competition.mjs` (issue #70). Copy its
  discipline for the next one: `security invoker` (never `definer` — the
  default PUBLIC execute grant plus `definer` is the worst combination),
  `set search_path = ''` with schema-qualified table names, and an explicit
  `revoke ... from public` / `grant ... to service_role` pair, since Postgres
  grants EXECUTE to PUBLIC by default and PostgREST exposes anything
  callable in `public` as an RPC endpoint.

## 8) Commits

Loose, not enforced by tooling: `<type>: <imperative summary>` — `feat`,
`fix`, `docs`, `refactor`, `test`, `chore`. Keeps history scannable across
sessions; not worth more ceremony than that for a solo project.

## 9) Installed skills — caveats and deviations

Seven Claude Code skills are installed (`.claude/skills/`, content in
`.agents/skills/`, tracked in `skills-lock.json`) covering this stack:
`supabase-postgres-best-practices`, `supabase-server`, `nextjs-app-router-patterns`,
`vitest-testing`, `typescript-advanced-types`, `tailwind-css`,
`mobile-responsiveness`. Most apply as-is. Two deliberate deviations to know
about so a future pass doesn't "fix" them unprompted:

- **Primary keys stay `uuid default gen_random_uuid()`.** The
  `supabase-postgres-best-practices` skill (`schema-primary-keys.md`) will
  suggest `bigint identity` or UUIDv7 for new tables, since random UUIDv4 PKs
  cause index fragmentation at scale. At this project's scale (10–20 players,
  380 fixtures/season) that cost is negligible, and every existing table
  already uses `gen_random_uuid()` (see `supabase/migrations/`) — retrofitting
  would be pure churn for no real benefit. Keep the existing convention for
  new tables too, for consistency. Its `data-upsert.md` `ON CONFLICT` guidance
  still applies as-is and is the intended shape for the idempotent `scores`
  upsert required by `CLAUDE.md`.
- **`supabase-server` mostly doesn't apply here.** That skill documents the
  separate `@supabase/server` npm package (Edge Functions, Deno, Hono
  adapters) — this repo uses plain `@supabase/supabase-js` directly inside
  Next.js Route Handlers/Server Components, not that package, so most of its
  guidance won't trigger. The one portable point: it uses the current Supabase
  key names (`SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_SECRET_KEY`), while
  `.env.example` and `src/lib/supabase/server.ts` still use the legacy
  `SUPABASE_SERVICE_ROLE_KEY` naming. Not urgent — the legacy keys still work
  — but worth a rename pass next time that file is touched, if the current
  Supabase project has the new-format keys available.
- **`supabase-postgres-best-practices`'s RLS section doesn't apply.** This
  repo's auth model is explicitly RLS-free by design (see `CLAUDE.md` →
  _Explicitly out of scope_) — enforcement lives entirely in server-side
  route logic. Ignore that skill's RLS guidance when it fires.
