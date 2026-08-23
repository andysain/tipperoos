/**
 * 1st, 2nd, 3rd, 4th... Four copies of this function existed across
 * `src/components/` when it was promoted here, and one call site rendered
 * "1nd" because it hardcoded the suffix.
 */
export function ordinal(n: number): string {
  const rem = n % 100;
  if (rem >= 11 && rem <= 13) return `${n}th`;
  return `${n}${(["th", "st", "nd", "rd"] as const)[n % 10] ?? "th"}`;
}
