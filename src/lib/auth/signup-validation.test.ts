import { describe, expect, it } from "vitest";
import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  PIN_LENGTH,
  validateDisplayName,
  validatePinFormat,
  verifyCompetitionCode,
} from "./signup-validation";

// Golden values hand-derived from CLAUDE.md -> Identity and auth's
// display-name rules (min/max length, allowed characters) and the private
// competition code check. See TESTING_STANDARD.md section 1a.
describe("constants", () => {
  it("minimum display name length is 2", () => {
    expect(DISPLAY_NAME_MIN_LENGTH).toBe(2);
  });

  it("maximum display name length is 20", () => {
    expect(DISPLAY_NAME_MAX_LENGTH).toBe(20);
  });
});

describe("validateDisplayName", () => {
  it("rejects a 1-character name (below the minimum)", () => {
    const result = validateDisplayName("A");
    expect(result.ok).toBe(false);
  });

  it("accepts a 2-character name (the minimum boundary)", () => {
    const result = validateDisplayName("Al");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized.length).toBe(2);
    }
  });

  it("accepts a 20-character name (the maximum boundary)", () => {
    const twentyChars = "Alexandrina12345678";
    expect(twentyChars.length).toBe(19);
    const twenty = twentyChars + "9";
    expect(twenty.length).toBe(20);
    const result = validateDisplayName(twenty);
    expect(result.ok).toBe(true);
  });

  it("rejects a 21-character name (above the maximum)", () => {
    const twentyOne = "Alexandrina123456789";
    expect(twentyOne.length).toBe(20);
    const result = validateDisplayName(twentyOne + "X");
    expect(result.ok).toBe(false);
  });

  it("trims surrounding whitespace before validating and normalizes to the trimmed value", () => {
    const result = validateDisplayName("  Andy  ");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized).toBe("Andy");
      expect(result.normalized.length).toBe(4);
    }
  });

  it("rejects a name that is only whitespace", () => {
    const result = validateDisplayName("     ");
    expect(result.ok).toBe(false);
  });

  it("allows letters, numbers, spaces, apostrophes and hyphens", () => {
    expect(validateDisplayName("O'Brien-Smith 2").ok).toBe(true);
  });

  it("rejects characters outside the allowed set (e.g. emoji belongs in the separate emoji field, not the name)", () => {
    expect(validateDisplayName("Andy🔥").ok).toBe(false);
  });
});

describe("validatePinFormat", () => {
  it("PIN length is fixed at 4", () => {
    expect(PIN_LENGTH).toBe(4);
  });

  it("accepts a 4-digit PIN", () => {
    expect(validatePinFormat("1234")).toBe(true);
    expect(validatePinFormat("0000")).toBe(true);
  });

  it("rejects a 3-digit PIN", () => {
    expect(validatePinFormat("123")).toBe(false);
  });

  it("rejects a 5-digit PIN", () => {
    expect(validatePinFormat("12345")).toBe(false);
  });

  it("rejects non-digit characters", () => {
    expect(validatePinFormat("12ab")).toBe(false);
    expect(validatePinFormat("12 4")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(validatePinFormat("")).toBe(false);
  });
});

describe("verifyCompetitionCode", () => {
  it("accepts an exact match", () => {
    expect(verifyCompetitionCode("TIPPEROOS26", "TIPPEROOS26")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(verifyCompetitionCode("tipperoos26", "TIPPEROOS26")).toBe(true);
  });

  it("tolerates surrounding whitespace from copy/paste", () => {
    expect(verifyCompetitionCode("  TIPPEROOS26  ", "TIPPEROOS26")).toBe(true);
  });

  it("rejects an incorrect code", () => {
    expect(verifyCompetitionCode("WRONGCODE", "TIPPEROOS26")).toBe(false);
  });

  it("rejects any input when the expected code is misconfigured as empty", () => {
    expect(verifyCompetitionCode("", "")).toBe(false);
    expect(verifyCompetitionCode("anything", "")).toBe(false);
  });
});
