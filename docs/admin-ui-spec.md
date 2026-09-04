# Admin UI — end-to-end requirements

Status: **agreed**, 2026-09-04. No code exists yet; Phase 1 is filed as issues.

This is the _what_. It supersedes nothing in `CLAUDE.md` except where §10 says so
explicitly, and every conflict it creates with an existing documented rule is
listed there rather than resolved silently.

---

## 1. Purpose

One in-app surface, at `/admin`, that lets the person running a competition do the
routine operational jobs that currently require either a shell script or a SQL
console:

- unblock a player who has forgotten their PIN or locked themselves out,
- fix a player's own details (name, emoji, email) without a support round-trip,
- see whether the one external dependency — the football data API sync — is alive,
- rotate the private competition code,
- see the state of the season the way the app understands it.

It is deliberately **not** a general back office. The group is ~10–20 players and
one operator; the bar for a capability is "this happens, and doing it today means
opening a terminal", not "an admin panel usually has this".

---

## 2. Current state — verified against the code, 2026-09-04

- **No admin UI, admin route, or admin API exists.** `players.is_admin` is written
  only by `scripts/bootstrap-competition.mjs` and read only by
  `scripts/verify-bootstrap-competition.mjs`. Nothing under `src/` reads it.
- Every capability below is today either a script (`scripts/set-competition-code.mjs`),
  a manual HTTP call with a shared secret, or raw SQL.
- The tables an admin surface sits on already exist: `players` (with
  `failed_pin_attempts`, `locked_until`, `pin_reset_required`), `sync_log` (with
  `sync_type`), `gameweeks`, `matches`, `scores`, `competitions`.
- `match_result_audit` exists in the schema but **nothing writes to it** — consistent
  with match-result editing not being an in-app capability.
- Session helpers exist and are the right foundation: `getSessionPlayerId()` in
  `src/app/_lib/session-cookie.ts`, `hasCsrfHeader()` in `src/app/_lib/csrf.ts`,
  scrypt hashing in `src/lib/auth/scrypt-secret.ts`, lockout logic in
  `src/lib/auth/lockout.ts`.
- Navigation is a three-tab bar (`src/components/nav/tabs.ts`) plus a **More menu**
  (`src/components/nav/MoreMenu.tsx`) holding Switch Player and Help. Admin belongs
  in the More menu — ADR 0005's rule is that only real destinations get a tab, and
  a surface one player in twenty can see is not one.
- `/api/sync/matches` is authenticated by an `x-sync-secret` header for its GitHub
  Actions caller, and its handler also runs scoring, bot picks, and next-gameweek
  selection. Selection is already **gap-fill only**: `select-next.ts` returns early
  when `match_1_id is not null`, so re-running sync can never re-roll a selection.

---

## 3. Decisions this spec is built on

| #   | Decision                                                                                                         | Consequence                                                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **One surface, one tier.** `is_admin` unlocks everything the UI offers. No Superadmin, no operator env-var gate. | Nothing in the UI is dangerous enough to need a second tier, _because_ of D2. Keeps `docs/adr/0004`'s "don't build Superadmin speculatively" intact.                                  |
| D2  | **Match facts stay read-only.** No editing of results, kickoff times, or match status; no void/postpone action.  | `CLAUDE.md`'s rule survives unamended. The UI still _shows_ a wrong result — it just can't fix it. Corrections remain a development-team DB action.                                   |
| D3  | **No elevated read visibility.** Admin never sees another player's pre-lock scoreline.                           | Admin sees "filed 2 of 2", never the numbers. Upheld by construction: the admin queries select counts, not scores.                                                                    |
| D4  | **No admin audit log.**                                                                                          | No `admin_audit` table. Actions are visible in server logs only. Small trusted group; revisit if a second human admin ever exists.                                                    |
| D5  | **Disable, i.e. a soft delete.** The standard pattern, nothing bespoke.                                          | A disabled player keeps every row — picks, scores, Median Bot contribution, Bold Call cohort membership. Only their ability to log in, and their leaderboard row, go away.            |
| D6  | **No standalone re-run buttons for selection, bot picks, or scoring.** One button re-runs the whole sync cycle.  | The three jobs are gap-fill by construction (§7.2), so a cycle can never re-roll a selection or a pick a player has seen. Standalone re-runs of any of them individually don't exist. |
| D7  | **No export or backup tooling.**                                                                                 | `CLAUDE.md`'s out-of-scope line stands; the weekly REST export already covers data safety.                                                                                            |

---

## 4. Access model

**Gate.** A shared server-side helper — `src/app/_lib/admin-access.ts`, alongside the
existing session and CSRF helpers rather than in `src/lib/**`:

```
requireAdmin(): Promise<{ playerId: string; competitionId: string } | null>
```

It reads the session cookie, loads the player, and returns null unless
`is_admin === true`. Every admin page and every admin API route calls it first.

**Rules, all server-side and non-negotiable:**

1. A non-admin (or logged-out) request to any `/admin` page renders **404**, not 403 —
   the surface should not announce itself to a curious player.
2. A non-admin request to any `/api/admin/*` route returns **404** with no body.
3. Every query an admin route makes is filtered by the admin's own
   `competition_id`. There is no cross-competition read or write anywhere in this
   spec, matching `docs/adr/0004`.
4. Every state-changing admin route requires `hasCsrfHeader(request)` in addition to
   the session check, exactly as `/api/picks` does.
5. The admin's own `is_admin` is never inferred client-side. The client may receive
   an `isAdmin` boolean purely to decide whether to render the More-menu entry; it
   grants nothing.

**Entry point.** A "Competition admin" item in the More menu, rendered only when the
session player is an admin. No tab, no link from the Pick Board.

---

## 5. Surface 1 — `/admin` index

A single scrollable page. Its job is to answer "is anything wrong?" in one screen,
then hand off to the three sections.

**Health strip**, at the top, one row per signal, each green / amber / red:

| Signal                 | Green when                                              | Red when                                                  |
| ---------------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| Match sync             | last `sync_log` success of type `matches` within 60 min | no success in 6 h                                         |
| Standings sync         | last success within 24 h                                | no success in 72 h                                        |
| Next gameweek selected | the next unstarted gameweek has `match_1_id` set        | its first fixture is inside 48 h and `match_1_id` is null |
| Picks filed            | — (informational)                                       | —                                                         |
| Locked-out players     | none currently locked                                   | any player locked right now                               |

Amber is the band between. Every red row links to the section that explains it.

**Counts row:** players (of which bots, disabled), current gameweek number, Predict the
Table submissions (submitted / skipped / outstanding).

> Phase 1 note: the `disabled` sub-count ships with Phase 3 (the `disabled_at`
> column, §9, does not exist before then). "Outstanding" is over non-bot players —
> those with neither a `submitted_at` nor an `is_skipped` prediction row.

Nothing on this page is a button.

---

## 6. Surface 2 — Players & access (`/admin/players`)

### 6.1 The roster table

One row per player in the admin's competition, bots included, disabled players included
but visually de-emphasised. Sorted by display name; a filter chip set for
`All / Humans / Bots / Disabled / Needs attention`, where _needs attention_ means
locked out, or flagged for PIN reset, or has filed no picks in the current gameweek.

Per row:

- emoji + display name, with badges: `Admin`, `Bot`, `Disabled`, `Late joiner`
- email present or `no email` (the notification consequence is worth seeing at a glance)
- lockout state — `Locked until 14:32` with a live-ish countdown, or nothing
- `PIN reset pending` when `pin_reset_required` is true
- current-gameweek picks as **`2 of 2` / `1 of 2` / `none`** — a count, never a scoreline (D3)
- joined date

Tapping a row opens that player's detail panel with the actions below. Bots have no
actions except _disable_.

### 6.2 Actions

**Reset PIN** — the forced-reset flow `CLAUDE.md` already specifies.
Admin types a 4-digit temporary PIN (and re-types it to confirm). On submit the route
hashes it with the existing scrypt helper, writes it, sets `pin_reset_required = true`,
and clears `locked_until` and `failed_pin_attempts` in the same update. The UI then
shows the temporary PIN back once, plainly, with "tell them this in person or by
phone" — there is no delivery mechanism and the spec does not add one. The player is
forced to choose a new PIN at next login, which clears the flag.

**Clear lockout** — clears `locked_until` and `failed_pin_attempts` without touching
the PIN. Present only when the player is actually locked. This is the common case
(a kid mistyped five times) and it should be one tap, no confirm dialog.

**Edit details** — display name, emoji, email.

- display name: revalidated with the existing `signup-validation` rules, including the
  case-insensitive uniqueness check **scoped to the competition**.
- emoji: the same curated picker the signup screen uses (`src/lib/auth/emoji-options.ts`),
  reused, not reimplemented.
- email: optional, may be blank, not unique — matches `docs/adr/0002`.
  Renaming a player is safe: `player_id` is the key everywhere.

**Grant / revoke admin** — a toggle, behind a confirm.
Guard: the route refuses to revoke the **last remaining admin** in a competition, and
refuses to revoke the requester's own admin flag. Both refusals are server-side.

**Disable / re-enable** (D5) — behind a confirm that spells out what it does.
Writes `players.disabled_at`. A disabled player:

- **cannot log in** — the login route rejects them explicitly, server-side. Absence
  from the roster list is presentation, not enforcement, and the roster is about to
  become a type-ahead search anyway (see `LAUNCH_ORDER.md`).
- is **absent from the login roster** (`/api/auth/players`) and **from the leaderboard**.
- is **retained everywhere else, unchanged**: their picks still appear in past
  gameweek reveals, their scores still exist, they still feed the Median Bot's input
  set and still count in the Bold Call rarity cohort. Disabling must not silently
  re-score anyone else's season.
  Guard: cannot disable yourself; cannot disable the last admin.

### 6.3 Explicitly not here

- Creating a player. Signup with the competition code is the only path in, and adding
  a second one means inventing a PIN-delivery story.
- Deleting a player.
- Viewing anyone's pre-lock picks (D3).

---

## 7. Surface 3 — Sync & jobs (`/admin/sync`)

### 7.1 Read

**Per sync type** (`matches`, `standings`): last run, last _success_, outcome, matches
updated, and the error message when the last run failed. `sync_log` already carries
all of it.

**History**: the last 50 runs, newest first, as a compact list — timestamp, type,
status, rows updated, truncated error. A run of failures in a row is the pattern worth
seeing, so failures render at full opacity and successes muted.

**Derived job state** — not in `sync_log`, computed per request:

- next gameweek: selected (both slots / one slot as a Skipped Slot / not yet selected),
  with the fixtures named
- bot picks: generated or not, for each locked tipped match
- scoring: for each completed tipped match, whether `scores` rows exist for every
  player who filed

Each of these is a sentence and a state, not a button (D6). When one is wrong, the
page says what a human would need to do about it — including "this is a development-team
database action" where that is the honest answer.

### 7.2 Action — "Run sync now"

One button, running the full sync cycle for this competition's season.

**Implementation requirement, not a preference:** the browser must never hold
`SYNC_TRIGGER_SECRET`. So `POST /api/admin/sync/run` is authenticated by session +
`is_admin` + CSRF header, and invokes the _same server-side function_ the scheduled
route invokes. This requires extracting the current body of
`src/app/api/sync/matches/route.ts` into a shared module that both callers use. The
admin route must not fetch its own sync endpoint with a secret attached.

**Why this cannot re-roll anything.** Running sync also runs selection, bot picks, and
scoring — but all three are gap-fill by construction, verified in the code:
`select-next.ts` returns early once `match_1_id` is set, bot picks are written once and
never re-rolled, and scoring is an idempotent upsert keyed by `(player_id, match_id)`.
So the button can never change a selection or a pick a player has already seen.

**Rate limit:** refuse a second run within 60 seconds and say so.

---

## 8. Surface 4 — Competition & season (`/admin/competition`)

### 8.1 Competition

Read: name, season, player counts, when the competition code was last rotated.

**Action — rotate the competition code.** Admin types the new code twice; the route
hashes it with scrypt and writes `competitions.code_hash`, the same format
`scripts/set-competition-code.mjs` writes. The confirm must state the actual
consequence: _every device that has remembered the old code will be asked for the new
one, including yours._ The new code is echoed back once on success.

Guards: minimum length and a rejection of trivially guessable values, matching whatever
`set-competition-code.mjs` already enforces. Never display the existing code — it is
hashed and cannot be recovered, and the UI should say so rather than leave a blank field
looking broken.

### 8.2 Settings

`CLAUDE.md` names lockout duration as the example of an admin-configurable competition
setting. Today the threshold (5) and duration (15 min) are constants in
`src/lib/auth/lockout.ts`.

Spec: two nullable columns on `competitions` — `lockout_threshold`, `lockout_minutes` —
where null means "use the built-in default", so nothing changes until an admin chooses
to change it. Editable here with sane bounds (threshold 3–10, duration 5–60 min).

This is the **lowest-priority item in the whole spec** and should be the first thing cut.

### 8.3 Season overview

A read-only list of gameweeks for the current season: number, the two tipped matches
with kickoff times and lock times, match status, current score, how many players filed,
and whether scoring has run.

This is where an admin _notices_ a wrong result or a drifted kickoff. The row shows the
provider match id and a line stating that corrections are a development-team database
action (D2). No edit affordance — not even a disabled one.

---

## 9. Data model changes

Minimal, one migration:

```sql
alter table players add column disabled_at timestamptz;

-- §8.2 only; cut with the settings surface
alter table competitions add column lockout_threshold integer;
alter table competitions add column lockout_minutes integer;
```

`disabled_at` as a nullable timestamp rather than a boolean: it records _when_, costs
nothing, and reads the same in a predicate.

Every read path that currently lists players must be audited against §6.2's disabled
rules — specifically `/api/auth/players`, the login route, and the leaderboard query.
Missing one of those is the likely defect in this work.

Nothing else. No `admin_audit` (D4), no soft-delete cascade, no new role column (D1).

---

## 10. Conflicts with existing documentation

Both need resolving before build, not after:

1. **`CLAUDE.md` → Identity and auth** currently lists "a user-management screen for
   adding players and assigning roles, and admin-configurable competition-specific
   settings" under _Deferred to future work_. This spec builds the assigning-roles and
   settings halves and deliberately does not build the adding-players half. That
   paragraph needs updating when this ships.
2. **`CLAUDE.md` → Explicitly out of scope** lists admin export tooling. This spec
   honours that (D7) — no change needed, noted so a future reader doesn't reopen it.

No ADR is required: D1, D2, D3, D4 and D7 all _preserve_ existing documented decisions
rather than reversing them. D5 (disabling) is the only genuinely new product rule, and it
is small, reversible, and fully described in §6.2.

---

## 11. Design constraints

- **Mobile-friendly is still a hard constraint.** The realistic moment of use is a
  parent unblocking a kid on a phone, mid-Saturday. Tables must reflow to cards.
- **Reuse the design system** (`docs/DESIGN_SYSTEM.md`) — same shell, same type scale,
  same components. This is not a differently-styled console.
- **Language is plain and adult, not kid-friendly.** The no-gambling-vocabulary rule
  still applies; the friendly-explainer register does not.
- **Every destructive or surprising action confirms**: reset PIN, rotate code,
  grant/revoke admin, disable/re-enable. Clear-lockout and detail edits do not.
- **Every action states its consequence in the confirm**, in the second person, before
  it happens.
- The admin surface adds no client-side Supabase access. Same invariant as everywhere
  else in the app.

---

## 12. Phasing

Ordered by "what currently costs a terminal".

**Phase 1 — unblock players.** Access gate, More-menu entry, `/admin` index health
strip, roster table, reset PIN, clear lockout. This is the phase that earns its keep;
everything after it is convenience.

**Phase 2 — sync visibility.** `/admin/sync` read surfaces, health signals wired to the
index strip, and the run-now button plus the shared-module
refactor.

**Phase 3 — player details and roles.** Edit name/emoji/email, grant/revoke admin,
disable/re-enable, and the `disabled_at` migration with its read-path audit.

**Phase 4 — competition.** Code rotation, season overview.

**Phase 5 — settings.** §8.2. Cut this first if anything slips.

---

## 13. Out of scope

Match result and kickoff editing · void/postpone actions · viewing pre-lock picks ·
score recompute and Predict the Table cohort recompute buttons · standalone re-runs of
selection, bot picks or scoring · a Superadmin tier · an admin audit log · creating or
deleting players · CSV/JSON export and backup tooling · cross-competition anything ·
email send monitoring and resend (email itself is unbuilt — issues #28–#30; revisit
when it ships) · impersonation or "view as player".

---

## 14. Done when

- A non-admin session gets 404 from every `/admin` page and every `/api/admin/*` route,
  verified on a Preview URL with a real second account, not only in tests.
- An admin can reset a locked-out player's PIN on a phone, and that player can log in
  with the temporary PIN and is forced to set a new one.
- The health strip goes red when sync is genuinely stale — verified by pointing a
  staging environment at a stopped schedule, not by mocking the clock.
- Disabling a player removes them from login and leaderboard and changes **no** score:
  a leaderboard snapshot taken before and after a disable is identical for every other
  player, and the Median Bot's picks for a past gameweek are unchanged.
- Rotating the code on staging invalidates the old code and admits the new one.
- No admin surface anywhere renders another player's pre-lock scoreline — checked by
  reading the queries, not only the UI.
