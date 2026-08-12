// One-off script for issue #70: creates a new competition and its exactly-one
// Competition Admin atomically. Run manually, once per environment/competition,
// same pattern as seed-fixtures.mjs and set-competition-code.mjs.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/bootstrap-competition.mjs
//
// Atomicity comes from the create_competition_with_admin() Postgres function
// (supabase/migrations/20260808000000_create_competition_with_admin.sql),
// called via RPC -- @supabase/supabase-js/PostgREST has no multi-statement
// transaction, so two separate .insert() calls could leave a competition
// live with no admin able to fix anything if the second one failed.
//
// The competition code and admin PIN are entered via hidden interactive
// prompts -- never a CLI argument (shell history) and never written to any
// file. Both are hashed in this process before the RPC call; the function
// never sees plaintext.

import { createClient } from "@supabase/supabase-js";
import { hashSecret } from "./lib/scrypt-secret.mjs";
import {
  normalizeCompetitionCode,
  findCollidingCompetition,
} from "./lib/competitions.mjs";
import {
  validateDisplayName,
  validatePinFormat,
} from "./lib/signup-validation.mjs";
import { prompt, promptHidden } from "./lib/prompt.mjs";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function promptCompetitionName() {
  const name = (await prompt("Competition name: ")).trim();
  if (!name) {
    throw new Error("Competition name cannot be empty.");
  }
  return name;
}

async function promptCompetitionCode() {
  const rawCode = await promptHidden("Enter the new competition's code: ");
  const normalized = normalizeCompetitionCode(rawCode);
  if (!normalized) {
    throw new Error("Code cannot be empty.");
  }
  return normalized;
}

async function promptAdminDisplayName() {
  const rawName = await prompt("Admin display name: ");
  const result = validateDisplayName(rawName);
  if (!result.ok) {
    throw new Error(result.reason);
  }
  return result.normalized;
}

// Double hidden prompt, compared before hashing -- this is the one account
// whose PIN nobody else can reset (no self-service path, by design, same
// shape as the competition code), so a typo here is unrecoverable without a
// direct DB write.
async function promptAdminPin() {
  const first = await promptHidden("Admin PIN (4 digits): ");
  if (!validatePinFormat(first)) {
    throw new Error("PIN must be exactly 4 digits.");
  }
  const second = await promptHidden("Confirm admin PIN: ");
  if (first !== second) {
    throw new Error("PINs did not match.");
  }
  return first;
}

async function promptAdminEmoji() {
  const raw = await prompt("Admin emoji: ");
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Admin emoji cannot be empty.");
  }
  return trimmed;
}

async function main() {
  const competitionName = await promptCompetitionName();
  const plaintextCode = await promptCompetitionCode();

  // Collision guard is app-level, not a DB constraint: hashSecret salts
  // every call, so two competitions sharing a plaintext code would still
  // get different code_hash values -- a unique constraint couldn't detect
  // that (see supabase/migrations/20260804010000_competitions.sql:6-12).
  // Without this check, matchCompetitionByCode would silently route
  // players into whichever row Postgres returned first.
  const { data: existingCompetitions, error: fetchError } = await supabase
    .from("competitions")
    .select("id, name, code_hash")
    .order("created_at");
  if (fetchError) throw fetchError;

  const colliding = await findCollidingCompetition(
    existingCompetitions.map((row) => ({
      id: row.id,
      name: row.name,
      codeHash: row.code_hash,
    })),
    plaintextCode,
  );
  if (colliding) {
    throw new Error(
      `That code is already in use by competition "${colliding.name}". ` +
        "Choose a different code.",
    );
  }

  const adminDisplayName = await promptAdminDisplayName();
  const adminPin = await promptAdminPin();
  const adminEmoji = await promptAdminEmoji();

  const codeHash = await hashSecret(plaintextCode);
  const pinHash = await hashSecret(adminPin);

  const { data, error } = await supabase.rpc("create_competition_with_admin", {
    competition_name: competitionName,
    competition_code_hash: codeHash,
    admin_display_name: adminDisplayName,
    admin_pin_hash: pinHash,
    admin_emoji: adminEmoji,
  });
  if (error) throw error;

  const [row] = data;
  console.log(
    `Created competition "${competitionName}" (id: ${row.competition_id}).`,
  );
  console.log(
    `Created admin "${adminDisplayName}" (id: ${row.admin_id}) -- can log in immediately.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
