import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------
// Six-digit code entry.
//
// Handles the things people actually do: typing, pasting the whole code
// from their email, backspacing, and arrow keys.
// ---------------------------------------------------------------------
const LENGTH = 6;

export default function OtpInput({ value, onChange, onComplete, disabled }) {
  const [digits, setDigits] = useState(Array(LENGTH).fill(""));
  const refs = useRef([]);

  // Keep internal state in sync when the parent clears the field
  // (e.g. after a wrong code).
  useEffect(() => {
    if (value === "") setDigits(Array(LENGTH).fill(""));
  }, [value]);

  const push = (next) => {
    setDigits(next);
    const joined = next.join("");
    onChange?.(joined);
    if (joined.length === LENGTH && !next.includes("")) {
      onComplete?.(joined);
    }
  };

  const handleChange = (index, raw) => {
    const char = raw.replace(/\D/g, "").slice(-1);
    if (!char) return;

    const next = [...digits];
    next[index] = char;
    push(next);

    if (index < LENGTH - 1) refs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const next = [...digits];
      if (next[index]) {
        next[index] = "";
        push(next);
      } else if (index > 0) {
        next[index - 1] = "";
        push(next);
        refs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      refs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < LENGTH - 1) {
      refs.current[index + 1]?.focus();
    }
  };

  // Pasting the code from the email should just work.
  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LENGTH);
    if (!pasted) return;

    const next = Array(LENGTH).fill("");
    pasted.split("").forEach((c, i) => (next[i] = c));
    push(next);
    refs.current[Math.min(pasted.length, LENGTH - 1)]?.focus();
  };

  return (
    <div className="flex justify-center gap-2" onPaste={handlePaste}>
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          disabled={disabled}
          value={digit}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          aria-label={`Digit ${i + 1} of ${LENGTH}`}
          className="w-12 h-14 text-center text-xl font-semibold rounded-lg border border-ink/15 focus:border-gold focus:ring-2 focus:ring-gold/30 focus:outline-none disabled:bg-ink/5 disabled:text-ink/30 transition-colors"
        />
      ))}
    </div>
  );
}
