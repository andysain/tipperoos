---
type: reference
title: Architecture Decision Records
description: Index of the ten ADRs this wiki cites — what each one settled, what it superseded, and which wiki pages carry its consequences.
tags: [adr, decisions, index, reference]
---

# Architecture Decision Records

The ADRs in `docs/adr/` record the hard-to-reverse, non-obvious calls. Wiki pages cite them by number constantly; this is the map. **An ADR is authoritative for intent, the code is authoritative for current state** — where they diverge, see the quickstart's divergences table.

| ADR                                                                                                       | Settled                                                                                                                     | Wiki pages                                                                                                |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [0001](../../docs/adr/0001-skip-slot-on-pre-lock-postponement.md) Skip slot on pre-lock postponement      | A fixture postponed before lock leaves the slot empty — no substitute, the gameweek runs with one tipped match              | [Voided Matches](../match-selection/voided-matches.md)                                                    |
| [0002](../../docs/adr/0002-email-optional-display-name-identity.md) Email optional, display-name identity | `display_name` is the identity key and login selector; email is optional, non-unique, notification-only                     | [Signup](../auth/signup.md), [Login Flow](../auth/login-flow.md), [Schema](../database/schema.md)         |
| [0003](../../docs/adr/0003-predict-the-table-shape.md) Predict the Table shape                            | The 7-Band model, full 20-team ordering stored, Band membership as the only scoring signal                                  | [Capture Rules](../table-predictions/capture-rules.md)                                                    |
| [0004](../../docs/adr/0004-multi-competition-foundational-scope.md) Multi-competition scope               | `competition_id` on `players` and `gameweeks` only; the two-tier admin role; server re-derives competition from the code    | [Scope Model](../competitions/scope-model.md), [Security Model](security-model.md)                        |
| [0005](../../docs/adr/0005-app-navigation-shell.md) App navigation shell                                  | Fixed bottom tab bar at every breakpoint, only real routes get a tab, tap-active scrolls to top                             | [App Shell](../navigation/app-shell.md), [How It Works](../ux/how-it-works.md)                            |
| [0006](../../docs/adr/0006-auto-selected-tipped-matches.md) Auto-selected tipped matches                  | Both matches auto-selected; supersedes the last-place-picker mechanic, whose `gameweeks` columns are retained unused        | [Match Selection Rules](../match-selection/rules.md)                                                      |
| [0007](../../docs/adr/0007-home-surface-and-pick-entry.md) Home surface and pick entry                    | `/` **is** the pick board — no hub; nothing pre-filled; `onSave` awaited, not optimistic; offline/retry states deferred     | [Pick Board Overview](../pick-board/overview.md), [Tipped Match Card](../pick-board/tipped-match-card.md) |
| [0008](../../docs/adr/0008-predict-the-table-group-fill-capture.md) Group-fill capture                    | One Band at a time, no drag-and-drop, over/under-filled Bands allowed at submission, every move persists immediately        | [Board Logic](../table-predictions/board-logic.md), [React Flow](../table-predictions/react-flow.md)      |
| [0009](../../docs/adr/0009-match-scoring-formula-and-title-eligibility.md) Match scoring formula          | The additive 0–7 formula with no exact-scoreline bonus; **bots ineligible** for the season title (reverses an earlier rule) | [Match Scoring](../scoring/match-scoring.md), [Bot Players](bot-players.md)                               |
| [0010](../../docs/adr/0010-predict-the-table-scoring.md) Predict the Table scoring                        | Placement + Band Bonus + Bold Call to a max of 200; supersedes the earlier `6 − band_distance` / +10-per-Band rule          | [Predict Table Scoring](../scoring/predict-table-scoring.md)                                              |

## Superseded rules to watch for

Older docs and comments in the tree still carry rules these ADRs replaced. If you meet one of these, the ADR wins:

- A **`6 − band_distance`** placement rule or a flat **+10 per Band** bonus → superseded by 0010.
- An **exact-scoreline bonus** or a per-match maximum of **9** → superseded by 0009.
- **Bots eligible** for the season winner title → superseded by 0009.
- **Match 2 chosen by the previous gameweek's last-placed player** → deferred by 0006.
- A **substitute fixture** rerolled after a postponement → rejected by 0001.

## Related

- [Architecture Overview](overview.md)
- [Quickstart](../quickstart.md)
- [Security Model](security-model.md)
