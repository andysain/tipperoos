"use client";

import { useEffect, useRef, useState } from "react";
import { FOCUS, LABEL, T, TX } from "./tokens";

export interface PinInputProps {
  length?: number;
  label: string;
  masked?: boolean;
  autoFocus?: boolean;
  error?: string;
  onComplete: (pin: string) => void;
}

// Four tap-friendly digit boxes instead of a single free-text field --
// kid-friendly PIN entry, auto-advancing, numeric keyboard on mobile.
//
// Masking is done by rendering "•" in a `type="text"` box, never
// `type="password"`: on iOS Safari a password field routes every keystroke
// through the secure-text path and Password AutoFill heuristics, so the
// bullets lag visibly behind typing (real regression, #139). A text box
// keeps `inputMode="numeric"` working too -- iOS ignores it on password
// fields. The real digits stay in state, so `onComplete` always receives
// the actual PIN.
//
// To clear the boxes after a failed attempt, the parent should force a
// remount by changing this component's `key` prop, rather than this
// component watching a "reset" prop internally -- React's own mechanism for
// "reset this subtree's state," and it avoids calling setState from inside
// an effect (see react-hooks/set-state-in-effect).
export function PinInput({
  length = 4,
  label,
  masked = false,
  autoFocus = true,
  error,
  onComplete,
}: PinInputProps) {
  const [digits, setDigits] = useState<string[]>(() => Array(length).fill(""));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (autoFocus) inputRefs.current[0]?.focus();
  }, [autoFocus]);

  function setDigitAt(index: number, value: string) {
    const next = [...digits];
    next[index] = value;
    setDigits(next);
    if (next.every((d) => d !== "")) {
      onComplete(next.join(""));
    }
  }

  function handleChange(index: number, rawValue: string) {
    const value = rawValue.replace(/\D/g, "").slice(-1);
    setDigitAt(index, value);
    if (value && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      setDigitAt(index - 1, "");
    }
  }

  function handlePaste(event: React.ClipboardEvent) {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;
    event.preventDefault();
    const next = Array(length)
      .fill("")
      .map((_, i) => pasted[i] ?? "");
    setDigits(next);
    if (pasted.length >= length) {
      onComplete(next.join(""));
      inputRefs.current[length - 1]?.focus();
    } else {
      inputRefs.current[pasted.length]?.focus();
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className={`${LABEL} ${TX.base}`}>{label}</span>
      <div className="flex gap-3" onPaste={handlePaste}>
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            type="text"
            autoComplete="off"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            value={masked && digit !== "" ? "•" : digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            aria-label={`${label} digit ${index + 1}`}
            className={`h-14 w-12 rounded-btn-sm border border-paper-line bg-paper text-center text-[1.5rem] font-bold tabular-nums ${TX.base} outline-none focus:border-accent ${FOCUS} ${
              error ? "border-danger focus-visible:ring-danger/40" : ""
            }`}
          />
        ))}
      </div>
      {error ? <p className={`${T.dense} text-danger`}>{error}</p> : null}
    </div>
  );
}
