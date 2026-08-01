import { type HTMLAttributes } from "react";

// Cards lift off the warm `paper` background via a white surface + soft
// shadow, not a hard border -- see docs/DESIGN_SYSTEM.md "Visual direction".
// The shadow value is quoted directly from that spec.
export function Card({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-card border border-paper-line bg-white p-6 shadow-[0_10px_24px_-12px_rgba(18,60,67,0.28)] ${className}`}
      {...props}
    />
  );
}
