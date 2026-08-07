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
// Verify pass: a lane's raw output isn't trusted on its own -- running the
// same lane twice against the same diff has produced different answers in
// practice (low-effort, "plausible"-confidence findings aren't fully
// deterministic). Only runs when a lane actually flags something (a block
// file or a fix commit), so the common case (nothing found) pays nothing
// extra. The verify pass is read-only and only judges; this script does the
// actual git operations based on its verdict, deliberately -- an LLM never
// gets `git reset --hard` in its own tool allowlist.
//
// Also skipped outright when every changed file is a *.md doc -- low
// enough stakes (nothing here can break the app) that the extra pass isn't
// worth paying for. Lanes still run against docs-only diffs (they've
// caught real issues, e.g. a stale cross-reference), just without the
// second-guessing step; a lane's block/fix is trusted directly in that case.
//
// Skips entirely on `main` or when there's no diff against it -- fast
// no-op for the common case. Not cached across pushes: iterating with
// several small pushes to the same branch re-reviews the accumulated diff
// each time. Acceptable at this project's scale; revisit if it gets
// annoying.

import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LANES = ["correctness", "security", "spec-conformance"];
const REVIEW_DIR = ".github/claude/review";
const READ_ONLY_TOOLS =
  "Read,Grep,Glob,Bash(git show *),Bash(git diff *),Bash(git log *)";
const LANE_TOOLS =
  "Read,Grep,Glob,Edit,Write,Bash(git add *),Bash(git commit *),Bash(git diff *),Bash(git log *),Bash(git status),Bash(npm run typecheck),Bash(npm run lint),Bash(npm run test),Bash(npm run build)";

function run(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

// Lane calls stream live (stdio: inherit) so a push isn't silent for
// however long a lane takes. The verify call captures instead, since its
// final line has to be parsed for a verdict.
function callClaude(prompt, allowedTools, { capture = false } = {}) {
  const args = [
    "-p",
    "--model",
    "claude-sonnet-5",
    "--effort",
    "low",
    "--max-turns",
    "12",
    "--permission-mode",
    "acceptEdits",
    "--allowedTools",
    allowedTools,
  ];
  return capture
    ? spawnSync("claude", args, { input: prompt, encoding: "utf8" })
    : spawnSync("claude", args, {
        input: prompt,
        encoding: "utf8",
        stdio: ["pipe", "inherit", "inherit"],
      });
}

// Defaults to whichever outcome is safer to assume on a malformed/missing
// verdict: REJECTED for a fix (don't trust an unverified code change),
// CONFIRMED for a block (don't silently let an unverified finding through).
function parseVerdict(output, fallback) {
  const matches = [...output.matchAll(/VERDICT:\s*(CONFIRMED|REJECTED)/gi)];
  if (matches.length === 0) return fallback;
  return matches[matches.length - 1][1].toUpperCase();
}

function verify(sharedContext, findingDescription) {
  const prompt = [
    sharedContext,
    readFileSync(join(REVIEW_DIR, "verify.md"), "utf8"),
    findingDescription,
  ].join("\n\n");

  console.log("  (verifying...)");
  const result = callClaude(prompt, READ_ONLY_TOOLS, { capture: true });
  if (result.status !== 0) {
    console.error(
      `  verify: claude invocation itself failed (exit ${result.status}) -- treating as unverified.`,
    );
    return "";
  }
  const output = result.stdout ?? "";
  console.log(output.trim());
  return output;
}

const branch = run("git rev-parse --abbrev-ref HEAD");

// Best-effort staleness warning -- catches a checkout (including `main`
// itself) that's fallen behind origin/main just from sitting there, not
// only from new commits landing on it. Runs for every branch, before either
// early-exit below, since a stale primary checkout is exactly as dangerous
// as a stale feature branch (a real incident, not hypothetical -- a review
// session once nearly re-flagged two bugs that a same-day merged PR had
// already fixed, because this checkout hadn't pulled). Warn-only, never
// blocks: a git hook can't detect "time passed and nobody pulled," only
// "a push is happening right now," so this is a courtesy nudge at the one
// moment this script already talks to git, not a guarantee.
let fetchOk = true;
try {
  run("git fetch origin main --quiet");
} catch {
  fetchOk = false;
}
if (fetchOk) {
  const behind = Number(run("git rev-list --count HEAD..origin/main"));
  if (behind > 0) {
    const who = branch === "main" ? "main" : "this branch";
    const advice =
      branch === "main"
        ? "pull before starting new work here"
        : "consider rebasing before opening/updating the PR";
    console.warn(
      `local-pr-review: ${who} is ${behind} commit${behind === 1 ? "" : "s"} behind origin/main -- ${advice}.`,
    );
  }
}

if (branch === "main") {
  process.exit(0);
}

if (!fetchOk) {
  console.log(
    "local-pr-review: couldn't fetch/diff against origin/main, skipping.",
  );
  process.exit(0);
}

const base = run("git merge-base origin/main HEAD");

const diff = run(`git diff ${base}...HEAD`);
if (!diff.trim()) {
  process.exit(0);
}

const changedFiles = run(`git diff --name-only ${base}...HEAD`)
  .split("\n")
  .filter(Boolean);
const docsOnly = changedFiles.every((file) => file.endsWith(".md"));
if (docsOnly) {
  console.log(
    "local-pr-review: docs-only diff -- lanes still run, verify pass skipped.",
  );
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
  const result = callClaude(prompt, LANE_TOOLS);

  if (result.status !== 0) {
    console.error(
      `local-pr-review: ${lane} lane's claude invocation failed (exit ${result.status}) -- not blocking the push on a tooling failure, but worth checking why.`,
    );
    continue;
  }

  const headAfter = run("git rev-parse HEAD");
  const laneCommitted = headAfter !== headBefore;
  const laneBlocked = existsSync(blockFile);

  if (!laneCommitted && !laneBlocked) {
    continue;
  }

  // Verified independently, not as mutually exclusive cases -- a lane can
  // legitimately both fix one thing and block on a separate thing it
  // couldn't safely fix in the same run. Treating them as either/or here
  // used to mean a co-occurring fix silently skipped verification whenever
  // a block was also present.
  if (laneBlocked) {
    if (docsOnly) {
      console.log(`  ${lane}'s block trusted as-is (docs-only diff).`);
      blocked = true;
    } else {
      console.log(`\n--- verifying ${lane} lane's block ---`);
      const finding = `The ${lane} lane flagged a blocking issue it could not safely fix:\n\n${readFileSync(blockFile, "utf8")}`;
      const verdict = parseVerdict(verify(sharedContext, finding), "CONFIRMED");
      if (verdict === "CONFIRMED") {
        console.log(`  verify: ${lane}'s block confirmed.`);
        blocked = true;
      } else {
        console.log(
          `  verify: ${lane}'s block rejected on independent review -- not blocking the push on it.`,
        );
        unlinkSync(blockFile);
      }
    }
  }

  if (laneCommitted) {
    if (docsOnly) {
      console.log(`  ${lane}'s fix trusted as-is (docs-only diff).`);
      fixed = true;
    } else {
      console.log(`\n--- verifying ${lane} lane's fix ---`);
      const finding = `The ${lane} lane committed the following fix:\n\n\`\`\`\n${run("git show HEAD")}\n\`\`\``;
      const verdict = parseVerdict(verify(sharedContext, finding), "REJECTED");
      if (verdict === "CONFIRMED") {
        console.log(`  verify: ${lane}'s fix confirmed.`);
        fixed = true;
      } else {
        console.log(
          `  verify: ${lane}'s fix rejected on independent review -- reverting it.`,
        );
        run(`git reset --hard ${headBefore}`);
      }
    }
  }
}

if (blocked) {
  console.error(
    "\nlocal-pr-review: one or more lanes flagged a blocking issue, confirmed on independent review. Push aborted -- see output above.",
  );
  process.exit(1);
}

if (fixed) {
  console.error(
    "\nlocal-pr-review: a lane committed a fix, confirmed on independent review. Push aborted so the fix is included -- run `git push` again.",
  );
  process.exit(1);
}

console.log("\nlocal-pr-review: all lanes clean.");
