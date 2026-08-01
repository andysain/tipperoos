import { type ButtonHTMLAttributes } from "react";
import { tv, type VariantProps } from "tailwind-variants";

const button = tv({
  base: "inline-flex items-center justify-center gap-2 rounded-btn font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
  variants: {
    intent: {
      primary: "bg-accent text-accent-ink hover:brightness-105",
      secondary: "bg-ink text-paper hover:brightness-110",
      ghost: "bg-transparent text-ink hover:bg-paper-line/60",
    },
    size: {
      md: "px-5 py-3 text-[1.0625rem]",
      sm: "px-3.5 py-2 text-sm",
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
  extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonVariants {}

export function Button({
  className,
  intent,
  size,
  fullWidth,
  ...props
}: ButtonProps) {
  return (
    <button
      className={button({ intent, size, fullWidth, className })}
      {...props}
    />
  );
}
