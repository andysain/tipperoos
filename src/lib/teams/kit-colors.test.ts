import { describe, expect, it } from "vitest";
import {
  applyContrastFloor,
  badgeTextColor,
  contrastRatio,
  INK,
  kitColors,
  matchBadgeColors,
  relativeLuminance,
  stripeStyle,
} from "./kit-colors";

// Golden values hand-derived from the WCAG 2.1 relative-luminance/contrast
// formulas (docs/DESIGN_SYSTEM.md cites these concepts without giving exact
// numbers -- this table is the concrete spec, not lifted from this file's
// own implementation output).
function round(n: number, decimals = 2): number {
  return Number(n.toFixed(decimals));
}

// The card body's actual ground (TippedMatchCard.tsx's white rail,
// PredictTableFlow's white card) -- distinct from the `PAPER` token, which
// is off-white and never used as this rail's ground.
const WHITE = "#ffffff";

describe("relativeLuminance", () => {
  it("is 0 for pure black and 1 for pure white", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBe(1);
  });
});

describe("contrastRatio", () => {
  it("is 21 for black-on-white, the WCAG maximum", () => {
    expect(round(contrastRatio("#ffffff", "#000000"), 0)).toBe(21);
  });

  it("is 1 for a color against itself", () => {
    expect(contrastRatio(INK, INK)).toBe(1);
  });
});

describe("applyContrastFloor", () => {
  it("lightens a black kit that disappears against the ink ground", () => {
    // Newcastle's shirt: pure black next to the app's `ink` token measures
    // only 1.75:1 unmodified -- exactly the "black kits disappear against
    // an ink surface" case DESIGN_SYSTEM.md names explicitly.
    const before = round(contrastRatio("#000000", INK));
    const after = applyContrastFloor("#000000", [INK]);
    expect(before).toBe(1.75);
    expect(round(contrastRatio(after, INK))).toBe(3.25);
  });

  it("darkens a white kit that disappears against a white ground", () => {
    // Fulham's shirt: white-on-white is the other named case.
    const after = applyContrastFloor("#ffffff", ["#ffffff"]);
    expect(round(contrastRatio(after, "#ffffff"))).toBe(3.23);
  });

  it("leaves a kit color untouched once every ground already clears the floor", () => {
    const safe = "#4c9a4a"; // arbitrary mid-luminance color, safe against both
    expect(applyContrastFloor(safe, [INK, "#ffffff"])).toBe(safe);
  });

  it("hue is preserved -- only lightness moves", () => {
    // A saturated blue kept as a hue after flooring against ink, not
    // greyed out or shifted toward a different hue.
    const after = applyContrastFloor("#0057B8", [INK]);
    expect(after.toLowerCase()).not.toBe("#0057b8");
    // Still recognizably blue: blue channel stays the dominant channel.
    const [r, g, b] = [
      parseInt(after.slice(1, 3), 16),
      parseInt(after.slice(3, 5), 16),
      parseInt(after.slice(5, 7), 16),
    ];
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(g);
  });
});

describe("matchBadgeColors", () => {
  it("keeps the away side distinct by hue when home/away colors are genuinely different", () => {
    // Arsenal (red) vs Chelsea (navy) -- perceptually distinct hues, even
    // though their WCAG luminance contrast is coincidentally low (both are
    // dark colors) -- exactly the case the hue/distance-based clash check
    // (not a WCAG contrast check) is for.
    const { home, away } = matchBadgeColors("ARS", "CHE");
    expect(home).not.toBe(away);
    expect(home.toLowerCase()).not.toBe(INK.toLowerCase());
    expect(away.toLowerCase()).not.toBe(INK.toLowerCase());
  });

  it("falls back to ink, then contrast-floors it, once both the primary and secondary clash with home", () => {
    // Nottingham Forest (red) vs Liverpool -- Liverpool only has one
    // sourced color (both stops are the same red), so once the primary
    // clashes, the secondary clashes too by construction, and away must
    // fall all the way through to ink. But `ink` is also one of the
    // default grounds (the card header) -- left unmodified it would be
    // invisible against its own ground, so it still has to clear the
    // contrast floor against ink and white like any other fill.
    const { away } = matchBadgeColors("NOT", "LIV");
    expect(away.toLowerCase()).toBe("#2c92a3");
    expect(contrastRatio(away, INK)).toBeGreaterThanOrEqual(3.0);
    expect(contrastRatio(away, WHITE)).toBeGreaterThanOrEqual(3.0);
  });

  it("uses the fallback kit for an unrecognized short code without throwing", () => {
    expect(() => matchBadgeColors("ZZZ", "YYY")).not.toThrow();
  });

  // Issue #186: TippedMatchCard.tsx's body rail resolves against a
  // white-only ground -- a separate call from the default ink+white pair --
  // so a pale kit that clears ink comfortably still has to clear white on
  // its own. These pin that per-ground clearance for the two clubs the
  // issue named, independent of the default-grounds pair above.
  describe("white-only ground (the card body rail's variant)", () => {
    it("HUL clears the white body even though its primary is a pale orange", () => {
      const { home } = matchBadgeColors("HUL", "MUN", [WHITE]);
      expect(home.toLowerCase()).toBe("#c87300");
      expect(contrastRatio(home, WHITE)).toBeGreaterThanOrEqual(3.0);
    });

    it("MCI clears the white body even though home and away are the same pale blue", () => {
      const { home, away } = matchBadgeColors("MCI", "CRY", [WHITE]);
      expect(home.toLowerCase()).toBe("#4b98d5");
      expect(away.toLowerCase()).toBe("#c4122e");
      expect(contrastRatio(home, WHITE)).toBeGreaterThanOrEqual(3.0);
      expect(contrastRatio(away, WHITE)).toBeGreaterThanOrEqual(3.0);
    });

    it("Fulham's white primary clears the white body", () => {
      const { home } = matchBadgeColors("FUL", "TOT", [WHITE]);
      expect(home.toLowerCase()).toBe("#8f8f8f");
      expect(contrastRatio(home, WHITE)).toBeGreaterThanOrEqual(3.0);
    });

    it("the clash rule still holds under the white-only ground variant", () => {
      // Same pairing as the default-grounds clash test above, just resolved
      // against white only -- flooring each ground independently must not
      // let the two sides converge back onto the same stripe colour.
      const { home, away } = matchBadgeColors("ARS", "CHE", [WHITE]);
      expect(home.toLowerCase()).toBe("#db0007");
      expect(away.toLowerCase()).toBe("#034694");
      expect(home.toLowerCase()).not.toBe(away.toLowerCase());
    });
  });
});

describe("badgeTextColor", () => {
  it("picks paper text on a black fill and ink text on a white fill", () => {
    expect(badgeTextColor("#000000")).toBe("paper");
    expect(badgeTextColor("#ffffff")).toBe("ink");
  });
});

describe("kitColors", () => {
  it("returns the neutral fallback for an unknown or missing short code", () => {
    expect(kitColors("ZZZ")).toEqual(["#9CA3AF", "#6B7280"]);
    expect(kitColors(null)).toEqual(["#9CA3AF", "#6B7280"]);
  });

  it("returns a club's real two-tone colors when known", () => {
    expect(kitColors("NEW")).toEqual(["#000000", "#FFFFFF"]);
  });
});

describe("stripeStyle", () => {
  it("renders a flat fill with no seam when both stops match", () => {
    const style = stripeStyle("#034694", "#034694");
    expect(style.background).toBe("#034694");
  });

  it("renders a two-tone gradient with a hairline seam when stops differ", () => {
    const style = stripeStyle("#DB0007", "#FFFFFF");
    expect(style.background).toContain("linear-gradient");
    expect(style.background).toContain("#DB0007");
    expect(style.background).toContain("#FFFFFF");
  });
});
