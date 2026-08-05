// One-off script for issue #68: sets the real, hashed competition code for
// the one competitions row in this environment's Supabase project. Run
// manually, once per environment (local/staging/production), same pattern
// as seed-fixtures.mjs.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/set-competition-code.mjs
//
// The plaintext code is entered via a hidden interactive prompt -- never a
// CLI argument (which would land in shell history) and never written to any
// file. It only ever exists in this process's memory for the run and in the
// DB's hashed column afterward.
//
// Hashing is a self-contained reimplementation of the same scrypt
// "<saltHex>:<keyHex>" format as src/lib/auth/scrypt-secret.ts, rather than
// an import of it -- that module is guarded by `import "server-only"`,
// which throws outside a Next.js server bundle, so a plain `node` script
// (matching seed-fixtures.mjs's existing self-contained-script precedent)
// can't import it directly. Keep this in sync with scrypt-secret.ts if its
// salt/key sizes ever change.

import { createClient } from "@supabase/supabase-js";
import { randomBytes, scryptSync } from "node:crypto";
import readline from "node:readline";

const SALT_BYTES = 16;
const KEY_BYTES = 64;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

function hashSecret(secret) {
  const saltHex = randomBytes(SALT_BYTES).toString("hex");
  const keyHex = scryptSync(
    secret,
    Buffer.from(saltHex, "hex"),
    KEY_BYTES,
  ).toString("hex");
  return `${saltHex}:${keyHex}`;
}

function normalizeCompetitionCode(code) {
  return code.trim().toLowerCase();
}

// Hidden interactive prompt (input not echoed to the terminal), no
// third-party dependency -- mutes stdout while readline's own internal
// writes happen, matching the common Node "password prompt" pattern.
function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const originalWrite = rl._writeToOutput;
    rl._writeToOutput = function hiddenWrite(stringToWrite) {
      if (stringToWrite.trim() === question.trim()) {
        originalWrite.call(rl, stringToWrite);
      }
      // Otherwise: swallow the echoed keystrokes.
    };

    rl.question(question, (answer) => {
      if (Array.isArray(rl.history)) {
        rl.history = rl.history.slice(1);
      }
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  const { data: competitions, error } = await supabase
    .from("competitions")
    .select("id, name");
  if (error) throw error;

  if (competitions.length === 0) {
    throw new Error(
      "No competitions row found -- run the #68 migration first.",
    );
  }
  if (competitions.length > 1) {
    throw new Error(
      `Expected exactly one competitions row, found ${competitions.length}. ` +
        "This script only supports the single-competition case -- update it " +
        "by hand if you're intentionally setting a second one.",
    );
  }

  const competition = competitions[0];
  console.log(`Setting the code for competition "${competition.name}".`);

  const rawCode = await promptHidden("Enter the new competition code: ");
  const normalized = normalizeCompetitionCode(rawCode);
  if (!normalized) {
    throw new Error("Code cannot be empty.");
  }

  const codeHash = hashSecret(normalized);

  const { error: updateError } = await supabase
    .from("competitions")
    .update({ code_hash: codeHash })
    .eq("id", competition.id);
  if (updateError) throw updateError;

  console.log(`Code set for "${competition.name}".`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
