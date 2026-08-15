// Dedicated vitest config for issue #22's scripted gameweek-simulation test.
//
// The scenario (a *.sim.ts, deliberately NOT the default *.test.ts glob) drives
// the real src/lib scoring engine against the shared staging DB (D1). It must
// never join `npm test` (CI has no staging credentials and must never touch
// staging — D1a), which is why it lives behind this config instead of the root
// vitest.config.ts include pattern. Run from the repo root:
//
//   SUPABASE_URL=<staging URL> SUPABASE_SERVICE_ROLE_KEY=<staging key> \
//     npx vitest run --config scripts/scripted-gameweek-simulation/vitest.config.ts

import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: process.cwd(),
  resolve: {
    alias: {
      // Mirrors the root vitest.config.ts under this custom-root config, or
      // any `src/**` module importing `server-only` throws outside a build.
      "server-only": path.resolve(process.cwd(), "vitest/server-only-stub.ts"),
      "@": path.resolve(process.cwd(), "src"),
    },
  },
  test: {
    include: [
      "scripts/scripted-gameweek-simulation/scripted-gameweek-simulation.sim.ts",
    ],
  },
});
