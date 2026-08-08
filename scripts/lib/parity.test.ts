import { describe, expect, it } from "vitest";
import {
  hashSecret as hashSecretJs,
  verifySecret as verifySecretJs,
} from "./scrypt-secret.mjs";
import { normalizeCompetitionCode as normalizeCompetitionCodeJs } from "./competitions.mjs";
import {
  validateDisplayName as validateDisplayNameJs,
  validatePinFormat as validatePinFormatJs,
} from "./signup-validation.mjs";
import {
  hashSecret as hashSecretTs,
  verifySecret as verifySecretTs,
} from "@/lib/auth/scrypt-secret";
import { normalizeCompetitionCode as normalizeCompetitionCodeTs } from "@/lib/auth/competitions";
import {
  validateDisplayName as validateDisplayNameTs,
  validatePinFormat as validatePinFormatTs,
} from "@/lib/auth/signup-validation";

// scripts/lib/*.mjs is a dependency-free mirror of src/lib/auth/* (see
// issue #79 -- those modules are `import "server-only"`-guarded and can't
// be imported from a plain `node` script). A "keep this in sync" comment
// can't catch drift; these tests can. Can't be golden values -- hashSecret
// salts every call -- so this is the invariant-test shape
// docs/standards/TESTING_STANDARD.md section 1a asks for.

describe("normalizeCompetitionCode parity", () => {
  const cases = ["forza", "  FORZA  ", "Test Cohort", "", "   "];

  it.each(cases)("agrees on %j", (input) => {
    expect(normalizeCompetitionCodeJs(input)).toBe(
      normalizeCompetitionCodeTs(input),
    );
  });
});

describe("validatePinFormat parity", () => {
  const cases = ["1234", "0000", "123", "12345", "12ab", "12 4", ""];

  it.each(cases)("agrees on %j", (input) => {
    expect(validatePinFormatJs(input)).toBe(validatePinFormatTs(input));
  });
});

describe("validateDisplayName parity", () => {
  const cases = [
    "Andy",
    "A",
    "  Andy  ",
    "Alexandrina123456789X", // 21 chars, over max
    "O'Brien-Smith 2",
    "Andy🔥",
    "     ",
    "José",
  ];

  it.each(cases)("agrees on %j", (input) => {
    const js = validateDisplayNameJs(input);
    const ts = validateDisplayNameTs(input);
    expect(js.ok).toBe(ts.ok);
    if (js.ok && ts.ok) {
      expect(js.normalized).toBe(ts.normalized);
    }
  });
});

describe("hashSecret / verifySecret cross-implementation invariant", () => {
  it("a hash produced by the .mjs side verifies under the .ts side", async () => {
    const stored = await hashSecretJs("swordfish");
    await expect(verifySecretTs("swordfish", stored)).resolves.toBe(true);
  });

  it("a hash produced by the .ts side verifies under the .mjs side", async () => {
    const stored = await hashSecretTs("swordfish");
    await expect(verifySecretJs("swordfish", stored)).resolves.toBe(true);
  });

  it("the .mjs side rejects a wrong secret against a .ts-produced hash", async () => {
    const stored = await hashSecretTs("swordfish");
    await expect(verifySecretJs("wrong", stored)).resolves.toBe(false);
  });

  it("the .ts side rejects a wrong secret against a .mjs-produced hash", async () => {
    const stored = await hashSecretJs("swordfish");
    await expect(verifySecretTs("wrong", stored)).resolves.toBe(false);
  });
});
