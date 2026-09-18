// ---------------------------------------------------------------------
// Password policy — shared by the register form and /api/register.
//
// Rules:
//   - at least 8 characters
//   - at least 3 of the 4 character types:
//       lowercase, uppercase, number, symbol
//
// Keep this as the single source of truth. If the client and server ever
// disagree, users hit a confusing "looks fine to me" rejection.
// ---------------------------------------------------------------------

export const MIN_PASSWORD_LENGTH = 8;
export const MIN_CHARACTER_TYPES = 3;

const TYPES = [
  { key: "lowercase", label: "a lowercase letter", test: /[a-z]/ },
  { key: "uppercase", label: "a capital letter", test: /[A-Z]/ },
  { key: "number", label: "a number", test: /[0-9]/ },
  { key: "symbol", label: "a symbol", test: /[^A-Za-z0-9]/ },
];

// Returns { valid, error, met, missing }
export function checkPassword(password) {
  const value = String(password || "");
  const met = TYPES.filter((t) => t.test.test(value));
  const missing = TYPES.filter((t) => !t.test.test(value));

  if (value.length < MIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      met,
      missing,
    };
  }

  if (met.length < MIN_CHARACTER_TYPES) {
    return {
      valid: false,
      error: `Password needs at least ${MIN_CHARACTER_TYPES} of: a capital letter, a lowercase letter, a number, a symbol. Add ${missing
        .slice(0, 2)
        .map((t) => t.label)
        .join(" or ")}.`,
      met,
      missing,
    };
  }

  return { valid: true, error: "", met, missing };
}

// For the live checklist under the password field.
export function passwordChecklist(password) {
  const value = String(password || "");
  return [
    {
      label: `At least ${MIN_PASSWORD_LENGTH} characters`,
      done: value.length >= MIN_PASSWORD_LENGTH,
    },
    ...TYPES.map((t) => ({ label: t.label, done: t.test.test(value) })),
  ];
}