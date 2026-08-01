import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SALT_BYTES = 16;
const KEY_BYTES = 64;

/**
 * Derives a scrypt key for a PIN against a caller-supplied salt. Exposed
 * (rather than kept private) so it can be golden-value tested against a
 * fixed salt -- hashPin's own random salt makes its output non-deterministic.
 */
export function deriveKeyHex(pin: string, saltHex: string): string {
  const salt = Buffer.from(saltHex, "hex");
  return scryptSync(pin, salt, KEY_BYTES).toString("hex");
}

/** Hashes a PIN with a fresh random salt. Stored format: `<saltHex>:<keyHex>`. */
export async function hashPin(pin: string): Promise<string> {
  const saltHex = randomBytes(SALT_BYTES).toString("hex");
  const keyHex = deriveKeyHex(pin, saltHex);
  return `${saltHex}:${keyHex}`;
}

/** Verifies a PIN against a stored `<saltHex>:<keyHex>` value. */
export async function verifyPin(pin: string, stored: string): Promise<boolean> {
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
  const actualKeyHex = deriveKeyHex(pin, saltHex);
  const expected = Buffer.from(expectedKeyHex, "hex");
  const actual = Buffer.from(actualKeyHex, "hex");
  return timingSafeEqual(expected, actual);
}
