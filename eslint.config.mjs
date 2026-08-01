import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettierConfig from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Must be last: disables ESLint rules that conflict with Prettier's formatting.
  prettierConfig,
  {
    rules: {
      // Allow a leading underscore to mark a required-by-signature but
      // intentionally-unused parameter (e.g. a reset function that always
      // returns the same fresh state regardless of the current state).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  // Override default ignores of eslint-config-next. Anchored with a leading
  // `**/` so nested instances (e.g. a git worktree checked out under
  // .claude/worktrees/**, each with its own .next/node_modules) are excluded
  // too, not just top-level ones.
  globalIgnores([
    // Default ignores of eslint-config-next:
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/next-env.d.ts",
    "**/node_modules/**",
    ".claude/**",
  ]),
]);

export default eslintConfig;
