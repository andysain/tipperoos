// Script-side mirror of src/lib/auth/signup-validation.ts (see
// scripts/lib/scrypt-secret.mjs for why this can't just import the TS
// module). scripts/lib/parity.test.ts asserts the two stay in agreement.

export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 20;
export const PIN_LENGTH = 4;

const PIN_PATTERN = /^\d{4}$/;

/** Whether a PIN is exactly 4 digits, per CLAUDE.md -> Identity and auth. */
export function validatePinFormat(pin) {
  return PIN_PATTERN.test(pin);
}

// Letters (unicode-aware, for names like "José"), digits, spaces,
// apostrophes and hyphens. Emoji has its own dedicated onboarding field
// (see CLAUDE.md -> Identity and auth) so it's deliberately excluded here.
const DISPLAY_NAME_PATTERN = /^[\p{L}\p{N} '-]+$/u;

/** Validates and normalizes a display name per CLAUDE.md's identity rules. */
export function validateDisplayName(input) {
  const normalized = input.trim();

  if (normalized.length < DISPLAY_NAME_MIN_LENGTH) {
    return {
      ok: false,
      reason: `Display name must be at least ${DISPLAY_NAME_MIN_LENGTH} characters.`,
    };
  }
  if (normalized.length > DISPLAY_NAME_MAX_LENGTH) {
    return {
      ok: false,
      reason: `Display name must be at most ${DISPLAY_NAME_MAX_LENGTH} characters.`,
    };
  }
  if (!DISPLAY_NAME_PATTERN.test(normalized)) {
    return {
      ok: false,
      reason:
        "Display name can only contain letters, numbers, spaces, apostrophes and hyphens.",
    };
  }

  return { ok: true, normalized };
}
