/**
 * Convert a supported US phone number to E.164.
 *
 * Deliberately rejects non-US and ambiguous values instead of comparing only
 * the final ten digits, which could attach a recording to the wrong lead.
 */
export const normalizeUsPhoneE164 = (value: unknown): string | null => {
  const digits = String(value ?? "").replace(/\D/g, "");

  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;

  return null;
};

export const maskE164Phone = (value: string): string =>
  value.length >= 4 ? `***-***-${value.slice(-4)}` : "invalid";

