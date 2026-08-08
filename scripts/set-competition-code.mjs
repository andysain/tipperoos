// One-off script for issue #68 (extended by #70 for the multi-competition
// case): sets the real, hashed competition code for a competitions row in
// this environment's Supabase project. Run manually, once per environment
// (local/staging/production), same pattern as seed-fixtures.mjs.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/set-competition-code.mjs
//
// The plaintext code is entered via a hidden interactive prompt -- never a
// CLI argument (which would land in shell history) and never written to any
// file. It only ever exists in this process's memory for the run and in the
// DB's hashed column afterward.
//
// Hashing/normalization/prompt logic lives in scripts/lib/ -- a
// dependency-free mirror of src/lib/auth/scrypt-secret.ts and
// competitions.ts, since those are guarded by `import "server-only"`,
// which throws outside a Next.js server bundle, so a plain `node` script
// can't import them directly. scripts/lib/parity.test.ts keeps the two
// sides in agreement; see issue #79.

import { createClient } from "@supabase/supabase-js";
import { hashSecret } from "./lib/scrypt-secret.mjs";
import {
  normalizeCompetitionCode,
  findCollidingCompetition,
} from "./lib/competitions.mjs";
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

// Postgres row order is arbitrary -- an unordered numbered list could mean
// a different competition between two runs with nothing on screen to
// reveal it (AGENTS.md's .order() non-negotiable, which names this
// script's selector as a site to fix).
async function selectCompetition(competitions) {
  if (competitions.length === 1) {
    return competitions[0];
  }

  console.log("Multiple competitions found:");
  competitions.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.name} (${c.id.slice(0, 8)})`);
  });

  const answer = await prompt(
    `Choose a competition (1-${competitions.length}): `,
  );
  const index = Number.parseInt(answer, 10) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= competitions.length) {
    throw new Error(`Invalid choice: "${answer}".`);
  }
  return competitions[index];
}

async function main() {
  const { data: competitions, error } = await supabase
    .from("competitions")
    .select("id, name, code_hash")
    .order("created_at");
  if (error) throw error;

  if (competitions.length === 0) {
    throw new Error(
      "No competitions row found -- run the #68 migration first.",
    );
  }

  const competition = await selectCompetition(competitions);
  console.log(`Setting the code for competition "${competition.name}".`);

  const rawCode = await promptHidden("Enter the new competition code: ");
  const normalized = normalizeCompetitionCode(rawCode);
  if (!normalized) {
    throw new Error("Code cannot be empty.");
  }

  // Rotate-collision guard: two competitions sharing a plaintext code is an
  // unresolvable routing ambiguity for matchCompetitionByCode, not a config
  // choice -- so a match on another competition aborts, not just warns. A
  // match on the target competition itself is a no-op (also avoids a
  // pointless code_hash re-salt, which buys nothing since the hash is only
  // useful to someone who already has the plaintext).
  const colliding = await findCollidingCompetition(
    competitions.map((c) => ({
      id: c.id,
      name: c.name,
      codeHash: c.code_hash,
    })),
    normalized,
  );
  if (colliding && colliding.id === competition.id) {
    console.log(
      `Code unchanged for "${competition.name}" -- already set to this value.`,
    );
    return;
  }
  if (colliding) {
    throw new Error(
      `That code is already in use by competition "${colliding.name}". ` +
        "Choose a different code.",
    );
  }

  const codeHash = await hashSecret(normalized);

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
