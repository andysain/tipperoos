---
type: concept
title: Verification Scripts
description: Scripted simulation scripts (scripted integration tests) for competition bootstrap, scope isolation, and other cross-system scenarios that cannot be unit-tested.
tags: [testing, verification, scripts, simulation, integration]
---

# Verification Scripts

Scripted simulations are the testing strategy's §1b layer — integration-level verification for cross-system scenarios that span migrations, RPCs, and multiple scripts. These run against the **staging** Supabase project (there's no local Postgres stack) and are **not CI gates** — they are run manually before trusting a flow against real data.

## `verify-bootstrap-competition.mjs`

Tests the full bootstrap flow:

1. Bootstraps a fresh competition + admin via the `create_competition_with_admin()` RPC
2. Verifies both rows exist in the database
3. Tests the collision guard (refuses to create a competition with a duplicate code)
4. Tests that a PIN-less login fails
5. Tests `set-competition-code.mjs`'s multi-competition selector
6. Cleans up all inserted rows in a `finally` block

## `verify-competition-scope-isolation.mjs`

Proves that `scoresForCompetition` and `picksForMatch` never leak data between competitions:

1. Seeds two competitions that tip the **same** real-world match
2. Reads each competition's scores/picks using the sanctioned helpers
3. Asserts each competition sees only its own players' rows (exact count and player id assertions)
4. Cleans up all rows in a `finally` block

## Related

- [Testing Standards](standards.md)
- [Competition Bootstrap](../competitions/bootstrap.md)
- [Competition Scope Model](../competitions/scope-model.md)
