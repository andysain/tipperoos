# Tipperoos

A private Premier League tipping competition — Next.js on Vercel, Supabase Postgres.

Read these first, in order:

- [`CLAUDE.md`](./CLAUDE.md) — the product spec (the **what**)
- [`BUILD_PLAN.md`](./BUILD_PLAN.md) — launch build plan and decisions log (the **how/when**)
- [`CONTEXT.md`](./CONTEXT.md) — glossary of domain terms
- [`GAPS.md`](./GAPS.md) — resolved gap-review log
- [`docs/adr/`](./docs/adr/) — architecture decision records

The previous Streamlit + Python version of this app is retired. It's fully preserved on
the `worldcup-2026-final` branch if it's ever needed again.

## Environments

| Environment | Where it runs                            | Supabase project                   |
| ----------- | ---------------------------------------- | ---------------------------------- |
| Local dev   | `npm run dev` on your machine            | staging (`.env.local`, gitignored) |
| Preview     | Vercel auto-deploys every branch push/PR | staging                            |
| Production  | Vercel deploys `main`                    | production                         |

See `CLAUDE.md` → _Stack and architecture_ for the full rationale.

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in the staging Supabase project's values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Working from a git worktree (e.g. `orca/workspaces/...`) whose `node_modules` is a
symlink out to the main checkout?** `next dev`'s default Turbopack panics on that layout:

```
FATAL: An unexpected Turbopack error occurred.
Error [TurbopackInternalError]: Symlink [project]/node_modules is invalid, it points out of the filesystem root
```

Turbopack refuses a `node_modules` symlink that resolves outside the worktree's own
directory tree. Run webpack instead, which handles it fine — no functional difference for
local dev:

```bash
npx next dev --webpack
```

(or `npm run dev -- --webpack`, equivalent). Only needed in a symlinked-`node_modules`
worktree; a normal clone with its own `npm install` never hits this.

## Database schema

Schema is managed as Supabase CLI migrations under `supabase/migrations/`. To apply the
latest migrations to a linked project:

```bash
supabase link --project-ref <ref>
supabase db push
```

## Creating a competition and its admin

A new competition — and its exactly-one Competition Admin — is created atomically with:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/bootstrap-competition.mjs
```

It prompts interactively for the competition name, the plaintext competition code (hidden
input), the admin's display name, their PIN (entered twice), and a chosen emoji, then creates
both rows in one atomic call. The admin can log in immediately — no forced-PIN-reset flag is set,
since at bootstrap the operator and the account holder are the same person at the same keyboard.
Refuses to create a competition whose code is already used by another competition in the same
environment.

It then creates the competition's three bot players (see _Seeding bots_ below). If that step
fails after the competition and admin were created, the script says so and tells you to run
`scripts/seed-bots.mjs` — the competition itself is fine and does not need recreating.

## Seeding bots

Every competition has its own three bot players — Random Bot, 1-1 Bot and Median Bot — scoped by
`players.competition_id`. Competitions created by `bootstrap-competition.mjs` get them
automatically; use this script for a competition that predates the bots, or to repair a failed
bootstrap bot step:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-bots.mjs
```

If the environment has more than one competition, it lists them and prompts for which one to
seed — it never seeds all of them, since the placeholder `competitions` row from the `#68`
migration would otherwise collect three orphan bots. Idempotent: re-running creates only whatever
is missing and never modifies an existing bot.

Once the bots exist, their picks are generated automatically by the fixture sync cycle — Random
and 1-1 file while a match is still open, the Median Bot files its crowd-consensus pick once the
match locks. No manual trigger, and nothing to run per gameweek.

## Setting a competition's code

Competition codes are stored hashed (`competitions.code_hash`), never in a migration file or
anywhere in git history. After the `#68` migration lands in an environment, that environment's
initial `competitions` row starts with an inert placeholder hash that matches nothing — set the
real code with:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/set-competition-code.mjs
```

Point the env vars at the target environment's Supabase project (staging or production — see
_Environments_ above). It prompts interactively for the plaintext code with hidden input (not
echoed to the terminal, never taken as a CLI argument, so it never lands in shell history). Run it
once per environment; staging and production should use **different** codes, so a leaked staging
code can't be reused to log into the real competition.

If an environment has more than one competition, the script lists them and prompts for which one
to set — and refuses to set a code that another competition in that environment already uses,
since the login flow could not then tell them apart.
