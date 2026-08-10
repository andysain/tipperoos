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
// no-op for the common case.
//
// Incremental re-review: a per-branch "last reviewed SHA" is recorded
// locally (.git/tipperoos-review-state.json, never committed) after a run
// where every lane came back clean. The *next* push on that branch only
// sends lanes the diff since that SHA, not the whole PR again -- several
// small pushes iterating on the same branch no longer re-pay for the
// already-reviewed portion. Falls back to the full merge-base diff if the
// recorded SHA isn't an ancestor of HEAD anymore (rebase, branch reuse,
// force-push) or isn't recorded yet. State is only written on the fully
// clean path -- a run that blocked or fixed something must not mark
// anything as reviewed, since the next push still needs to re-check it.
//
// Tiering: lane selection scales with blast radius, judged by *which
// files* the diff-under-review touches, not diff size -- a one-line change
// to lock-time comparison is high-risk at 1 line; a 200-line pure-styling
// diff is low-risk regardless of size. See LARGE_RISK_PATTERNS /
// LOW_RISK_PATTERNS below.
//   - Large (touches src/lib/**, src/app/api/**, supabase/migrations/**,
//     or the session-cookie module): all 3 lanes, run separately, as
//     before -- this is the CODEOWNERS-gated/security-named surface.
//   - Medium (default -- anything not caught by the large or low
//     patterns): 2 calls -- correctness + spec-conformance combined into
//     one call, security kept standalone. Security is never merged with
//     another lane at any tier: CLAUDE.md names it as this app's single
//     biggest security invariant and its lane is a fixed checklist
//     (client-side Supabase, lock enforcement, cookie flags, PIN hashing,
//     kid-friendly copy) that's cheap to run focused and the likeliest to
//     silently drop a checklist item if diluted into a broader pass.
//   - Low (every changed file matches LOW_RISK_PATTERNS -- currently just
//     src/components/ui/**, pure presentational primitives): all 3 lanes
//     combined into a single call.
// The trigger-path lists are the maintenance cost of this scheme: they
// need updating whenever the app grows a new sensitive area (a new API
// route directory, a new src/lib/** module) or a new safely-low-risk one --
// an unclassified new src/lib/** file silently reviewed at Medium tier is
// exactly the failure mode this tiering could introduce if the lists rot.

import { execSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LANES = ["correctness", "security", "spec-conformance"];
const REVIEW_DIR = ".github/claude/review";
const STATE_FILE = ".git/tipperoos-review-state.json";
const READ_ONLY_TOOLS =
  "Read,Grep,Glob,Bash(git show *),Bash(git diff *),Bash(git log *)";
const LANE_TOOLS =
  "Read,Grep,Glob,Edit,Write,Bash(git add *),Bash(git commit *),Bash(git diff *),Bash(git log *),Bash(git status),Bash(npm run typecheck),Bash(npm run lint),Bash(npm run test),Bash(npm run build)";

// Order matters only for readability of the concatenated prompt.
const LARGE_RISK_PATTERNS = [
  /^src\/lib\//,
  /^src\/app\/api\//,
  /^supabase\/migrations\//,
  /^src\/app\/_lib\/session-cookie\.ts$/,
];
const LOW_RISK_PATTERNS = [/^src\/components\/ui\//];

function classifyTier(changedFiles) {
  if (changedFiles.some((f) => LARGE_RISK_PATTERNS.some((p) => p.test(f)))) {
    return "large";
  }
  if (changedFiles.every((f) => LOW_RISK_PATTERNS.some((p) => p.test(f)))) {
    return "low";
  }
  return "medium";
}

// Each group is one `claude` call. `name` is used for logging and the
// block-file name; `lanes` are concatenated into one prompt.
function buildGroups(tier) {
  if (tier === "large") {
    return LANES.map((lane) => ({ name: lane, lanes: [lane] }));
  }
  if (tier === "low") {
    return [{ name: "combined", lanes: [...LANES] }];
  }
  return [
    {
      name: "correctness+spec-conformance",
      lanes: ["correctness", "spec-conformance"],
    },
    { name: "security", lanes: ["security"] },
  ];
}

function readState() {
  if (!existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeState(state) {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch {
    // Non-fatal -- worst case the next push just re-reviews from scratch.
  }
}

function isAncestor(sha, ref) {
  try {
    execSync(`git merge-base --is-ancestor ${sha} ${ref}`, {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

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
} catch {
  // Fetch or rev-list failed (shallow clone, unrelated histories, offline)
  // -- skip the warning silently rather than crashing the hook over it;
  // the merge-base/diff logic below handles the same failure the same way.
  fetchOk = false;
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

let base;
try {
  base = run("git merge-base origin/main HEAD");
} catch {
  console.log(
    "local-pr-review: couldn't fetch/diff against origin/main, skipping.",
  );
  process.exit(0);
}

const head = run("git rev-parse HEAD");
const state = readState();
const lastReviewed = state[branch];

// Only narrow the review range if the recorded SHA is still an ancestor of
// HEAD (a rebase or force-push invalidates it) and there's actually
// something new since then -- otherwise fall back to the full PR diff.
let reviewBase = base;
let incremental = false;
if (lastReviewed && lastReviewed !== head && isAncestor(lastReviewed, "HEAD")) {
  reviewBase = lastReviewed;
  incremental = true;
}

const diff = run(`git diff ${reviewBase}...HEAD`);
if (!diff.trim()) {
  console.log(
    "local-pr-review: nothing new since the last clean review, skipping.",
  );
  process.exit(0);
}

const changedFiles = run(`git diff --name-only ${reviewBase}...HEAD`)
  .split("\n")
  .filter(Boolean);
const docsOnly = changedFiles.every((file) => file.endsWith(".md"));
if (docsOnly) {
  console.log(
    "local-pr-review: docs-only diff -- lanes still run, verify pass skipped.",
  );
}
if (incremental) {
  console.log(
    `local-pr-review: reviewing only the diff since the last clean review (${lastReviewed.slice(0, 7)}), not the whole PR again.`,
  );
}

const tier = classifyTier(changedFiles);
console.log(
  `local-pr-review: tier = ${tier} (${changedFiles.length} file${changedFiles.length === 1 ? "" : "s"} changed).`,
);

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

for (const group of buildGroups(tier)) {
  const blockFile = join(workDir, `block-${group.name}.txt`);
  const laneDocs = group.lanes
    .map((lane) => readFileSync(join(REVIEW_DIR, `${lane}.md`), "utf8"))
    .join("\n\n");
  const multiLane = group.lanes.length > 1;
  const prompt = [
    sharedContext,
    multiLane
      ? `You are covering ${group.lanes.length} review lanes in this single pass (tier: ${tier}) -- give each the same attention as if it ran alone; don't let one lane's checklist crowd out another's.`
      : "",
    laneDocs,
    `Your block-file path if you need it (see the procedure below): ${blockFile}`,
    procedure,
  ]
    .filter(Boolean)
    .join("\n\n");

  const headBefore = run("git rev-parse HEAD");

  console.log(`\n--- ${group.name} ${multiLane ? "lanes" : "lane"} ---`);
  const result = callClaude(prompt, LANE_TOOLS);

  if (result.status !== 0) {
    console.error(
      `local-pr-review: ${group.name} lane's claude invocation failed (exit ${result.status}) -- not blocking the push on a tooling failure, but worth checking why.`,
    );
    continue;
  }

  const headAfter = run("git rev-parse HEAD");
  const laneCommitted = headAfter !== headBefore;
  const laneBlocked = existsSync(blockFile);

  if (!laneCommitted && !laneBlocked) {
    continue;
  }

  // Verified independently, not as mutually exclusive cases -- a group can
  // legitimately both fix one thing and block on a separate thing it
  // couldn't safely fix in the same run. Treating them as either/or here
  // used to mean a co-occurring fix silently skipped verification whenever
  // a block was also present.
  if (laneBlocked) {
    if (docsOnly) {
      console.log(`  ${group.name}'s block trusted as-is (docs-only diff).`);
      blocked = true;
    } else {
      console.log(`\n--- verifying ${group.name}'s block ---`);
      const finding = `The ${group.name} lane(s) flagged a blocking issue it could not safely fix:\n\n${readFileSync(blockFile, "utf8")}`;
      const verdict = parseVerdict(verify(sharedContext, finding), "CONFIRMED");
      if (verdict === "CONFIRMED") {
        console.log(`  verify: ${group.name}'s block confirmed.`);
        blocked = true;
      } else {
        console.log(
          `  verify: ${group.name}'s block rejected on independent review -- not blocking the push on it.`,
        );
        unlinkSync(blockFile);
      }
    }
  }

  if (laneCommitted) {
    if (docsOnly) {
      console.log(`  ${group.name}'s fix trusted as-is (docs-only diff).`);
      fixed = true;
    } else {
      console.log(`\n--- verifying ${group.name}'s fix ---`);
      const finding = `The ${group.name} lane(s) committed the following fix:\n\n\`\`\`\n${run("git show HEAD")}\n\`\`\``;
      const verdict = parseVerdict(verify(sharedContext, finding), "REJECTED");
      if (verdict === "CONFIRMED") {
        console.log(`  verify: ${group.name}'s fix confirmed.`);
        fixed = true;
      } else {
        console.log(
          `  verify: ${group.name}'s fix rejected on independent review -- reverting it.`,
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

// Only the fully-clean path records progress -- a blocked/fixed run exits
// above without reaching here, so the next push still re-reviews from the
// same point rather than skipping past unresolved or just-fixed work.
writeState({ ...state, [branch]: run("git rev-parse HEAD") });

console.log("\nlocal-pr-review: all lanes clean.");
