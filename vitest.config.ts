import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Next.js aliases the real `server-only` package to a no-op for
      // server bundles at build time; Vitest has no equivalent, so it
      // throws on import. Reproduce the no-op here instead.
      "server-only": path.resolve(__dirname, "vitest/server-only-stub.ts"),
      // Mirrors tsconfig.json's "@/*" -> "./src/*" path mapping. tsc
      // resolves this fine (it just typechecks), but Vitest's own
      // resolver doesn't read tsconfig paths, so any test that imports a
      // src/app/** file using "@/..." (as most do) fails at collection
      // time without this.
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    // No test files exist yet for a brand-new project — don't hard-fail
    // validation until the first one lands. Real failures still fail.
    passWithNoTests: true,
  },
});
