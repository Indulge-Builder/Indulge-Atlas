/**
 * Academy — seed PII detector.
 *
 * The named pre-mortem risk is a trainer pasting a REAL Freshdesk ticket into the
 * seed library, putting a member's email/phone into a training scenario that then
 * gets replayed to interns. `detectPII` / `scanSeedForPII` are the gate. Two
 * properties matter equally:
 *   - it catches real identifiers (emails, phones, URLs, handles, long numbers);
 *   - it does NOT cry wolf on ordinary concierge prose ("table for four",
 *     "two hours", "in 3 days") — a noisy detector gets ignored.
 *
 * Pure module under test — no network, no mocks.
 */

import { describe, it, expect } from "vitest";
import { detectPII, scanSeedForPII } from "@/lib/academy/pii";
import type { PiiKind } from "@/lib/academy/pii";

function kinds(text: string): PiiKind[] {
  return detectPII(text).map((h) => h.kind);
}

// ── Positive detection ───────────────────────────────────────────────────────

describe("detectPII — emails", () => {
  it("catches a plain email address", () => {
    const hits = detectPII("Reach me at marisol.vega@example.com any time.");
    expect(hits.map((h) => h.kind)).toContain("email");
    expect(hits.find((h) => h.kind === "email")?.sample).toBe(
      "marisol.vega@example.com",
    );
  });

  it("catches emails with plus-addressing and subdomains", () => {
    expect(kinds("bookings+vip@mail.indulge.global")).toContain("email");
    expect(kinds("a_b-c%d@sub.domain.co.uk")).toContain("email");
  });

  it("catches an email embedded mid-sentence", () => {
    expect(kinds("Send the itinerary to devan@example.org before noon.")).toContain(
      "email",
    );
  });

  it("de-duplicates the same identifier repeated", () => {
    const hits = detectPII("mail a@b.com and then a@b.com again");
    expect(hits.filter((h) => h.kind === "email")).toHaveLength(1);
  });
});

describe("detectPII — phone numbers", () => {
  it("catches a +country-code spaced number", () => {
    const hits = detectPII("Call me on +91 98765 43210 after six.");
    expect(hits.map((h) => h.kind)).toContain("phone");
    expect(hits.find((h) => h.kind === "phone")?.sample).toContain("98765");
  });

  it("catches a spaced number with no country code", () => {
    expect(kinds("Ring 098 7654 3210 tomorrow")).toContain("phone");
  });

  it("catches a bracketed / dashed number", () => {
    expect(kinds("Office: (020) 7946 0958")).toContain("phone");
    expect(kinds("Mobile +1-415-555-0132 is best")).toContain("phone");
  });

  it("requires at least nine digits — short number runs are not phones", () => {
    // Eight digits is below the threshold, so no phone hit.
    expect(kinds("code 12 34 56 78")).not.toContain("phone");
  });
});

describe("detectPII — URLs, handles and long numbers", () => {
  it("catches https and www URLs", () => {
    expect(kinds("Book here: https://example.com/reservations")).toContain("url");
    expect(kinds("see www.example.com for the menu")).toContain("url");
  });

  it("catches an @handle but not the @ inside an email", () => {
    expect(kinds("ping @lucia_travel about the villa")).toContain("handle");
    const emailOnly = kinds("write to lucia@example.com");
    expect(emailOnly).toContain("email");
    expect(emailOnly).not.toContain("handle");
  });

  it("catches a standalone run of seven or more digits", () => {
    const hits = detectPII("Reference 8891234 for the booking.");
    expect(hits.map((h) => h.kind)).toContain("long_number");
    expect(hits.find((h) => h.kind === "long_number")?.sample).toBe("8891234");
  });

  it("truncates a long sample to keep the warning readable", () => {
    const hits = detectPII(`Visit https://example.com/${"a".repeat(200)}`);
    const url = hits.find((h) => h.kind === "url");
    expect(url).toBeDefined();
    expect(url!.sample.length).toBeLessThanOrEqual(60);
  });
});

// ── Negative detection (the anti-noise contract) ─────────────────────────────

describe("detectPII — ordinary concierge prose stays clean", () => {
  const CLEAN = [
    "table for four",
    "two hours",
    "in 3 days",
    "Book a table for four, about two hours, in 3 days.",
    "The member has 2 guests and needs 45 minutes at the spa.",
    "Only Friday evening works and one guest is strictly vegan.",
    "Party of 6 arriving around 8pm, quiet corner preferred.",
    "Comfortable with a private-room minimum, no hard budget cap.",
  ];

  for (const text of CLEAN) {
    it(`does not flag: "${text}"`, () => {
      expect(detectPII(text)).toEqual([]);
    });
  }

  it("returns an empty array for empty input", () => {
    expect(detectPII("")).toEqual([]);
  });
});

// ── Seed scanning ────────────────────────────────────────────────────────────

interface SeedDraft {
  title?: string;
  archetype?: string;
  opening_message?: string;
  escalation_trigger?: string;
  ideal_outcome?: string;
  hidden_constraints?: { label?: string; reveal_when?: string; value?: string }[];
}

function cleanSeed(overrides: SeedDraft = {}): SeedDraft {
  return {
    title: "Late dinner rescue",
    archetype: "Warm but exacting; texts in short bursts",
    opening_message:
      "Hi — I need a table for four later this week, somewhere quiet. Can you help?",
    escalation_trigger:
      "the concierge repeats a question already answered, or offers nothing concrete after two replies",
    ideal_outcome:
      "Concierge probes for the dietary constraint and the evening, offers two specific venues, and confirms the next step.",
    hidden_constraints: [
      {
        label: "Dietary",
        reveal_when: "asked directly about dietary needs or allergies",
        value: "One guest is strictly vegan",
      },
      {
        label: "Timing",
        reveal_when: "asked which evening actually works",
        value: "Only Friday evening works",
      },
    ],
    ...overrides,
  };
}

describe("scanSeedForPII — a clean synthetic seed", () => {
  it("returns no issues", () => {
    expect(scanSeedForPII(cleanSeed())).toEqual([]);
  });

  it("returns no issues for a seed with no hidden constraints", () => {
    expect(scanSeedForPII(cleanSeed({ hidden_constraints: [] }))).toEqual([]);
  });

  it("tolerates missing optional fields", () => {
    expect(scanSeedForPII({})).toEqual([]);
    expect(scanSeedForPII({ title: "Just a title" })).toEqual([]);
  });
});

describe("scanSeedForPII — a seed carrying real-looking data", () => {
  it("flags an email in the opening message and names the field", () => {
    const issues = scanSeedForPII(
      cleanSeed({
        opening_message:
          "Hi, it's Marisol — you can reach me on marisol.vega@example.com.",
      }),
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(
      issues.some(
        (i) => i.startsWith("Opening message:") && i.includes("email"),
      ),
    ).toBe(true);
    expect(issues.some((i) => i.includes("marisol.vega@example.com"))).toBe(true);
  });

  it("flags a phone number in the opening message", () => {
    const issues = scanSeedForPII(
      cleanSeed({ opening_message: "Call me on +91 98765 43210, it's urgent." }),
    );
    expect(
      issues.some((i) => i.startsWith("Opening message:") && i.includes("phone")),
    ).toBe(true);
  });

  it("flags a phone number hidden inside a constraint value", () => {
    const issues = scanSeedForPII(
      cleanSeed({
        hidden_constraints: [
          {
            label: "Contact",
            reveal_when: "asked how to confirm",
            value: "Prefers a call on +44 7700 900123",
          },
        ],
      }),
    );
    expect(
      issues.some(
        (i) => i.startsWith("Hidden constraint 1:") && i.includes("phone"),
      ),
    ).toBe(true);
  });

  it("numbers each offending constraint by its position", () => {
    const issues = scanSeedForPII(
      cleanSeed({
        hidden_constraints: [
          {
            label: "Dietary",
            reveal_when: "asked about dietary needs",
            value: "One guest is strictly vegan",
          },
          {
            label: "Account",
            reveal_when: "asked how it will be billed",
            value: "Account 8891234 is on file",
          },
        ],
      }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("Hidden constraint 2:");
    // hit.kind "long_number" is rendered human-readably.
    expect(issues[0]).toContain("long number");
    expect(issues[0]).toContain("8891234");
  });

  it("flags a URL in the ideal outcome", () => {
    const issues = scanSeedForPII(
      cleanSeed({
        ideal_outcome: "Concierge sends the booking link https://example.com/vip.",
      }),
    );
    expect(
      issues.some((i) => i.startsWith("Ideal outcome:") && i.includes("url")),
    ).toBe(true);
  });

  it("reports one issue per offending field, across several fields at once", () => {
    const issues = scanSeedForPII(
      cleanSeed({
        title: "Ticket for devan@example.org",
        opening_message: "Call +91 98765 43210 please.",
        escalation_trigger: "nothing concrete within an hour",
      }),
    );
    expect(issues.some((i) => i.startsWith("Title:"))).toBe(true);
    expect(issues.some((i) => i.startsWith("Opening message:"))).toBe(true);
    expect(issues.some((i) => i.startsWith("Escalation trigger:"))).toBe(false);
    expect(issues.length).toBeGreaterThanOrEqual(2);
  });
});
