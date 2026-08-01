import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/** Signs a stateless session token: `<playerId>.<hmacSha256Hex>`. */
export function signSession(playerId: string, secret: string): string {
  const signature = createHmac("sha256", secret).update(playerId).digest("hex");
  return `${playerId}.${signature}`;
}

/** Verifies a session token, returning the player id if valid, else null. */
export function verifySession(token: string, secret: string): string | null {
  const separatorIndex = token.lastIndexOf(".");
  if (separatorIndex === -1) return null;

  const playerId = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);
  if (!playerId || !signature) return null;

  const expected = createHmac("sha256", secret).update(playerId).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== actualBuf.length) return null;
  if (!timingSafeEqual(expectedBuf, actualBuf)) return null;

  return playerId;
}
