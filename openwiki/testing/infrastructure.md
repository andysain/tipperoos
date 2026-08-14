---
type: concept
title: Test Infrastructure
description: Vitest configuration, server-only module stub, @/ path alias resolution, and how tests run under Next.js constraints.
tags: [testing, vitest, infrastructure, configuration]
---

# Test Infrastructure

Tests run via [Vitest](https://vitest.dev/) (v3.2.7), configured in `vitest.config.ts`.

## Configuration highlights

### `server-only` stub

Next.js provides a `server-only` package that throws at build time in client bundles. Vitest has no equivalent, so `src/lib/` modules that use `import "server-only"` would fail at test collection time.

The fix: `vitest/server-only-stub.ts` is a no-op replacement:

```typescript
// A no-op stub for the `server-only` package.
// Next.js replaces `server-only` with a throwing module for client bundles;
// Vitest has no equivalent, so every src/lib/*.ts that guards itself with
// `import "server-only"` would fail to load under Vitest without this.
export {};
```

Configured in `vitest.config.ts`:

```typescript
"server-only": path.resolve(__dirname, "vitest/server-only-stub.ts"),
```

### `@/` path alias

The tsconfig maps `@/*` → `./src/*`. Vitest's resolver doesn't read tsconfig paths, so the alias is also configured in `vitest.config.ts`:

```typescript
"@": path.resolve(__dirname, "src"),
```

This is needed by any test importing a `src/app/**` file using `@/...`.

### No-test pass-through

```typescript
passWithNoTests: true,
```

Allows the test runner to succeed when no test files exist yet (brand-new repo). Real failures still fail.

## Running tests

```bash
npm run test          # vitest run (single pass)
npx vitest            # watch mode
```

## CI integration

The CI workflow (`ci.yml`) runs `npm run test` as a separate step from Vercel's own build (which already covers typecheck + lint + build per Vercel's default pipeline in vercel.json / the Vercel dashboard). Only what Vercel doesn't check is added: tests and the critical-module guard.

## Related

- [Testing Standards](standards.md)
- [Critical Module Guard](critical-module-guard.md)
