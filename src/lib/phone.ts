/**
 * Formats a US phone number for display as +1 (xxx) xxx-xxxx.
 *
 * Display-only: strips formatting to digits, drops a leading country code, and
 * reformats a standard 10-digit number. Anything that isn't a clean US number is
 * returned unchanged so we never mangle unexpected values.
 */
export const formatUsPhone = (value: string | null | undefined): string => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const digits = raw.replace(/\D/g, "");
  const tenDigits = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;

  if (tenDigits.length !== 10) return raw;

  return `+1 (${tenDigits.slice(0, 3)}) ${tenDigits.slice(3, 6)}-${tenDigits.slice(6)}`;
};
