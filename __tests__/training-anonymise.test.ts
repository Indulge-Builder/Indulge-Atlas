import { describe, it, expect } from "vitest";
import { anonymiseText, anonymiseField } from "@/training/ingest/anonymise";

describe("anonymiseText — pattern redaction", () => {
  it("redacts emails", () => {
    const r = anonymiseText("reach me at john.doe@example.com please");
    expect(r.text).not.toContain("@example.com");
    expect(r.text).toContain("[email]");
    expect(r.redactions).toBeGreaterThan(0);
  });

  it("redacts phone numbers with country code and separators", () => {
    const r = anonymiseText("call +91 98765 43210 anytime");
    expect(r.text).not.toMatch(/\d{5}/);
    expect(r.text).toContain("[phone]");
  });

  it("redacts URLs and bare domains", () => {
    const r = anonymiseText("see https://maps.app.goo.gl/abc123 and foo.com/x");
    expect(r.text).not.toContain("goo.gl/abc");
    expect(r.text).toContain("[link]");
  });

  it("redacts social handles", () => {
    const r = anonymiseText("dm @luxe_traveller for details");
    expect(r.text).toContain("[handle]");
    expect(r.text).not.toContain("@luxe_traveller");
  });

  it("redacts invoice numbers", () => {
    const r = anonymiseText("invoice INV2627-010141 attached");
    expect(r.text).toContain("[invoice]");
    expect(r.text).not.toContain("INV2627");
  });

  it("redacts standalone long digit runs (booking refs)", () => {
    const r = anonymiseText("booking ref 1070054624596 confirmed");
    expect(r.text).toContain("[ref]");
    expect(r.text).not.toContain("1070054624596");
  });
});

describe("anonymiseText — requester name scrubbing", () => {
  it("scrubs the member's name to 'the member'", () => {
    const r = anonymiseText("Vijay wants a car at 6 AM", { requesterNames: ["Vijay Kumar"] });
    expect(r.text).toContain("the member");
    expect(r.text).not.toContain("Vijay");
  });

  it("strips concierge wrappers from the name before scrubbing", () => {
    const r = anonymiseText("call Vijay now", { requesterNames: ["(Private) Vijay's Concierge"] });
    expect(r.text).not.toContain("Vijay");
    expect(r.text).toContain("the member");
  });

  it("does not scrub short/common tokens", () => {
    // 'Al' is < 3 chars → not scrubbed; sentence stays legible
    const r = anonymiseText("the trip to the hills", { requesterNames: ["Al"] });
    expect(r.text).toBe("the trip to the hills");
  });
});

describe("anonymiseText — denylist", () => {
  it("redacts operator-supplied proper nouns", () => {
    const r = anonymiseText("book the Assagao villa for the weekend", { denylist: ["Assagao"] });
    expect(r.text).not.toContain("Assagao");
    expect(r.text).toContain("[redacted]");
  });
});

describe("anonymiseText — one-way + hygiene", () => {
  it("is destructive: output never contains the raw values", () => {
    const raw = "Priya on +91 90000 11111, priya@x.com, @priya_v, ref 998877";
    const r = anonymiseText(raw, { requesterNames: ["Priya"] });
    for (const leak of ["Priya", "priya@x.com", "@priya_v", "998877", "90000"]) {
      expect(r.text).not.toContain(leak);
    }
  });

  it("collapses whitespace and trims", () => {
    expect(anonymiseText("  a   b\n\tc  ").text).toBe("a b c");
  });

  it("returns empty for nullish input", () => {
    expect(anonymiseText(null).text).toBe("");
    expect(anonymiseText(undefined).redactions).toBe(0);
  });
});

describe("anonymiseField", () => {
  it("returns a labelled, scrubbed field", () => {
    const f = anonymiseField("Request", "car for Priya", { requesterNames: ["Priya"] });
    expect(f).not.toBeNull();
    expect(f!.label).toBe("Request");
    expect(f!.value).toContain("the member");
  });

  it("drops fields that empty out to nothing or [redacted]", () => {
    expect(anonymiseField("Location", "Assagao", { denylist: ["Assagao"] })).toBeNull();
    expect(anonymiseField("Note", "   ", {})).toBeNull();
  });
});
