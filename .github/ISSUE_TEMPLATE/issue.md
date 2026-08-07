---
name: Issue
about: Standard issue template — see docs/standards/ISSUE_STANDARD.md before filing
title: ""
labels: ""
---

<!-- Context: why this exists. Link the ADR/CLAUDE.md section it's derived
     from. If it depends on a prior issue, state what that issue already
     delivered so this one doesn't re-describe or re-do it. -->

Per `docs/adr/000X-....md` decision N. Depends on #N (already delivers: ...).

<!-- Scope: what this issue actually changes. Be concrete enough that
     "what's NOT in scope" is implied, not just "what's in scope". -->

-

<!-- Why now, if not obvious — cost of doing it later vs. now, if that's the
     actual justification (mirrors how BUILD_PLAN.md decisions are framed). -->

<!-- Cross-reference (soft, non-blocking): a shared helper/pattern this
     issue should use once it exists elsewhere, or that a *later* issue
     should use once this one lands. Only add on the issue that actually
     calls it — not speculatively on every issue nearby in the dependency
     graph. -->

<!-- Assumption check (foundational/schema issues only): does this design
     assume something that's true today but not guaranteed to stay true? -->

Done when: <criteria, each one verifiable using only what this issue
delivers>, verified by <manual check / committed test / scripted
simulation — name which>.

<!-- If a related claim can't be verified until a later issue exists, name
     that issue explicitly here and confirm its own done-when actually
     contains it. If that means this issue is actually blocked on that one,
     add `Depends on #N` above and the `status: blocked` label — not just
     this note. -->

<!--
Before filing, run docs/standards/ISSUE_STANDARD.md §3's checklist:
current-state check, self-contained done-when (watch for "once #N exists"
hedges), verification method stated, cross-references validated, milestone
& labels set, size check, assumption check (foundational issues only), and
cold-read check (foundational issues / milestone kickoffs only).
-->
