/**
 * Shared kit-colour source (issue #15's decision 6) -- previously duplicated
 * ad hoc inside PredictTableFlow.tsx. Also implements the clash rule and
 * contrast floor DESIGN_SYSTEM.md mandates wherever real kit colours are
 * rendered (Predict the Table's stripe, and the Tipped Match card's badge +
 * row bar) -- neither existed before this module; PredictTableFlow's stripe
 * use never needed them since it never puts two clubs' colours next to each
 * other, nor drops a kit colour onto a fixed ink/white ground.
 */

/** Club-sourced values -- where only one colour was sourced, both stops are
 * the same (a solid stripe) rather than inventing a second tone. */
const CLUB_COLORS: Record<string, readonly [string, string]> = {
  ARS: ["#DB0007", "#FFFFFF"],
  AVL: ["#670E36", "#95BFE5"],
  BOU: ["#DA291C", "#000000"],
  BRE: ["#E03A3E", "#FFFFFF"],
  BHA: ["#0057B8", "#FFFFFF"],
  CHE: ["#034694", "#034694"],
  COV: ["#78C4F5", "#78C4F5"],
  CRY: ["#C4122E", "#1B458F"],
  EVE: ["#003399", "#003399"],
  FUL: ["#FFFFFF", "#000000"],
  HUL: ["#F18A00", "#000000"],
  IPS: ["#0044A9", "#0044A9"],
  LEE: ["#FFFFFF", "#FFCD00"],
  LIV: ["#C8102E", "#C8102E"],
  MCI: ["#6CABDD", "#6CABDD"],
  MUN: ["#DA291C", "#000000"],
  NEW: ["#000000", "#FFFFFF"],
  NOT: ["#DD0000", "#FFFFFF"],
  SUN: ["#EB172B", "#FFFFFF"],
  TOT: ["#FFFFFF", "#132257"],
};
const FALLBACK_KIT: readonly [string, string] = ["#9CA3AF", "#6B7280"];

export function kitColors(shortCode: string | null): readonly [string, string] {
  if (!shortCode) return FALLBACK_KIT;
  return CLUB_COLORS[shortCode] ?? FALLBACK_KIT;
}

/** DESIGN_SYSTEM.md palette tokens -- the two grounds a rendered kit colour
 * gets mixed toward when it fails the contrast floor. */
export const INK = "#123c43";
export const PAPER = "#f6f3ec";

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
}

function componentToHex(c: number): string {
  return Math.round(clamp(c, 0, 255))
    .toString(16)
    .padStart(2, "0");
}

function rgbToHex([r, g, b]: readonly [number, number, number]): string {
  return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function rgbToHsl([r, g, b]: readonly [number, number, number]): {
  h: number;
  s: number;
  l: number;
} {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case rn:
      h = (gn - bn) / d + (gn < bn ? 6 : 0);
      break;
    case gn:
      h = (bn - rn) / d + 2;
      break;
    default:
      h = (rn - gn) / d + 4;
  }
  return { h: h / 6, s, l };
}

function hueToRgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = l * 255;
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    hueToRgb(p, q, h + 1 / 3) * 255,
    hueToRgb(p, q, h) * 255,
    hueToRgb(p, q, h - 1 / 3) * 255,
  ];
}

function srgbChannel(c: number): number {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (
    0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b)
  );
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG 2.1 SC 1.4.11's non-text contrast minimum -- the badge fill is a
 * graphical UI element, not text, so the text-contrast 4.5:1 floor doesn't
 * apply, but it still needs to read as a shape against its ground. */
const CONTRAST_FLOOR_MIN_RATIO = 3.0;
const CONTRAST_FLOOR_STEP = 0.04;
const CONTRAST_FLOOR_MAX_STEPS = 20;

/**
 * DESIGN_SYSTEM.md's contrast floor: a kit colour that's too close in
 * luminance to a ground it's drawn on is mixed toward `paper` or `ink`,
 * hue preserved, until it clears that ground -- lightness-only movement in
 * HSL space is what "hue preserved" means (an RGB lerp would drift hue).
 * Direction follows which ground is failing: a kit darker than a light
 * ground needs pushing toward `ink` (darker still, more separation); a kit
 * lighter than a dark ground needs pushing toward `paper`.
 */
export function applyContrastFloor(
  hex: string,
  grounds: readonly string[],
  minRatio: number = CONTRAST_FLOOR_MIN_RATIO,
): string {
  let current = hex;
  for (const ground of grounds) {
    if (contrastRatio(current, ground) >= minRatio) continue;

    // Direction is fixed once per ground, from the color's starting position
    // relative to it -- recomputing per-step oscillates near the crossover
    // point (where the two luminances are close and contrast bottoms out at
    // ~1), stepping back and forth without ever escaping the dip.
    const target =
      relativeLuminance(current) < relativeLuminance(ground) ? PAPER : INK;
    const { h, s } = rgbToHsl(hexToRgb(current));
    const targetL = rgbToHsl(hexToRgb(target)).l;
    let l = rgbToHsl(hexToRgb(current)).l;

    let steps = 0;
    while (
      contrastRatio(current, ground) < minRatio &&
      steps < CONTRAST_FLOOR_MAX_STEPS
    ) {
      l = clamp(l + Math.sign(targetL - l) * CONTRAST_FLOOR_STEP, 0, 1);
      current = rgbToHex(hslToRgb(h, s, l));
      steps += 1;
    }
  }
  return current;
}

/**
 * "Too close to tell apart" (the ADR's clash-rule wording) is a question of
 * perceived color similarity -- dominated by hue and saturation -- not the
 * WCAG luminance-only contrast ratio the floor above uses. Two different
 * reds (Arsenal DB0007, Man Utd DA291C) read as WCAG-"close" purely because
 * both happen to be dark, even though they're obviously both "red" side by
 * side; WCAG contrast would also flag genuinely distinct hues (red vs navy)
 * as close for the same reason. Euclidean RGB distance tracks perceived
 * similarity far better for this specific "same team-color family" check.
 */
function colorDistance(hexA: string, hexB: string): number {
  const [rA, gA, bA] = hexToRgb(hexA);
  const [rB, gB, bB] = hexToRgb(hexB);
  return Math.sqrt((rA - rB) ** 2 + (gA - gB) ** 2 + (bA - bB) ** 2);
}

/** Calibrated against this squad's actual palette: same-family reds
 * (Arsenal/Bournemouth/Man Utd/Liverpool) cluster at 46-53; genuinely
 * distinct pairs (Arsenal red/Chelsea navy, Chelsea/Man City blues) sit at
 * 163+. 100 sits cleanly in the gap. */
const CLASH_MIN_DISTANCE = 100;

export interface MatchBadgeColors {
  home: string;
  away: string;
}

/**
 * Fill colours for a fixture's two club badges (DESIGN_SYSTEM.md's
 * Tipped Match card amendment): the clash rule picks the away side's fill
 * (primary, then secondary, then `ink`) so it's visually distinct from the
 * home side, then the contrast floor is applied to both against every
 * ground they're actually drawn on (the card's ink header and white body).
 */
export function matchBadgeColors(
  homeShortCode: string | null,
  awayShortCode: string | null,
  grounds: readonly string[] = [INK, "#ffffff"],
): MatchBadgeColors {
  const [homePrimary] = kitColors(homeShortCode);
  const [awayPrimary, awaySecondary] = kitColors(awayShortCode);

  let awayFill = awayPrimary;
  if (colorDistance(homePrimary, awayFill) < CLASH_MIN_DISTANCE) {
    awayFill = awaySecondary;
    if (colorDistance(homePrimary, awayFill) < CLASH_MIN_DISTANCE) {
      awayFill = INK;
    }
  }

  return {
    home: applyContrastFloor(homePrimary, grounds),
    away: applyContrastFloor(awayFill, grounds),
  };
}

/**
 * DESIGN_SYSTEM.md: badge text colour is flipped to `ink` or `paper` "by
 * measured luminance rather than hardcoded per club" -- whichever token
 * contrasts more against the (already contrast-floored) fill.
 */
export function badgeTextColor(fillHex: string): "ink" | "paper" {
  return contrastRatio(fillHex, INK) > contrastRatio(fillHex, PAPER)
    ? "ink"
    : "paper";
}

/** A flat single-colour stripe (c1 === c2, e.g. Chelsea's all-blue) is left
 * alone -- a fake midline seam would look like a rendering glitch on those.
 * A genuine two-tone stripe gets a hairline divider and a faint outer ring,
 * so a white half (Leeds, Spurs, Fulham) stays visible against the card's
 * own white background instead of disappearing into it. */
export function stripeStyle(
  c1: string,
  c2: string,
  angle: 90 | 180 = 180,
): { background: string; boxShadow: string } {
  if (c1.toLowerCase() === c2.toLowerCase()) {
    return { background: c1, boxShadow: "inset 0 0 0 1px rgba(18,60,67,0.12)" };
  }
  return {
    background: `linear-gradient(${angle}deg, ${c1} calc(50% - 0.5px), rgba(18,60,67,0.22) calc(50% - 0.5px) calc(50% + 0.5px), ${c2} calc(50% + 0.5px))`,
    boxShadow: "inset 0 0 0 1px rgba(18,60,67,0.12)",
  };
}
