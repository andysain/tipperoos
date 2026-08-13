---
type: concept
title: Gameweek Resolution
description: Current gameweek derivation per request — lowest-numbered gameweek with an open tipped match, falling back to highest-numbered gameweek with any tipped match.
tags: [gameweek, resolution, current-gameweek, adr-0007]
---

# Gameweek Resolution

The current gameweek is **derived per request**, never flagged with an `is_current` column on the `gameweeks` table. This self-healing approach means a missed job can't leave the flag confidently wrong.

## Resolution algorithm (`src/lib/gameweeks/resolve.ts`)

```
resolveCurrentGameweek(candidates, now):

  // Phase 1: find lowest-numbered gameweek with an open slot
  for each gameweek in sorted ascending order:
    if slot 1 is open OR slot 2 is open:
      return gameweek.number

  // Phase 2: fallback — highest-numbered gameweek with any tipped match
  for each gameweek in sorted ascending order:
    if slot 1 or slot 2 has a tipped match:
      fallback = gameweek.number

  return fallback  // null if no gameweek has ever had tipped matches
```

### Slot states

```typescript
interface GameweekSlot {
  matchId: string | null; // null = Skipped Slot
  kickoffTime: Date | null; // null iff matchId is null
  voidedAt: Date | null; // set when postponed after lock
}
```

- **Open**: has a matchId, not voided, and kickoff is more than 5 minutes away
- **Locked**: has a matchId, kickoff is within or past the 5-minute window
- **Skipped**: matchId is null (pre-lock postponement)
- **Voided**: voidedAt is set

## DB glue (`src/app/_lib/gameweek-access.ts`)

`resolveCurrentGameweekForCompetition()` wraps the resolver with Supabase queries:

1. Fetch current season
2. Load all gameweeks for the competition
3. Collect all match IDs, fetch kickoff times
4. Build `CandidateGameweek[]` with `GameweekSlot` objects
5. Call pure `resolveCurrentGameweek()`

All DB-fetching is deliberately outside `src/lib/` — the pure decision logic is what gets golden-value tested in `resolve.test.ts`.

## Why derive, not flag?

> "A missed job leaves a flag confidently wrong, where this self-heals from kickoff times every request."

An `is_current` column requires a cron job to advance it. If the job fails, the wrong gameweek stays "current." Deriving from kickoff times means the correct gameweek is always resolved, even if seeding or sync is delayed.

## Test coverage

`src/lib/gameweeks/resolve.test.ts` covers:

- Standard progression through a season
- Skipped slots (pre-lock postponement)
- Voided matches (post-lock postponement)
- Edge before first gameweek
- Edge after last gameweek
- All slots locked → fallback mode

## Related

- [Pick Board Overview](../pick-board/overview.md)
- [Match Selection Rules](../match-selection/rules.md)
- [ADR-0007: Home Surface and Pick Entry](../../docs/adr/0007-home-surface-and-pick-entry.md)
