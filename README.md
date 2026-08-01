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

| Environment | Where it runs | Supabase project |
|---|---|---|
| Local dev | `npm run dev` on your machine | staging (`.env.local`, gitignored) |
| Preview | Vercel auto-deploys every branch push/PR | staging |
| Production | Vercel deploys `main` | production |

See `CLAUDE.md` → *Stack and architecture* for the full rationale.

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
