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

## Database schema

Schema is managed as Supabase CLI migrations under `supabase/migrations/`. To apply the
latest migrations to a linked project:

```bash
supabase link --project-ref <ref>
supabase db push
```

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

If an environment has more than one competition (once the #70 bootstrap script exists), the script
lists them and prompts for which one to set — and refuses to set a code that another competition in
that environment already uses, since the login flow could not then tell them apart.
