import { describe, it, expect } from "vitest";
import { sanitizeFormData } from "@/lib/utils/sanitize";

describe("sanitizeFormData", () => {
  it("truncates deeply nested objects beyond MAX_NEST_DEPTH (2)", () => {
    const input = {
      level0: {
        level1: {
          // depth=2: this object should be replaced with null (depth >= MAX_NEST_DEPTH for objects)
          level2: { tooDeep: "value" },
        },
      },
    };

    const result = sanitizeFormData(input) as Record<string, unknown>;

    // level0.level1 exists (depth 1)
    const level1 = (result.level0 as Record<string, unknown>).level1 as Record<
      string,
      unknown
    >;
    expect(level1).toBeDefined();

    // level2 is at depth=2 when sanitizeFormValue is called → object is replaced with null
    expect(level1.level2).toBeNull();
  });

  it("strips HTML tags and script payloads from string values", () => {
    const input = {
      name: "<script>alert('xss')</script>John",
      bio: "<b>Bold</b> plain text",
    };

    const result = sanitizeFormData(input) as Record<string, string>;

    // DOMPurify with ALLOWED_TAGS:[] strips all HTML; plain text survives
    expect(result.name).not.toContain("<script>");
    expect(result.name).toContain("John");
    expect(result.bio).not.toContain("<b>");
    expect(result.bio).toContain("plain text");
  });
});
