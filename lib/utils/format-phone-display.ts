/**
 * Lightweight E.164 display formatter for client components (no libphonenumber-js).
 * India-first grouping: +91 98765 43210
 */
export function formatPhoneForDisplay(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === "") return "—";
  const d = String(raw).trim().replace(/\s/g, "");
  if (!d.startsWith("+")) return raw.trim();
  if (d.startsWith("+91") && d.length >= 4) {
    const rest = d.slice(3).replace(/\D/g, "");
    if (rest.length <= 5) return `+91 ${rest}`;
    return `+91 ${rest.slice(0, 5)} ${rest.slice(5)}`;
  }
  const digits = d.slice(1).replace(/\D/g, "");
  const ccLen = Math.min(3, Math.max(1, d.length - 1 - digits.length > 0 ? 1 : 1));
  return `${d.slice(0, 1 + ccLen)} ${digits.slice(ccLen)}`.trim();
}
