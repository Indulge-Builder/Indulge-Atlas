import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Display formatter for stored E.164 phone numbers. Uses libphonenumber-js so the
 * country code is grouped correctly for any nation (+91 98765 43210, +1 650 555 1234,
 * +44 20 7946 0958) without assuming +91 is fixed. Numbers without a country code, or
 * that can't be parsed, are shown as entered.
 */
export function formatPhoneForDisplay(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === "") return "—";
  const trimmed = String(raw).trim();

  if (trimmed.startsWith("+")) {
    try {
      const parsed = parsePhoneNumberFromString(trimmed);
      if (parsed) return parsed.formatInternational();
    } catch {
      /* fall through to raw */
    }
  }

  return trimmed;
}
