import { describe, expect, it } from "vitest";
import { deriveKeyHex, hashPin, verifyPin } from "./pin";

// Golden values hand-derived from Node's crypto.scrypt with fixed salts, so
// a bug in the implementation (wrong key length, wrong scrypt params, wrong
// hex encoding) shows up as a mismatch against a value computed independently
// of the implementation under test. See TESTING_STANDARD.md section 1a.
describe("deriveKeyHex (fixed-salt golden values)", () => {
  it("derives the expected key for pin 1234 / a known salt", () => {
    const hex = deriveKeyHex("1234", "00112233445566778899aabbccddeeff");
    expect(hex).toBe(
      "a9d90a5b903041d430f3120a37e7dcb3bdc71c05ec54f79c2088ad704db11ba5f4a7439b074e74bcde4645244266dd11c8aec76fb8d0ee315803a1e465367226",
    );
    expect(hex.length).toBe(128);
  });

  it("derives the expected key for pin 0000 / a different salt", () => {
    const hex = deriveKeyHex("0000", "aabbccddeeff00112233445566778899");
    expect(hex).toBe(
      "bc7041f8b03a6b6c221918c72752bd463426554bfcb083c9cc4289188ebce9bc36183ac1f9be1e221558b039506cf77dc4f16c32111f8ca299adf28f0654c039",
    );
    expect(hex.length).toBe(128);
  });

  it("derives the expected key for pin 4321 / an all-zero salt", () => {
    const hex = deriveKeyHex("4321", "00000000000000000000000000000000");
    expect(hex).toBe(
      "4d523fbb075242b073800e0430e572121dbfe8c05cb0a84617d4e4f05aba54222d50d9980121cb3c950e45a3bc89023c4e699845809e4539cd110f38690ceafd",
    );
    expect(hex.length).toBe(128);
  });

  it("different pins produce different keys for the same salt", () => {
    const salt = "00112233445566778899aabbccddeeff";
    const a = deriveKeyHex("1111", salt);
    const b = deriveKeyHex("2222", salt);
    expect(a).not.toBe(b);
  });
});

describe("hashPin / verifyPin (random salt, real usage path)", () => {
  it("produces a stored value with a 32-hex-char salt and 128-hex-char hash, joined by a colon", async () => {
    const stored = await hashPin("1234");
    const parts = stored.split(":");
    expect(parts.length).toBe(2);
    expect(parts[0].length).toBe(32);
    expect(parts[1].length).toBe(128);
  });

  it("verifies the correct pin against its own hash", async () => {
    const stored = await hashPin("5678");
    await expect(verifyPin("5678", stored)).resolves.toBe(true);
  });

  it("rejects an incorrect pin against the hash", async () => {
    const stored = await hashPin("5678");
    await expect(verifyPin("0000", stored)).resolves.toBe(false);
  });

  it("produces a different salt (and therefore a different stored value) on each call for the same pin", async () => {
    const a = await hashPin("1234");
    const b = await hashPin("1234");
    expect(a).not.toBe(b);
  });

  it("rejects a malformed stored value instead of throwing", async () => {
    await expect(verifyPin("1234", "not-a-valid-stored-hash")).resolves.toBe(
      false,
    );
  });
});
