// Scripted simulation for issue #70 (TESTING_STANDARD.md §1b): proves the
// create_competition_with_admin() RPC, the app-level collision guard, and
// set-competition-code.mjs's multi-competition selector all behave
// correctly together -- a multi-step scenario spanning a migration, an
// RPC, and two scripts, which is exactly what §1b/ISSUE_STANDARD.md §6
// point at "scripted simulation" for rather than a unit test or a manual
// staging check.
//
// This repo has no local Docker/Postgres stack (CLAUDE.md's three-environment
// mapping), so this runs against staging, same as #80's
// verify-competition-scope-isolation.mjs. Not a CI gate -- run manually
// before trusting the bootstrap flow against real data. Every row it
// inserts (competitions, players) is deleted again in a `finally` block.
//
// Usage:
//   SUPABASE_URL=<staging project URL> \
//   SUPABASE_SERVICE_ROLE_KEY=<staging service_role key> \
//   node scripts/verify-bootstrap-competition.mjs

import { createClient } from "@supabase/supabase-js";
import { hashSecret, verifySecret } from "./lib/scrypt-secret.mjs";
import { findCollidingCompetition } from "./lib/competitions.mjs";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

const supabase = createClient(
  requireEnv("SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } },
);

let failures = 0;
function assert(condition, message) {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`ok: ${message}`);
  }
}

async function bootstrap({ name, plaintextCode, displayName, pin, emoji }) {
  const codeHash = await hashSecret(plaintextCode);
  const pinHash = await hashSecret(pin);
  const { data, error } = await supabase.rpc("create_competition_with_admin", {
    competition_name: name,
    competition_code_hash: codeHash,
    admin_display_name: displayName,
    admin_pin_hash: pinHash,
    admin_emoji: emoji,
  });
  if (error) throw error;
  const [row] = data;
  return { competitionId: row.competition_id, adminId: row.admin_id };
}

async function main() {
  const runId = Date.now();
  const cleanupIds = { competitions: [] };

  try {
    // --- Step 1: bootstrap a competition + admin via the RPC ---

    const compAName = `verify-bootstrap-A-${runId}`;
    const compACode = `code-a-${runId}`;
    const compA = await bootstrap({
      name: compAName,
      plaintextCode: compACode,
      displayName: `Admin A ${runId}`,
      pin: "1234",
      emoji: "🏆",
    });
    cleanupIds.competitions.push(compA.competitionId);

    assert(!!compA.competitionId, "RPC returns a competition id");
    assert(!!compA.adminId, "RPC returns an admin id");

    // --- Step 2: the created admin can log in immediately ---

    const { data: admin, error: adminFetchError } = await supabase
      .from("players")
      .select(
        "id, competition_id, is_admin, is_bot, pin_reset_required, pin_hash, failed_pin_attempts, locked_until",
      )
      .eq("id", compA.adminId)
      .single();
    if (adminFetchError) throw adminFetchError;

    assert(
      admin.competition_id === compA.competitionId,
      "admin's competition_id matches the new competition",
    );
    assert(admin.is_admin === true, "admin has is_admin = true");
    assert(admin.is_bot === false, "admin has is_bot = false");
    assert(
      admin.pin_reset_required === false,
      "admin has pin_reset_required = false (no forced-reset landmine)",
    );
    assert(
      admin.failed_pin_attempts === 0 && admin.locked_until === null,
      "admin starts with a clean lockout state",
    );
    assert(
      await verifySecret("1234", admin.pin_hash),
      "admin's PIN hash verifies against the PIN the script set",
    );
    assert(
      !(await verifySecret("9999", admin.pin_hash)),
      "admin's PIN hash rejects a wrong PIN",
    );

    // --- Step 3: collision guard would abort a repeat bootstrap with the same code ---

    const { data: afterFirst, error: afterFirstError } = await supabase
      .from("competitions")
      .select("id, name, code_hash")
      .order("created_at");
    if (afterFirstError) throw afterFirstError;

    const collisionOnRepeat = await findCollidingCompetition(
      afterFirst.map((c) => ({
        id: c.id,
        name: c.name,
        codeHash: c.code_hash,
      })),
      compACode,
    );
    assert(
      collisionOnRepeat?.id === compA.competitionId,
      "re-submitting compA's code is detected as a collision before any write -- " +
        "bootstrap-competition.mjs's `if (colliding) throw` fires here, so no second RPC call is ever made",
    );

    // --- Step 4: bootstrap a second competition, confirm set-competition-code.mjs's selector still works ---

    const compBName = `verify-bootstrap-B-${runId}`;
    const compBCode = `code-b-${runId}`;
    const compB = await bootstrap({
      name: compBName,
      plaintextCode: compBCode,
      displayName: `Admin B ${runId}`,
      pin: "5678",
      emoji: null,
    });
    cleanupIds.competitions.push(compB.competitionId);

    const { data: afterSecond, error: afterSecondError } = await supabase
      .from("competitions")
      .select("id, name, code_hash, created_at")
      .order("created_at");
    if (afterSecondError) throw afterSecondError;

    const ourRows = afterSecond.filter((c) =>
      cleanupIds.competitions.includes(c.id),
    );
    assert(
      ourRows.length === 2 &&
        ourRows[0].id === compA.competitionId &&
        ourRows[1].id === compB.competitionId,
      'set-competition-code.mjs\'s `.order("created_at")` selector returns our two ' +
        "competitions in creation order, deterministically",
    );

    // Rotate-collision guard, same three cases set-competition-code.mjs's
    // new selector runs: target match (no-op), other match (abort), no match (write).
    const rowsForRotate = ourRows.map((c) => ({
      id: c.id,
      name: c.name,
      codeHash: c.code_hash,
    }));

    const rotateToOwnCode = await findCollidingCompetition(
      rowsForRotate,
      compACode,
    );
    assert(
      rotateToOwnCode?.id === compA.competitionId,
      "rotating compA to its own current code is a no-op (matches itself, not an abort)",
    );

    const rotateToOtherCode = await findCollidingCompetition(
      rowsForRotate,
      compBCode,
    );
    assert(
      rotateToOtherCode?.id === compB.competitionId,
      "rotating compA to compB's code is detected as a collision and would abort, naming compB",
    );

    const rotateToFreshCode = await findCollidingCompetition(
      rowsForRotate,
      `code-fresh-${runId}`,
    );
    assert(
      rotateToFreshCode === null,
      "rotating compA to an unused code has no collision and would write",
    );
  } finally {
    await supabase
      .from("players")
      .delete()
      .in("competition_id", cleanupIds.competitions);
    await supabase
      .from("competitions")
      .delete()
      .in("id", cleanupIds.competitions);
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll bootstrap-competition checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
