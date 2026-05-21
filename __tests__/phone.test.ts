import { describe, it, expect } from "vitest";
import {
  formatPhoneForFreshdeskLookup,
  normalizeToE164,
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
