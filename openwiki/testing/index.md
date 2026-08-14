# Files

- [Critical Module Guard](critical-module-guard.md) - CI-enforced gate requiring paired test changes, minimum literal-value assertions, and test-first commit ordering for src/lib/**.
- [Test Infrastructure](infrastructure.md) - Vitest configuration, server-only module stub, @/ path alias resolution, and how tests run under Next.js constraints.
- [Testing Standards](standards.md) - Golden-value/test-first discipline for consequence-critical modules (src/lib/**), scripted simulations for multi-step scenarios, and CI enforcement via critical-module guard.
- [Verification Scripts](verification-scripts.md) - Scripted simulation scripts (scripted integration tests) for competition bootstrap, scope isolation, and other cross-system scenarios that cannot be unit-tested.
