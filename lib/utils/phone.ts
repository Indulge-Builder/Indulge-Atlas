import {
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

/**
 * Normalize a phone number to E.164 using libphonenumber-js.
 *
 * - Input starting with `+` is parsed as international; the entered country code is
 *   always respected and never coerced to +91 (so removing/switching +91 persists).
 * - Input without `+` uses `defaultCountry` (India), so a bare 10-digit mobile
 *   becomes +91…, while other national numbers parse under that country.
 * - Anything libphonenumber-js can't validate returns "" so callers surface a
 *   validation error rather than persisting a coerced/garbage number.
 */
export function normalizeToE164(
  phone: string,
  defaultCountry: CountryCode = "IN",
): string {
  const trimmed = (phone ?? "").trim();
  if (!trimmed) return "";

  try {
    const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
    if (parsed?.isValid()) {
      return parsed.format("E.164");
    }
  } catch {
    /* invalid → fall through to "" */
  }

  return "";
}

/**
 * Convert a stored E.164 number into an edit-friendly value for input fields.
 * Indian (+91) numbers become their bare national form (e.g. "9876543210") so users
 * can see they're free to drop/keep the +91; every other country code is preserved
 * as-is (e.g. "+16505551234") so it doesn't get coerced. `normalizeToE164` turns
 * either shape back into E.164 on save.
 */
export function toEditablePhone(phone: string | null | undefined): string {
  const trimmed = (phone ?? "").trim();
  if (!trimmed) return "";

  try {
    const parsed = parsePhoneNumberFromString(trimmed, "IN");
    if (parsed?.isValid() && parsed.country === "IN") {
      return parsed.nationalNumber;
    }
  } catch {
    /* fall through to raw */
  }

  return trimmed;
}

/**
 * Variants to match legacy `leads.phone_number` storage (E.164, digits-only, etc.).
 */
export function e164LookupVariants(e164: string): string[] {
  const normalized = e164.trim();
  if (!normalized) return [];

  const set = new Set<string>();
  const d = normalized.replace(/\D/g, "");
  if (d) set.add(d);
  set.add(normalized);
  if (normalized.startsWith("+")) {
    set.add(normalized.slice(1));
    if (normalized.startsWith("+91") && normalized.length > 3) {
      set.add(normalized.slice(3));
    }
  }
  if (d.startsWith("00")) {
    const rest = d.slice(2);
    set.add(rest);
    set.add(`+${rest}`);
  }

  return Array.from(set).filter(Boolean);
}

/**
 * Format a stored Atlas phone for Freshdesk contact lookup.
 * Freshdesk stores Indian mobiles without country code; Atlas uses E.164 (+91…).
 * Numbers with +91 are parsed and sent as national digits; all others pass through trimmed.
 */
export function formatPhoneForFreshdeskLookup(phone: string): string {
  const trimmed = (phone ?? "").trim();
  if (!trimmed) return "";

  if (!trimmed.startsWith("+91")) {
    return trimmed;
  }

  try {
    const parsed = parsePhoneNumberFromString(trimmed, "IN");
    if (parsed?.isValid()) {
      return parsed.nationalNumber;
    }
  } catch {
    /* fall through */
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length > 10) {
    return digits.slice(2);
  }

  return trimmed;
}
