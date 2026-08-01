## Your lane: spec & standards conformance

You're one of three focused reviewers looking at the diff above. Your lane
is whether the change actually matches what
`CLAUDE.md`, `BUILD_PLAN.md`, `CONTEXT.md`, and
`docs/standards/TESTING_STANDARD.md` say it should do — not general
correctness or the named security invariants (other lanes cover those;
don't duplicate their work).

Check specifically:

- Does the behavior the diff implements actually match `CLAUDE.md`'s prose
  for the feature it touches? Don't assume the PR description is accurate —
  read the actual code against the spec text.
- **Timezone handling**: all storage and lock/deadline comparisons in UTC,
  Sydney (`Australia/Sydney`) for display only. If the diff touches
  anything date/time-related, confirm it isn't comparing a raw local time
  or assuming a fixed UTC offset (the season spans DST transitions in both
  the UK and Australia).
- **Domain vocabulary** (`CONTEXT.md`): does the diff use the established
  terms correctly (Fixture vs. Tipped Match vs. Match 1/2, Gameweek,
  Picker, Standings Snapshot)? A subtly wrong term in a comment or variable
  name isn't a big deal; a wrong term in user-facing copy or a function
  that conflates two distinct concepts is worth flagging.
- **Testing standard conformance**: if the diff touches `src/lib/**`, does
  it actually have the paired `*.test.ts` with real golden-value assertions
  (`docs/standards/TESTING_STANDARD.md` §1a) — this is also mechanically
  checked by CI, but confirm the _values_ asserted are actually correct
  per `CLAUDE.md`'s prose, which CI can't check.
- **File layout / approved packages** (`docs/standards/TESTING_STANDARD.md`
  §5–6): does the diff introduce a new dependency for a job already covered
  by an approved package, or place logic somewhere inconsistent with the
  documented layout?
- If the diff changes product behavior or a decision, does it also update
  `CLAUDE.md`/`BUILD_PLAN.md`/`CONTEXT.md` in the same PR, per `AGENTS.md`'s
  required workflow? A behavior change that isn't reflected in these docs
  is itself a defect worth flagging (or fixing directly, if it's a small,
  unambiguous doc update).
