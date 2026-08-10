import { type HTMLAttributes } from "react";

// Cards lift off the warm `paper` background via a white surface + soft
// shadow, not a border -- see docs/DESIGN_SYSTEM.md "Visual direction"
// ("real depth, not flat bordered boxes"). The shadow value is quoted
// directly from that spec.
export function Card({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`overflow-hidden rounded-card bg-white p-6 shadow-[0_10px_24px_-12px_rgba(18,60,67,0.28)] ${className}`}
      {...props}
    />
  );
}
