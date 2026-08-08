// Script-side mirror of src/lib/auth/scrypt-secret.ts. That module is
// guarded by `import "server-only"`, which throws outside a Next.js server
// bundle, so a plain `node` script can't import it directly (see issue #79).
// Kept line-for-line comparable with the TS original -- scripts/lib/parity.test.ts
// asserts the two agree, so this file's own comment is a convenience, not
// the enforcement mechanism.

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SALT_BYTES = 16;
const KEY_BYTES = 64;

function deriveKeyHex(secret, saltHex) {
  const salt = Buffer.from(saltHex, "hex");
  return scryptSync(secret, salt, KEY_BYTES).toString("hex");
}

/** Hashes a secret with a fresh random salt. Stored format: `<saltHex>:<keyHex>`. */
export async function hashSecret(secret) {
  const saltHex = randomBytes(SALT_BYTES).toString("hex");
  const keyHex = deriveKeyHex(secret, saltHex);
  return `${saltHex}:${keyHex}`;
}

/** Verifies a secret against a stored `<saltHex>:<keyHex>` value. */
export async function verifySecret(secret, stored) {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [saltHex, expectedKeyHex] = parts;
  if (
    saltHex.length !== SALT_BYTES * 2 ||
    expectedKeyHex.length !== KEY_BYTES * 2
  ) {
    return false;
  }
  if (!/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(expectedKeyHex)) {
    return false;
  }
  const actualKeyHex = deriveKeyHex(secret, saltHex);
  const expected = Buffer.from(expectedKeyHex, "hex");
  const actual = Buffer.from(actualKeyHex, "hex");
  return timingSafeEqual(expected, actual);
}
