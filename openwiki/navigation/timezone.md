---
type: concept
title: Timezone Handling
description: Browser-detected IANA timezone via tz cookie, UTC timestamp storage, local-time rendering with overnight-case annotation, and Sydney fallback for server-side email.
tags: [timezone, kickoff, display, cookie, adr-0007]
---

# Timezone Handling

All timestamps are stored in UTC. Lock/deadline comparisons use UTC exclusively. Kickoff labels are rendered in the viewer's browser-detected local timezone.

## The timezone cookie

Managed by `src/components/nav/timezone-cookie.ts`:

| Constant               | Value                | Purpose                       |
| ---------------------- | -------------------- | ----------------------------- |
| `TIMEZONE_COOKIE_NAME` | `"tz"`               | Cookie name                   |
| `DEFAULT_TIME_ZONE`    | `"Australia/Sydney"` | Fallback before cookie exists |

### TimezoneSync component

A `"use client"` component at `src/components/nav/TimezoneSync.tsx` runs once on mount, writing the browser's `Intl.DateTimeFormat().resolvedOptions().timeZone` to the `tz` cookie. This ensures the cookie is set before any server component reads it.

### Server-side read

The Pick Board page reads the cookie via `cookies()` (Next.js server API):

```typescript
const timeZone =
  cookieStore.get(TIMEZONE_COOKIE_NAME)?.value ?? DEFAULT_TIME_ZONE;
```

## Kickoff formatting (`src/lib/dates/kickoff-format.ts`)

### `formatKickoffInTimeZone(kickoffUtcIso, timeZone)`

Produces labels like:

- `"Sat 12 Sep, 7:30pm"` — normal case
- `"Sun 13 Sep, 12:00am (Sat night)"` — overnight case (kickoff between midnight and 6am local)

The overnight case is important for Australian users: a UK Saturday afternoon kickoff is the small hours of Sunday morning in Sydney. Without the annotation, "Sun 12:00am" reads as Sunday night to most people.

### Countdown display

`formatCountdown(targetUtcIso, nowUtcMs)` coarsens with distance:

| Time remaining | Display                                |
| -------------- | -------------------------------------- |
| > 48 hours     | `"2d 4h"`                              |
| 1–48 hours     | `"3h 12m"`                             |
| < 1 hour       | `"12m"` (explicit minutes, no seconds) |
| Past           | `"0m"`                                 |

The decomposition is done by `decomposeCountdown(msRemaining)`, which is separately golden-value tested.

## Email exception

Email notifications are sent server-side with no browser to read a timezone from. They render in the fixed `DEFAULT_TIME_ZONE = "Australia/Sydney"` instead (CLAUDE.md hard constraints).

## Related

- [App Shell](app-shell.md)
- [Pick Board Overview](../pick-board/overview.md)
- [ADR-0007: Home Surface and Pick Entry](../../docs/adr/0007-home-surface-and-pick-entry.md)
