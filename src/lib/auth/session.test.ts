import { describe, expect, it } from "vitest";
import { signSession, verifySession } from "./session";

// Golden values hand-derived from Node's crypto.createHmac("sha256", ...)
// independently of the implementation under test, per TESTING_STANDARD.md
// section 1a.
const SECRET = "test-session-secret";

describe("signSession (fixed-secret golden values)", () => {
  it("signs a known player id with the expected HMAC-SHA256 hex signature", () => {
    const token = signSession("11111111-1111-1111-1111-111111111111", SECRET);
    expect(token).toBe(
      "11111111-1111-1111-1111-111111111111.a2702cf3b83f2584cc928ac5bfea709177d41356c9ad5a1d94e896f135b2869d",
    );
    const parts = token.split(".");
    expect(parts.length).toBe(2);
    expect(parts[1].length).toBe(64);
  });

  it("signs a second known player id with the expected signature", () => {
    const token = signSession("player-abc", SECRET);
    expect(token).toBe(
      "player-abc.a40f63348f2b9972dbcd0a959cf9054ab799e883cbc12cb4ff3d3fe3f711f62c",
    );
    const parts = token.split(".");
    expect(parts.length).toBe(2);
    expect(parts[1].length).toBe(64);
  });

  it("signs a third known player id with the expected signature", () => {
    const token = signSession("22222222-2222-2222-2222-222222222222", SECRET);
    expect(token).toBe(
      "22222222-2222-2222-2222-222222222222.740d0d41dd4bd3d73aa4707ee6bcdb8d217dd6b72a2ba0966507719b3cc0bdf0",
    );
    const parts = token.split(".");
    expect(parts.length).toBe(2);
    expect(parts[1].length).toBe(64);
  });

  it("produces a token with exactly one '.' separator and a 64-hex-char signature", () => {
    const token = signSession("some-player-id", SECRET);
    const parts = token.split(".");
    expect(parts.length).toBe(2);
    expect(parts[1].length).toBe(64);
  });
});

describe("verifySession", () => {
  it("round-trips a signed token back to the original player id", () => {
    const token = signSession("player-xyz", SECRET);
    expect(verifySession(token, SECRET)).toBe("player-xyz");
  });

  it("rejects a token signed with a different secret", () => {
    const token = signSession("player-xyz", SECRET);
    expect(verifySession(token, "a-different-secret")).toBe(null);
  });

  it("rejects a tampered player id even if the signature format looks valid", () => {
    const token = signSession("player-xyz", SECRET);
    const [, signature] = token.split(".");
    const tampered = `someone-else.${signature}`;
    expect(verifySession(tampered, SECRET)).toBe(null);
  });

  it("rejects a malformed token instead of throwing", () => {
    expect(verifySession("not-a-valid-token", SECRET)).toBe(null);
    expect(verifySession("", SECRET)).toBe(null);
  });
});
