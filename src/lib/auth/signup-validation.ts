export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 20;

// Letters (unicode-aware, for names like "José"), digits, spaces,
// apostrophes and hyphens. Emoji has its own dedicated onboarding field
// (see CLAUDE.md -> Identity and auth) so it's deliberately excluded here.
const DISPLAY_NAME_PATTERN = /^[\p{L}\p{N} '-]+$/u;

export type DisplayNameValidationResult =
  { ok: true; normalized: string } | { ok: false; reason: string };

/** Validates and normalizes a display name per CLAUDE.md's identity rules. */
export function validateDisplayName(
  input: string,
): DisplayNameValidationResult {
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

/** Verifies a submitted private competition code against the configured one. */
export function verifyCompetitionCode(
  submitted: string,
  expected: string,
): boolean {
  const normalizedExpected = expected.trim();
  if (!normalizedExpected) return false;
  return submitted.trim().toLowerCase() === normalizedExpected.toLowerCase();
}
