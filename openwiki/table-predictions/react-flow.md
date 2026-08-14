---
type: concept
title: Table Prediction React Flow
description: The client-side PredictTableFlow component — state management, optimistic persistence with rollback, lock countdown, submission celebration (SubmittedMoment), and the BandsBoard rendering tree.
tags: [table-prediction, react, component, flow, bands-board, submitted-moment]
---

# Table Prediction React Flow

The client-side Table Prediction experience is composed of several React components in `src/app/predict-table/`. The main orchestrator is `PredictTableFlow.tsx`, which manages all board state and API interactions.

## Component tree

```
PredictTableFlow (state owner)
├── LockCountdown (live countdown until 31 August deadline)
├── ScoringSummary (collapsible scoring rules)
├── BandSummary (per-band counts/status)
├── BandsBoard
│   ├── UndoRow (inline undo affordance)
│   └── PlacedTeamCard × N (team cards inside bands)
└── SubmittedMoment (submission celebration overlay)
```

## State management

`PredictTableFlow` manages these state slices:

| State         | Type                              | Purpose                                 |
| ------------- | --------------------------------- | --------------------------------------- |
| `assignments` | `Record<string, BandKey>`         | Current team→Band mapping               |
| `previous`    | `Record<string, BandKey \| null>` | One-level undo history                  |
| `openBand`    | `BandKey`                         | Currently selected Band (filling phase) |
| `lifted`      | `string \| null`                  | Currently lifted team (review phase)    |
| `undo`        | `UndoState \| null`               | Undo affordance state                   |
| `justSwapped` | `[string, string] \| null`        | Flash animation for new swaps           |
| `submittedAt` | `string \| null`                  | Last submission timestamp               |
| `saveError`   | `string \| null`                  | Inline error on failed save             |

## Optimistic persistence

Every tap triggers an immediate local state update, followed by a POST to the appropriate API route:

```
persistTap(teamId, result):
  1. Apply result.assignments locally (optimistic)
  2. POST to /api/table-predictions/assign or /unassign
  3. On failure: ROLL BACK to previous state
  4. Auto-clears "submitted" status (un-confirms)
```

The rollback logic ensures the UI never shows a "saved" state that the server didn't confirm.

## Lock countdown

The `LockCountdown` component shows a live "Locks in Xd Xh" readout for on-time players. It reads `TABLE_PREDICTION_DEADLINE` (the constant `2026-08-31T14:00:00.000Z`), not a dynamic Gameweek 1 kickoff time. Uses a 60-second polling interval via `setInterval` in a `useEffect`. The text turns `warning` color when under 24 hours. Late Joiners never see a lock countdown.

## SubmittedMoment

The celebration overlay (`SubmittedMoment.tsx`) shows:

- "You're locked in!" header
- The predicted Champion team name
- Confetti animation (CSS `confetti-fall` keyframes)
- A dismiss button returning to the board view
- Subtitle: "Submitted — you can keep editing until 31 August." (references the fixed deadline, not a GW1 kickoff)

The `justSubmitted` flag briefly shows confetti across the whole flow.

## API interaction

All POSTs go through the local `postJson()` helper:

```typescript
async function postJson(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tipperoos-client": "1", // CSRF header
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: response.ok, data };
}
```

## Related

- [Capture Rules](capture-rules.md)
- [Board Logic](board-logic.md)
- [API Routes](api-routes.md)
- [Table Prediction Data Access](data-access.md)
