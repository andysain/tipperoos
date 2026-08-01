## What changed

<!-- One or two sentences. -->

## Checklist

- [ ] **Preview URL exercised** — clicked through the actual deployed Preview and used the changed flow, not just relied on `typecheck`/`build` passing.
- [ ] **Next.js version-drift check** — if this touches a Next.js/React API you weren't fully certain about (App Router conventions, caching/revalidation, route handlers), verified it against `node_modules/next/dist/docs/` rather than asserting from memory. This Next.js version is newer than typical training data — see `AGENTS.md`.
- [ ] If this touches `src/lib/**`: golden-value tests with literal expected numbers exist, committed before the implementation (see `docs/standards/TESTING_STANDARD.md`).
- [ ] `CLAUDE.md` / `BUILD_PLAN.md` / `CONTEXT.md` updated if product behavior or a decision changed.
