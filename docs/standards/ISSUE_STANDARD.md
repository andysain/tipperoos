# Issue Standard

Written after Milestone 11's #69 needed five follow-up rounds to close out a
schema change that was, on paper, one sentence long ("add a unique
constraint"). None of the individual gaps were hard to fix — the problem was
that they only surfaced through a live interrogation (grilling one agent,
answering through another) instead of being caught while the issue was
drafted. The goal here is to move that checklist left: catch it once, at
authoring time, so an agent (or Andy) can pick an issue up cold and implement
it without a Q&A round first.

Scaled for this project's size — this is a checklist, not a process. Don't
add ceremony a 4-issue milestone doesn't need.

## 1) Core principle: write for zero conversation context

Whoever implements an issue — human or agent — will not have read the thread
that produced it. If a claim in the issue depends on something "we discussed"
that isn't written down, it isn't actually in the issue. Assume the reader
has the codebase and the referenced ADR/CLAUDE.md sections, and nothing else.

## 2) The five failure modes this fixes

Real examples from #69, kept here so the pattern is recognizable next time,
not just abstract advice:

1. **Stale state** — the issue described work as needed that a prior issue
   had already done as a side effect (`gameweeks.competition_id` already
   existed from #68's migration; #69 didn't know that).
2. **Unverifiable done-when** — a done-when clause asserted behavior that
   needed code from issues not yet built to exercise (cross-competition
   Picker non-collision, which needed #70 and #20). Watch for its disguised
   form too: a clause hedged with "once #N exists" is the same failure mode
   wearing a caveat instead of an outright claim — see §3 bullet 2.
3. **No verification method** — the issue didn't say _how_ to check the
   acceptance criteria, leaving "manual SQL vs. script vs. committed test"
   as an open question mid-implementation.
4. **Misplaced cross-references** — a pointer to a shared helper landed on
   the wrong issue (first #69, which turned out not to need it; briefly
   guessed at #33, which turned out to be the wrong issue entirely) because
   the target wasn't checked before naming it.
5. **Buried conceptual seams** — a design decision (identity vs. membership
   fields conflated in one table) that only surfaced under deliberate
   scrutiny, not from a normal read-through.

## 3) Drafting checklist

Run this before filing an issue, or a milestone's worth of issues:

- [ ] **Current-state check.** If this issue's scope depends on an earlier
      issue, grep/read the actual current code or schema — don't scope
      against the ADR's plan or a prior conversation's assumption. State
      explicitly what already exists vs. what this issue still needs to do.
- [ ] **Self-contained done-when.** Every acceptance criterion must be
      verifiable using only what this issue delivers. If a criterion needs a
      later issue's code to exercise, it doesn't belong here — move it to
      the issue that will actually make it true (see §7). **Smell to watch
      for**: if you catch yourself writing "once #N exists" or "once this
      capability exists" inside a done-when clause, stop — that's a hard
      dependency wearing a hedge, not a real criterion for this issue. Split
      it into #N's own done-when and add `Depends on #N` to this issue's
      Context section instead (see §8).
- [ ] **Verification method stated.** Say how done-when gets checked: manual
      one-off (staging SQL, clicking through a Preview URL), a committed
      test (per `TESTING_STANDARD.md` §1's test-first list), or "scripted
      simulation" (`TESTING_STANDARD.md` §1b) for multi-step scenarios.
      Don't leave this as an implicit gap.
- [ ] **Cross-references validated.** If this issue points at another issue
      (a shared helper it should use, a pattern to follow), open that issue
      and confirm it's the right target before writing the number down. A
      remembered issue number is a guess until checked.
- [ ] **Milestone & labels set.** Assign the issue to its milestone at
      filing time. Apply `launch-critical` if it's on `BUILD_PLAN.md`'s
      critical path. Apply `status: blocked` the moment this issue gets a
      `Depends on #N` — the label and the text move together, not just one
      of them (see §8).
- [ ] **Size check.** If Scope needs more than ~5 bullets, or done-when has
      more than ~3 criteria, that's a signal this is two issues wearing one
      number. Split it before filing rather than after someone's picked it
      up.
- [ ] **Assumption check** (foundational/schema issues only — skip for
      routine feature work). One question: does this design assume
      something that's true today but not guaranteed to stay true? Doesn't
      need a full lateral-thinking session — just the one prompt, applied
      deliberately instead of skipped. If it surfaces a real open question
      rather than just confirming the design holds, that's the trigger for
      an actual `/grilling` session before filing — don't let this one-line
      prompt silently absorb a decision that needs adjudication.
- [ ] **Cold-read check** (foundational/schema issues and milestone
      kickoffs only). Hand the drafted issue text — nothing else, no thread
      context — to a fresh agent session and ask it to either implement the
      issue or list its blocking questions. Zero questions means §1's
      "write for zero conversation context" principle actually holds; any
      question is a gap to fix before filing, the same way #69's questions
      surfaced after filing instead.

## 4) Pickup check — before implementing, not just before filing

The checklist above is about drafting, but #69 went stale _after_ it was
written, when #68's migration did part of its job as a side effect. The same
thing can happen to any issue that sits open across a milestone boundary.
Before implementing an issue that's been open a while, or that references a
dependency that has since merged, re-run the **current-state check** (§3)
against the issue as it stands today — don't trust its Context section just
because it read as accurate when filed. A stale Context section is a bug in
the issue, not a footnote to work around silently; fix it in place per §7.

## 5) Issue template

```markdown
<!-- Context: why this exists. Link the ADR/CLAUDE.md section it's derived
     from. If it depends on a prior issue, state what that issue already
     delivered so this one doesn't re-describe or re-do it. -->

Per `docs/adr/000X-....md` decision N. Depends on #N (already delivers: ...).

<!-- Scope: what this issue actually changes. Be concrete enough that
     "what's NOT in scope" is implied, not just "what's in scope". -->

- ...

<!-- Why now, if not obvious — cost of doing it later vs. now, if that's the
     actual justification (mirrors how BUILD_PLAN.md decisions are framed). -->

<!-- Cross-reference (soft, non-blocking): a shared helper/pattern this
     issue should use once it exists elsewhere, or that a *later* issue
     should use once this one lands. Only add on the issue that actually
     calls it — not speculatively on every issue that's nearby in the
     dependency graph. -->

<!-- Assumption check (foundational/schema issues only): does this design
     assume something that's true today but not guaranteed to stay true? -->

Done when: <criteria, each one verifiable using only what this issue
delivers>, verified by <manual check / committed test / scripted
simulation — name which>.

<!-- If a related claim can't be verified until a later issue exists, name
     that issue explicitly here and confirm its own done-when actually
     contains it — don't leave the claim floating on this issue. If naming
     it here means this issue is actually blocked on that one, add
     `Depends on #N` above and the `status: blocked` label, not just this
     note. -->
```

## 6) Verification method guide

Matches `TESTING_STANDARD.md` §1's split by consequence — an issue's
verification method should follow from the same logic, decided at drafting
time instead of during implementation:

| Check is...                                              | Verification method                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| A one-time schema shape (constraint, column exists)      | Manual SQL against staging, throwaway inserts, delete after. No committed artifact.  |
| Pure logic where a silent bug costs points/corrupts data | Committed Vitest test, test-first, golden values (`TESTING_STANDARD.md` §1/§1a).     |
| API route branching logic                                | Committed Vitest test where cheap (`TESTING_STANDARD.md` §1).                        |
| A multi-step scenario spanning several modules           | "Scripted simulation" (`TESTING_STANDARD.md` §1b) — named in the issue, not implied. |
| UI/UX, layout                                            | Manual: click through the deployed Preview URL (per PR template checklist).          |

Don't introduce a new test category (e.g. this repo's first DB-integration
test against a live Supabase instance) to close out a one-time check. That's
a bigger call than any single issue — make it deliberately, separately, only
once a _recurring_ need for it shows up.

## 7) Scope drift is fine — here's how to handle it

Issues will get rescoped once real state changes underneath them (see #69).
That's expected, not a process failure. When it happens:

- Edit the issue body in place. Add a **`Status update (date):`** line
  explaining what changed and why, rather than silently rewriting history.
- If a claim moves to a different issue (a done-when criterion that turns
  out to belong elsewhere), remove it from the original and add it to the
  target's own done-when — don't leave it duplicated in both, and don't
  leave a dangling reference with no home.
- Only open a _new_ issue if the rescoped work is big enough to be its own
  unit of implementation. A one-line correction stays inline.

## 8) Dependencies vs. cross-references — don't conflate them

- **`Depends on #N`** — hard blocker. This issue cannot be implemented (or
  its done-when cannot be verified) until #N is done. Always paired with the
  `status: blocked` label (§3) — the label is what makes it visible in
  triage, not just in the issue body text.
- **`Cross-reference: #N`** — soft pointer. Informational, non-blocking:
  "use the helper #N is adding" or "this pattern should also apply in #N."
  Place it only on the issue(s) that actually consume it (§3's cross-reference
  check) — not on every issue that happens to be nearby in the dependency
  graph.

## 9) Milestone-level pass

Before filing a milestone's issues, run the §3 checklist across the _whole_
set, not issue-by-issue — several of #69's problems were only visible by
comparing it against #70/#71/#20 together (the cross-reference that needed
to move, the collision-check that needed a home). A milestone with 3–5
issues is small enough that a single pass across all of them, right after
drafting, is cheap.
