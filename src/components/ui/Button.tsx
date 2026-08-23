import { type ButtonHTMLAttributes, type Ref } from "react";
import { tv, type VariantProps } from "tailwind-variants";
import { FOCUS, T } from "@/components/ui/tokens";

const button = tv({
  base: `inline-flex items-center justify-center gap-2 rounded-btn font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`,
  variants: {
    intent: {
      primary: "bg-accent text-accent-ink hover:brightness-105",
      secondary: "bg-ink text-paper hover:brightness-110",
      ghost: "bg-transparent text-ink hover:bg-paper-line/60",
    },
    size: {
      md: `px-5 py-3 ${T.body}`,
      sm: `px-3.5 py-2 ${T.dense}`,
    },
    fullWidth: {
      true: "w-full",
    },
  },
  defaultVariants: {
    intent: "primary",
    size: "md",
  },
});

type ButtonVariants = VariantProps<typeof button>;

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonVariants {
  ref?: Ref<HTMLButtonElement>;
}

// React 19 passes `ref` through as a regular prop on function components --
// no forwardRef wrapper needed.
export function Button({
  className,
  intent,
  size,
  fullWidth,
  ref,
  ...props
}: ButtonProps) {
  return (
    <button
      ref={ref}
      className={button({ intent, size, fullWidth, className })}
      {...props}
    />
  );
}
