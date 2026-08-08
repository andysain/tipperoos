// Script-side mirror of src/lib/auth/competitions.ts (see scripts/lib/scrypt-secret.mjs
// for why this can't just import the TS module). scripts/lib/parity.test.ts
// asserts the two stay in agreement.

import { verifySecret } from "./scrypt-secret.mjs";

/**
 * Case-insensitive, whitespace-tolerant (copy/paste from a text/email),
 * applied identically before hashing and before verifying so the two stay
 * in agreement.
 */
export function normalizeCompetitionCode(code) {
  return code.trim().toLowerCase();
}

/**
 * Verifies a plaintext code against every row's code_hash via the same
 * scrypt path as login, returning the matching row (not just its id) so
 * callers can classify the match themselves -- see issue #79:
 * `set-competition-code.mjs` treats a match on its own target row as a
 * no-op, any other match as an abort; #70's bootstrap script (no target
 * row) treats any non-null match as an abort.
 */
export async function findCollidingCompetition(rows, plaintext) {
  const normalized = normalizeCompetitionCode(plaintext);
  if (!normalized) return null;
  for (const row of rows) {
    if (await verifySecret(normalized, row.codeHash)) {
      return { id: row.id, name: row.name };
    }
  }
  return null;
}
