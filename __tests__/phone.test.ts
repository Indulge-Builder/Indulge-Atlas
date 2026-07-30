import { describe, it, expect } from "vitest";
import {
  formatPhoneForFreshdeskLookup,
  normalizeToE164,
  toEditablePhone,
} from "@/lib/utils/phone";

describe("normalizeToE164", () => {
  it("formats a valid 10-digit Indian mobile number to E.164", () => {
    // libphonenumber-js parses this as a valid IN mobile and returns E.164
    expect(normalizeToE164("9876543210")).toBe("+919876543210");
  });

  it("strips spaces and normalises a spaced Indian number", () => {
    // libphonenumber-js handles internal spaces; result should be identical to no-space variant
    expect(normalizeToE164("98765 43210")).toBe("+919876543210");
  });

  it("returns an empty string for a junk alphabetic string with no digits", () => {
    // Parse fails; digit-strip also yields "" → early-return ""
    expect(normalizeToE164("hello world!")).toBe("");
  });

  // ── User stories: freely add / remove / switch the country code ──────────────

  it("keeps an explicit +91 international number", () => {
    expect(normalizeToE164("+91 98765 43210")).toBe("+919876543210");
  });

  it("adds +91 for a bare 10-digit Indian mobile (no country code)", () => {
    // Removing +91 and entering 10 digits still saves the correct +91… E.164
    expect(normalizeToE164("9876543210")).toBe("+919876543210");
  });

  it("switches to a US number without reverting to +91", () => {
    expect(normalizeToE164("+1 650 555 1234")).toBe("+16505551234");
    expect(normalizeToE164("+16505551234")).toBe("+16505551234");
  });

  it("keeps other country codes (UK) as entered", () => {
    expect(normalizeToE164("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("never coerces a +-prefixed but invalid number to +91", () => {
    // Previously fell back to +91<digits>; now it errors (empty) so the UI can flag it
    expect(normalizeToE164("+1 650")).toBe("");
    expect(normalizeToE164("+9112345")).toBe("");
  });

  it("returns '' for an unparseable no-code number (no +91 coercion)", () => {
    // The old conservative +91 fallback is gone: invalid input errors instead of
    // being coerced to +91<digits>.
    expect(normalizeToE164("12345")).toBe("");
  });
});

describe("toEditablePhone", () => {
  it("shows the bare national form for a stored +91 number", () => {
    // Opening Contact edit should let the user see/drop the +91 freely
    expect(toEditablePhone("+919876543210")).toBe("9876543210");
  });

  it("preserves other country codes as-is", () => {
    expect(toEditablePhone("+16505551234")).toBe("+16505551234");
    expect(toEditablePhone("+442079460958")).toBe("+442079460958");
  });

  it("returns '' for empty/nullish input", () => {
    expect(toEditablePhone("")).toBe("");
    expect(toEditablePhone(null)).toBe("");
    expect(toEditablePhone(undefined)).toBe("");
  });

  it("round-trips: editable form re-normalises to the stored E.164", () => {
    expect(normalizeToE164(toEditablePhone("+919876543210"))).toBe(
      "+919876543210",
    );
  });
});

describe("formatPhoneForFreshdeskLookup", () => {
  it("strips +91 E.164 to national digits for Freshdesk", () => {
    expect(formatPhoneForFreshdeskLookup("+919876543210")).toBe("9876543210");
  });

  it("passes non-Indian numbers through unchanged", () => {
    expect(formatPhoneForFreshdeskLookup("+14155552671")).toBe("+14155552671");
    expect(formatPhoneForFreshdeskLookup("9876543210")).toBe("9876543210");
  });

  it("returns empty string for empty input", () => {
    expect(formatPhoneForFreshdeskLookup("")).toBe("");
    expect(formatPhoneForFreshdeskLookup("   ")).toBe("");
  });
});
