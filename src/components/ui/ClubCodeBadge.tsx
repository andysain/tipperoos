import { badgeTextColor } from "@/lib/teams/kit-colors";

/**
 * Rounded-rect club-code chip -- shared by every screen that renders a
 * club's kit colour as a filled badge (docs/DESIGN_SYSTEM.md "Card
 * anatomy"). Always resolves its own text colour via badgeTextColor() so a
 * caller never has to reason about ink/paper contrast against the fill it
 * hands in -- the caller is still responsible for running that fill through
 * kit-colors.ts's contrast floor/clash rule before it gets here (see
 * matchBadgeColors()), since only the caller knows which grounds the fill
 * will actually be drawn on.
 */
export function ClubCodeBadge({
  shortCode,
  fill,
}: {
  shortCode: string | null;
  fill: string;
}) {
  const textToken = badgeTextColor(fill);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-md px-1.5 py-0.5 text-[0.7rem] font-extrabold tracking-wide ${
        textToken === "ink" ? "text-ink" : "text-paper"
      }`}
      style={{ background: fill }}
      aria-hidden
    >
      {shortCode ?? "?"}
    </span>
  );
}
