import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SALT_BYTES = 16;
const KEY_BYTES = 64;

/**
 * Derives a scrypt key for a secret against a caller-supplied salt. Exposed
 * (rather than kept private) so it can be golden-value tested against a
 * fixed salt -- hashSecret's own random salt makes its output non-deterministic.
 */
export function deriveKeyHex(secret: string, saltHex: string): string {
  const salt = Buffer.from(saltHex, "hex");
  return scryptSync(secret, salt, KEY_BYTES).toString("hex");
}

/** Hashes a secret with a fresh random salt. Stored format: `<saltHex>:<keyHex>`. */
export async function hashSecret(secret: string): Promise<string> {
  const saltHex = randomBytes(SALT_BYTES).toString("hex");
  const keyHex = deriveKeyHex(secret, saltHex);
  return `${saltHex}:${keyHex}`;
}

/** Verifies a secret against a stored `<saltHex>:<keyHex>` value. */
export async function verifySecret(
  secret: string,
  stored: string,
): Promise<boolean> {
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
