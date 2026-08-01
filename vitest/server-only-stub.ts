// Vitest runs outside Next.js's build system, which is what normally aliases
// the real `server-only` package to a no-op for server bundles (and lets it
// throw only when accidentally pulled into a client bundle). This stub
// reproduces that no-op behavior so modules that import "server-only" stay
// unit-testable. See vitest.config.ts.
export {};
