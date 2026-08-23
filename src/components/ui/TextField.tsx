import { type InputHTMLAttributes, useId } from "react";
import { FOCUS, LABEL, T, TX } from "./tokens";

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function TextField({
  label,
  error,
  hint,
  id,
  className = "",
  ...props
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className={`${LABEL} ${TX.base}`}>
        {label}
      </label>
      <input
        id={inputId}
        className={`rounded-btn border border-paper-line bg-paper px-4 py-3 ${T.body} ${TX.base} outline-none placeholder:${TX.decorative} focus:border-accent ${FOCUS} ${
          error ? "border-danger focus-visible:ring-danger/40" : ""
        } ${className}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        {...props}
      />
      {error ? (
        <p id={`${inputId}-error`} className={`${T.dense} text-danger`}>
          {error}
        </p>
      ) : hint ? (
        <p className={`${T.dense} ${TX.muted}`}>{hint}</p>
      ) : null}
    </div>
  );
}
