import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // No test files exist yet for a brand-new project — don't hard-fail
    // validation until the first one lands. Real failures still fail.
    passWithNoTests: true,
  },
});
