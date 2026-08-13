---
type: concept
title: Scripts Overview
description: Inventory of operational scripts for bootstrap, seeding, verification, and CI — plus the shared library mirror for server-only bypass.
tags: [scripts, bootstrap, seed, verification, ci, cli]
---

# Scripts Overview

The `scripts/` directory contains one-off operational scripts and the shared library that mirrors `src/lib/` logic for use outside Next.js.

## Operational scripts

| Script                          | Purpose                                                  | Run when                                         |
| ------------------------------- | -------------------------------------------------------- | ------------------------------------------------ |
| `bootstrap-competition.mjs`     | Creates a new competition + its admin atomically via RPC | Once per new competition                         |
| `set-competition-code.mjs`      | Sets/rotates a competition's hashed code                 | Once per environment after migration             |
| `seed-fixtures.mjs`             | Seeds teams and all 380 fixtures from football-data.org  | Once per season per environment                  |
| `seed-gameweek-1-selection.mjs` | Seeds Gameweek 1's tipped matches                        | Once per season (no previous GW to resolve from) |

## Verification scripts

| Script                                   | Purpose                                                                            |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| `verify-bootstrap-competition.mjs`       | Proves the bootstrap RPC + collision guard work correctly (staging, self-cleaning) |
| `verify-competition-scope-isolation.mjs` | Proves competition-scoped reads never leak data (staging, self-cleaning)           |

## CI scripts

| Script                         | Purpose                                                           |
| ------------------------------ | ----------------------------------------------------------------- |
| `ci/critical-module-guard.mjs` | PR gate: golden-value/test-first discipline for `src/lib/**`      |
| `review/local-pr-review.mjs`   | Local pre-PR quality check (runs before pushing, 16KB standalone) |

## Shared library (`scripts/lib/`)

The shared library mirrors key `src/lib/` modules for use by Node.js scripts (the originals are guarded by `import "server-only"` which throws outside Next.js).

| Module                     | Mirrors                             | Dependents                                              |
| -------------------------- | ----------------------------------- | ------------------------------------------------------- |
| `competitions.mjs`         | `src/lib/auth/competitions.ts`      | `bootstrap-competition.mjs`, `set-competition-code.mjs` |
| `scrypt-secret.mjs`        | `src/lib/auth/scrypt-secret.ts`     | All scripts needing PIN/code hashing                    |
| `signup-validation.mjs`    | `src/lib/auth/signup-validation.ts` | `bootstrap-competition.mjs`                             |
| `match-selection.mjs`      | `src/lib/match-selection/rules.ts`  | `seed-gameweek-1-selection.mjs`                         |
| `team-names.mjs`           | Inline team-name helpers            | `seed-fixtures.mjs`                                     |
| `football-data-client.mjs` | New (shared API client)             | `seed-fixtures.mjs`, `seed-gameweek-1-selection.mjs`    |
| `prompt.mjs`               | New (interactive prompts)           | `bootstrap-competition.mjs`, `set-competition-code.mjs` |

### Parity testing

`scripts/lib/parity.test.ts` ensures the script-side mirror and `src/lib/` originals produce identical outputs for the same inputs — preventing drift between the two implementations.

## Running scripts

All scripts require environment variables:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/bootstrap-competition.mjs
```

Additional env vars as needed:

- `FOOTBALL_DATA_API_KEY` — for seed scripts
- `SESSION_SECRET` — for local session tests

## Related

- [Competition Bootstrap](../competitions/bootstrap.md)
- [Standings Sync Overview](../standings-sync/overview.md)
- [Testing Standards](../testing/standards.md)
