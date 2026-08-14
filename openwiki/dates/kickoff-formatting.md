---
type: concept
title: Kickoff Date Formatting
description: UTC-to-local timezone kickoff labels with overnight-case annotation, countdown display with coarsening logic, and separation of decomposition from formatting for testability.
tags: [dates, kickoff, timezone, countdown, formatting]
---

# Kickoff Date Formatting

The `src/lib/dates/kickoff-format.ts` module handles two related display needs: absolute kickoff labels and relative countdowns.

## Absolute kickoff formatting

`formatKickoffInTimeZone(kickoffUtcIso, timeZone)` produces human-readable kickoff labels.

### Format

`"Sat 12 Sep, 7:30pm"` — weekday, short date, 12-hour time with am/pm.

### Overnight case

When the local-time hour is before 6am, the previous day is annotated: `"Sun 13 Sep, 12:00am (Sat night)"`. This addresses the Australian user experience: a UK Saturday afternoon kickoff is the small hours of Sydney's Sunday morning.

The detection:

```typescript
const OVERNIGHT_HOUR_CUTOFF = 6;
if (hour24 < OVERNIGHT_HOUR_CUTOFF) {
  // Add "(<previous weekday> night)"
}
```

## Countdown formatting

`formatCountdown(targetUtcIso, nowUtcMs)` produces a relative countdown to a UTC instant.

### Coarsening

| Remaining time | Display                      |
| -------------- | ---------------------------- |
| ≥ 24 hours     | `"2d 4h"` (days + hours)     |
| 1–24 hours     | `"3h 12m"` (hours + minutes) |
| < 1 hour       | `"12m"` (minutes only)       |
| Past target    | `"0m"`                       |

The branch is on the decomposed parts, not on a raw millisecond threshold: `days > 0` wins first, then `hours > 0`, else minutes only.

### Decomposition

`decomposeCountdown(msRemaining)` is separated from the string formatting so the boundary math (rollover at exactly 24h, clamping a past target to zero) can be golden-value tested independently:

```typescript
function decomposeCountdown(msRemaining: number): CountdownParts {
  return { days, hours, minutes };
}
```

Never negative — a past target decomposes to all zeros.

## Testability

The decomposition function is tested independently from the string formatter, following the golden-value discipline:

- `decomposeCountdown(test)` → `{ days: 1, hours: 3, minutes: 12 }` (assert specific numbers)
- `formatCountdown(target, now)` → `"1d 3h"` (assert specific string)

## Related

- [Timezone Handling](../navigation/timezone.md)
- [Testing Standards](../testing/standards.md)
