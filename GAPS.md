# Tipperoos EPL Rebuild — Gap Review

Findings from a PM-style review of `BUILD_PLAN.md` against `CLAUDE.md` and the 32 GitHub issues (milestones 1–10), plus a pass for gaps a build plan like this commonly misses in practice. Not a decision record — see `BUILD_PLAN.md` for adjudicated decisions and `docs/adr/` for architecture decisions. This is a punch list to resolve before/during build.

Status as of this writing: 0/32 issues closed, no app code exists yet.

---

## Resolved since this review

- **Postponement before lock** — was undefined (see Gap 3 below as originally written). Now resolved in `CLAUDE.md`: a match postponed before its picks lock is a skipped slot, not replaced — the gameweek runs with one tipped match instead of two. No further action needed.
- **Bot season-winner eligibility** — clarified in `CLAUDE.md`: bots are eligible for the season "winner" title; only the admin is excluded.
- **Match-2 tiebreak wording** — clarified: "worst cumulative season standing" = closest to the bottom of the table (highest rank number), removing prior ambiguity.

---

## Open gaps

### 1. Bot pick-generation mechanics — flagged, then never picked back up

`CLAUDE.md` explicitly says bot mechanics are "not yet fully re-specified for this rebuild — treat as an open design item." That's a correct, honest flag. But the 4-agent adjudication in `BUILD_PLAN.md` never resolved it, and none of the 32 GitHub issues touch it. `is_bot` exists as a schema flag and the leaderboard is required to label bots (#24), but nothing generates a bot's weekly pick.

**Risk**: launch as planned, and bots sit on the leaderboard scoring zero forever — technically working, silently wrong given bots are named as an intentional part of the player pool.
**Needs**: an explicit decision — either scope bots out of v1 (fine, just say so) or add a "simple/random bot picker" issue.

### 2. Late joiners aren't handled anywhere

The private-competition-code signup flow (#7) implies ongoing enrollment during the season — that's the point of code-gated self-signup rather than a pre-season roster lock. But Predict-the-Table capture assumes "before the season meaningfully progresses," and nothing addresses what happens for a player who joins in, say, gameweek 10: do they fill out Predict-the-Table against an already-progressed table? Do they show 0 points for gameweeks before they joined?

**Needs**: an explicit late-joiner rule for both onboarding (Predict-the-Table) and season-score accounting.

### 3. No forgot-PIN / reset flow

Nowhere — not in `CLAUDE.md`, `BUILD_PLAN.md`, or any issue — is there a path for a player who forgets their PIN. Given the target users are children (~10+) on shared family devices, this isn't a rare edge case, it's a week-1 certainty. PIN strength being proportionate to stakes is the right call, but there's still no admin-assisted or self-service reset UI anywhere in the 32 issues.

**Needs**: an issue for admin-assisted PIN reset, at minimum.

### 4. "Switch player" UX is named but never built

`CLAUDE.md`'s trust section names this specifically as the mitigation for shared-device shoulder-surfing: "mitigate with a clear 'Switch player' flow." Issue #8 covers login+session generically but no issue targets this flow explicitly — easy to lose since it's mentioned once, in a different section from the login issue.

**Needs**: fold explicitly into #8's DoD, or a dedicated issue.

### 5. DST transitions during the season aren't tested

Kickoffs are UK time, displayed in Sydney time, everything stored in UTC — the rule is right, but the season spans two DST transitions: UK BST→GMT (late October) and Sydney AEDT/AEST (early October). If fixture seed data or a sync delta ever captures a kickoff as a naive local time without a real UTC offset, matches after the UK clock change could silently display an hour off, and worse, shift the 5-minute lock window relative to actual kickoff.

**Needs**: one explicit test against a fixture that straddles a DST boundary, before trusting the sync path.

### 6. No mobile/UX validation gate despite it being a headline hard constraint

"Mobile-friendly, fast, responsive... snappy interaction is a product requirement, not a nice-to-have" is presented as an explicit reaction against the old app's biggest complaint. Every one of the 32 issues is a backend/functional DoD ("a pick can be saved," "leaderboard reflects simulated scores") — zero issues gate on actually using it on a phone, or any design/UX pass.

**Needs**: a design/UX validation issue in Launch Readiness (milestone 10), alongside the dry run (#34).

---

## Smaller operational gaps

Not launch-blocking, but worth deciding on deliberately rather than by omission:

- **No staging/test Supabase project** — the week-3 dry run (#34) and general testing risk running against the same prod project/data that's about to go live for real.
- **No ongoing backup/DR plan for the new project once live** — the old project's one-time backup (#3) is covered, but nothing for the new project during the actual season.
- **football-data.org free-tier rate limits not sized against the call budget** — 10–15 min cadence × match days × 38 gameweeks should be checked against the actual free-tier quota before relying on it.
- **Hand-rolled session auth needs explicit cookie/CSRF decisions** — httpOnly/secure/sameSite flags and CSRF protection on state-changing routes aren't implied for free by "server-side session" the way they would be with a standard auth library; needs an explicit call in #8 or #10.
