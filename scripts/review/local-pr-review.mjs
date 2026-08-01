#!/usr/bin/env node
// Runs the 3 review lanes (correctness / security / spec-conformance)
// locally, against the diff between this branch and main, before every
// `git push` -- wired in via .husky/pre-push. Uses whichever `claude` CLI
// session is already logged into your Claude subscription on this machine:
// no API key, no GitHub secrets, no GitHub Actions involved. See
// .github/claude/review/ for the lane content -- shared with the CI variant
// drafted alongside this (not currently wired up; see BUILD_PLAN.md
// decision 36).
//
// Blocking, not fixing-in-flight: a pre-push hook can't make the push it's
// currently gating include a commit made *during* this same run -- git has
// already resolved which SHA to push before invoking the hook. So if a lane
// commits a fix, this still aborts the current push; the fix commit is
// there on the next `git push`.
//
// Skips entirely on `main` or when there's no diff against it -- fast
// no-op for the common case. Not cached across pushes: iterating with
// several small pushes to the same branch re-reviews the accumulated diff
// each time. Acceptable at this project's scale; revisit if it gets
// annoying.

import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LANES = ["correctness", "security", "spec-conformance"];
const REVIEW_DIR = ".github/claude/review";

function run(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

const branch = run("git rev-parse --abbrev-ref HEAD");
if (branch === "main") {
  process.exit(0);
}

let base;
try {
  run("git fetch origin main --quiet");
  base = run("git merge-base origin/main HEAD");
} catch {
  console.log(
    "local-pr-review: couldn't fetch/diff against origin/main, skipping.",
  );
  process.exit(0);
}

const diff = run(`git diff ${base}...HEAD`);
if (!diff.trim()) {
  process.exit(0);
}

const workDir = mkdtempSync(join(tmpdir(), "tipperoos-review-"));
const sharedContext = [
  readFileSync("CLAUDE.md", "utf8"),
  readFileSync("AGENTS.md", "utf8"),
  readFileSync("docs/standards/TESTING_STANDARD.md", "utf8"),
  `## Diff being reviewed (branch \`${branch}\` vs \`main\`)`,
  "```diff",
  diff,
  "```",
].join("\n\n");

const procedure = readFileSync(join(REVIEW_DIR, "local-procedure.md"), "utf8");

let blocked = false;
let fixed = false;

for (const lane of LANES) {
  const blockFile = join(workDir, `block-${lane}.txt`);
  const prompt = [
    sharedContext,
    readFileSync(join(REVIEW_DIR, `${lane}.md`), "utf8"),
    `Your block-file path if you need it (see the procedure below): ${blockFile}`,
    procedure,
  ].join("\n\n");

  const headBefore = run("git rev-parse HEAD");

  console.log(`\n--- ${lane} lane ---`);
  const result = spawnSync(
    "claude",
    [
      "-p",
      "--model",
      "claude-sonnet-5",
      "--effort",
      "low",
      "--max-turns",
      "12",
      "--bare",
      "--permission-mode",
      "acceptEdits",
      "--allowedTools",
      "Read,Grep,Glob,Edit,Write,Bash(git add *),Bash(git commit *),Bash(git diff *),Bash(git log *),Bash(git status),Bash(npm run typecheck),Bash(npm run lint),Bash(npm run test),Bash(npm run build)",
    ],
    { input: prompt, encoding: "utf8", stdio: ["pipe", "inherit", "inherit"] },
  );

  if (result.status !== 0) {
    console.error(
      `local-pr-review: ${lane} lane's claude invocation failed (exit ${result.status}) -- not blocking the push on a tooling failure, but worth checking why.`,
    );
    continue;
  }

  if (existsSync(blockFile)) {
    blocked = true;
  }
  if (run("git rev-parse HEAD") !== headBefore) {
    fixed = true;
  }
}

if (blocked) {
  console.error(
    "\nlocal-pr-review: one or more lanes flagged a blocking issue. Push aborted -- see output above.",
  );
  process.exit(1);
}

if (fixed) {
  console.error(
    "\nlocal-pr-review: a lane committed a fix locally. Push aborted so the fix is included -- run `git push` again.",
  );
  process.exit(1);
}

console.log("\nlocal-pr-review: all lanes clean.");
