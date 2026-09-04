#!/usr/bin/env node
// Enforces the golden-value/test-first discipline for src/lib/** (the
// consequence-critical modules named in docs/standards/TESTING_STANDARD.md
// section 1 -- scoring, lock enforcement, Match-2 picker, postponement,
// PIN/lockout). See TESTING_STANDARD.md for the full rationale.
//
// A test existing and passing doesn't prove it asserts the *right* value --
// an agent under deadline pressure can write implementation and test in the
// same pass and just assert on the code's own output. This script checks
// three things a self-consistent-but-wrong pair can't fake as easily:
//   1. Any changed src/lib/**/*.ts (excluding *.test.ts) has a paired
//      *.test.ts change in the same diff.
//   2. That test file has a minimum number of literal-value assertions
//      (not just "a test exists somewhere").
//   3. The test file's first commit precedes the implementation file's
//      first commit, in this PR's own history -- test-first, provably.
//
// No-ops instantly (exit 0) if the diff doesn't touch src/lib/**.

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const MIN_ASSERTIONS = 6;
const BASE_REF = process.env.GITHUB_BASE_REF
  ? `origin/${process.env.GITHUB_BASE_REF}`
  : "origin/main";

function run(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

function changedFiles() {
  try {
    return run(`git diff --name-only ${BASE_REF}...HEAD`)
      .split("\n")
      .filter(Boolean);
  } catch {
    // Shallow checkout without the base ref fetched -- nothing we can check.
    console.log(
      "critical-module-guard: could not diff against base ref, skipping (shallow checkout?)",
    );
    process.exit(0);
  }
}

// A change that only touches comments or blank lines can't encode a scoring
// bug, so it doesn't need a paired golden-value test change. We inspect the
// added/removed lines of the file's own diff: if every one of them is blank,
// a `//` line comment, or a single-line/`*`-prefixed block-comment line, the
// change is non-behavioral. Known limitation (same spirit as the test-first
// check below): a contrived diff that only moves a `*/` could re-scope a
// block comment to expose code without that code appearing in the diff -- the
// CODEOWNERS human gate on src/lib/** is the backstop for that.
function isCommentOrWhitespaceOnly(file) {
  const diff = run(`git diff -U0 ${BASE_REF}...HEAD -- "${file}"`);
  const changedLines = diff
    .split("\n")
    .filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---) /.test(l))
    .map((l) => l.slice(1).trim());
  if (changedLines.length === 0) return false;
  return changedLines.every(
    (l) =>
      l === "" || l.startsWith("//") || l.startsWith("*") || l.startsWith("/*"),
  );
}

function firstCommitTouching(file) {
  const log = run(
    `git log --reverse --format=%H ${BASE_REF}..HEAD -- "${file}"`,
  );
  return log.split("\n").filter(Boolean)[0] ?? null;
}

function countLiteralAssertions(file) {
  const content = readFileSync(file, "utf8");
  const matches = content.match(/\.(toBe|toEqual)\(\s*-?\d/g);
  return matches ? matches.length : 0;
}

const files = changedFiles();
const implFiles = files.filter(
  (f) =>
    f.startsWith("src/lib/") && f.endsWith(".ts") && !f.endsWith(".test.ts"),
);

if (implFiles.length === 0) {
  console.log(
    "critical-module-guard: no src/lib/** implementation changes, skipping.",
  );
  process.exit(0);
}

let failed = false;

for (const implFile of implFiles) {
  const testFile = implFile.replace(/\.ts$/, ".test.ts");
  console.log(`\nChecking ${implFile} -> ${testFile}`);

  if (isCommentOrWhitespaceOnly(implFile)) {
    console.log(
      "  OK: comment/whitespace-only change, no paired test change required.",
    );
    continue;
  }

  if (!files.includes(testFile)) {
    console.error(
      `  FAIL: ${implFile} changed without a corresponding change to ${testFile}.`,
    );
    failed = true;
    continue;
  }

  if (!existsSync(testFile)) {
    console.error(
      `  FAIL: ${testFile} is listed as changed but doesn't exist on disk.`,
    );
    failed = true;
    continue;
  }

  const assertionCount = countLiteralAssertions(testFile);
  if (assertionCount < MIN_ASSERTIONS) {
    console.error(
      `  FAIL: ${testFile} has ${assertionCount} literal-value assertions (toBe/toEqual with a numeric literal), needs at least ${MIN_ASSERTIONS}. A test that exists but doesn't assert specific expected values doesn't prove correctness -- see TESTING_STANDARD.md.`,
    );
    failed = true;
    continue;
  }

  const testFirstCommit = firstCommitTouching(testFile);
  const implFirstCommit = firstCommitTouching(implFile);
  if (testFirstCommit && implFirstCommit) {
    const order = run(`git log --reverse --format=%H ${BASE_REF}..HEAD`).split(
      "\n",
    );
    const testIdx = order.indexOf(testFirstCommit);
    const implIdx = order.indexOf(implFirstCommit);
    if (testIdx > implIdx) {
      console.error(
        `  FAIL: ${implFile} was committed before ${testFile} in this PR's history. Golden-value tests must be committed first (test-first, not written to match the implementation's own output). See TESTING_STANDARD.md.`,
      );
      failed = true;
      continue;
    }
  }

  console.log(
    `  OK: ${assertionCount} literal assertions, test-first ordering confirmed.`,
  );
}

if (failed) {
  console.error(
    "\ncritical-module-guard: one or more src/lib/** changes failed the golden-value/test-first check.",
  );
  process.exit(1);
}

console.log("\ncritical-module-guard: all checks passed.");
