import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const SALT_BYTES = 16;
const KEY_BYTES = 64;

const scryptAsync = promisify(scrypt) as (
  secret: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

/**
 * Derives a scrypt key for a secret against a caller-supplied salt. Exposed
 * (rather than kept private) so it can be golden-value tested against a
 * fixed salt -- hashSecret's own random salt makes its output non-deterministic.
 *
 * Uses the callback-based `crypto.scrypt`, not `scryptSync` -- scrypt's CPU
 * cost is the security property (do not lower N/r/p to make this faster),
 * but a synchronous call blocks a Hobby function's single vCPU for the full
 * derivation. The async form yields the event loop instead, at identical
 * cost and identical output.
 */
export async function deriveKeyHex(
  secret: string,
  saltHex: string,
): Promise<string> {
  const salt = Buffer.from(saltHex, "hex");
  const key = await scryptAsync(secret, salt, KEY_BYTES);
  return key.toString("hex");
}

/** Hashes a secret with a fresh random salt. Stored format: `<saltHex>:<keyHex>`. */
export async function hashSecret(secret: string): Promise<string> {
  const saltHex = randomBytes(SALT_BYTES).toString("hex");
  const keyHex = await deriveKeyHex(secret, saltHex);
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
  const actualKeyHex = await deriveKeyHex(secret, saltHex);
  const expected = Buffer.from(expectedKeyHex, "hex");
  const actual = Buffer.from(actualKeyHex, "hex");
  return timingSafeEqual(expected, actual);
}
