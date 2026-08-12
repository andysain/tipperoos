import { isEmojiInLibrary } from "./emoji-options";

export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 20;
export const PIN_LENGTH = 4;

const PIN_PATTERN = /^\d{4}$/;

/** Whether a PIN is exactly 4 digits, per CLAUDE.md -> Identity and auth. */
export function validatePinFormat(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

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

export type EmojiValidationResult =
  { ok: true; normalized: string } | { ok: false; reason: string };

/**
 * Emoji is mandatory at signup (issue #127) and must be one of the curated
 * options: the column is unconstrained `text` rendered raw in the login
 * list and leaderboard, so the route is the only guard against arbitrary
 * strings. The trimmed value is the normalized one stored.
 */
export function validateEmoji(input: string): EmojiValidationResult {
  const normalized = input.trim();

  if (!normalized) {
    return { ok: false, reason: "Pick an emoji." };
  }
  if (!isEmojiInLibrary(normalized)) {
    return {
      ok: false,
      reason: "That emoji isn't one we offer — pick one from the list.",
    };
  }

  return { ok: true, normalized };
}
