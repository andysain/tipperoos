import { type InputHTMLAttributes, useId } from "react";

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
      <label
        htmlFor={inputId}
        className="text-[0.8rem] font-bold tracking-[0.08em] text-ink uppercase"
      >
        {label}
      </label>
      <input
        id={inputId}
        className={`rounded-btn border border-paper-line bg-paper px-4 py-3 text-[1.0625rem] text-ink outline-none placeholder:text-ink/40 focus:border-accent focus:ring-2 focus:ring-accent/40 ${
          error ? "border-danger focus:border-danger focus:ring-danger/30" : ""
        } ${className}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        {...props}
      />
      {error ? (
        <p id={`${inputId}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-ink/60">{hint}</p>
      ) : null}
    </div>
  );
}
