import { type HTMLAttributes } from "react";

/**
 * The ink-header / kit-colour-seam / white-body card shell (see
 * docs/DESIGN_SYSTEM.md "Card anatomy"). Originated inside the Pick Board's
 * Tipped Match card (docs/adr/0007-home-surface-and-pick-entry.md);
 * extracted so a second screen can adopt the same shape without reading
 * that component. Dark ink is used here as a *surface*, not just as text
 * colour -- that's what gives a card built this way its structure.
 *
 * Same shadow as `Card` (`docs/DESIGN_SYSTEM.md`'s spec) -- the two shapes
 * share depth treatment, they differ only in whether there's an ink header.
 */
export function CardShell({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-card shadow-[0_10px_24px_-12px_rgba(18,60,67,0.28)] ${className}`}
      {...props}
    />
  );
}

/** The ink surface used as a structural header, not just text colour. */
export function CardShellHeader({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`flex flex-col gap-2 bg-ink px-3.5 py-3 ${className}`}
      {...props}
    />
  );
}

export interface CardShellSeamSegment {
  fill: string;
}

/** Two-tone bar tying the header to whatever sits below it -- hairlined top
 * and bottom so it reads as a bar regardless of which way a kit's
 * luminance leans (issue #15 prototype note). */
export function CardShellSeam({
  segments,
}: {
  segments: readonly [CardShellSeamSegment, CardShellSeamSegment];
}) {
  const [first, second] = segments;
  return (
    <div className="flex h-1.5 border-y border-ink/25">
      <div className="flex-1" style={{ background: first.fill }} />
      <div
        className="flex-1 border-l border-ink/30"
        style={{ background: second.fill }}
      />
    </div>
  );
}

/** The white surface below the seam. */
export function CardShellBody({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`flex flex-col bg-white p-4 ${className}`} {...props} />
  );
}
