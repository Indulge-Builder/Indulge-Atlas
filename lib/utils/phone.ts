import {
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

/**
 * Normalize to E.164 using libphonenumber-js; on parse failure, strip non-digits
 * and prefix +91 (India) as a conservative fallback for inbound webhooks.
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
    /* fall through to fallback */
  }

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  return `+91${digits}`;
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
