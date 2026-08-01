# Tipperoos EPL Rebuild — Gap Review

Findings from a PM-style review of `BUILD_PLAN.md` against `CLAUDE.md` and the 32 GitHub issues (milestones 1–10), plus a pass for gaps a build plan like this commonly misses in practice. Not a decision record — see `BUILD_PLAN.md` for adjudicated decisions and `docs/adr/` for architecture decisions. This is a punch list to resolve before/during build.

Status as of this writing: 0/32 issues closed, no app code exists yet.

---

## Resolved since this review

- **Postponement before lock** — was undefined (see Gap 3 below as originally written). Now resolved in `CLAUDE.md`: a match postponed before its picks lock is a skipped slot, not replaced — the gameweek runs with one tipped match instead of two. No further action needed.
- **Bot season-winner eligibility** — clarified in `CLAUDE.md`: bots are eligible for the season "winner" title; only the admin is excluded.
- **Match-2 tiebreak wording** — clarified: "worst cumulative season standing" = closest to the bottom of the table (highest rank number), removing prior ambiguity.
- **Bot pick-generation mechanics** (was Gap 1) — resolved 2026-08-01: three bot types carry forward, ported from the old app's actual logic (Random, 1-1, Median), ELO dropped. See `CLAUDE.md` and issue #35.
- **Late joiners** (was Gap 2) — resolved 2026-08-01: not eligible for season "winner"; can submit Predict the Table any time after joining or skip it; prior gameweeks score 0. See `CLAUDE.md`, and issues #26/#32 (updated DoD).
- **No forgot-PIN / reset flow** (was Gap 3) — resolved 2026-08-01: admin-assisted reset only. See issue #36.
- **"Switch player" UX never built** (was Gap 4) — resolved 2026-08-01: folded into issue #8's DoD.
- **DST transitions untested** (was Gap 5) — resolved 2026-08-01: tracked as issue #37 (cut-if-behind — both transitions land after the season opener, but must land before October).
- **No mobile/UX validation gate** (was Gap 6) — resolved 2026-08-01: tracked as issue #38.
- **No staging/test Supabase project** — resolved 2026-08-01: second free project for staging, tracked as issue #40.
- **No ongoing backup/DR plan for the new project** — resolved 2026-08-01: weekly export, tracked as issue #39 (cut-if-behind).
- **football-data.org rate limits not sized** — resolved 2026-08-01, checked directly rather than assumed: EPL is on the free tier at 10 calls/minute; a batched one-call-per-cycle sync design stays well within budget. Folded into issue #11.
- **Cookie/CSRF decisions for hand-rolled session auth** — resolved 2026-08-01: httpOnly + secure + sameSite=Lax cookie, custom-header check on mutating routes. Folded into issue #8.

---

## Open gaps

None outstanding as of 2026-08-01. All findings from this review have been resolved into `CLAUDE.md`, `BUILD_PLAN.md`, and GitHub issues #8, #11, #26, #32, #35–#40.
