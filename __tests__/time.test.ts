import { describe, expect, it } from "vitest";
import {
  formatIST,
  formatSupabaseTimestamptz,
  parseTimestamptz,
} from "@/lib/utils/time";
import { formatLeadCreatedAt } from "@/lib/utils/date-format";

const SAMPLE = "2026-05-21T00:22:53+00:00";
const USER_SAMPLE = "2026-05-20 23:55:10+00";

describe("parseTimestamptz", () => {
  it("parses explicit UTC offset", () => {
    expect(parseTimestamptz("2026-05-21 00:22:53+00").toISOString()).toBe(
      "2026-05-21T00:22:53.000Z",
    );
  });

  it("treats offset-less Postgres strings as UTC", () => {
    expect(parseTimestamptz("2026-05-21T00:22:53").toISOString()).toBe(
      "2026-05-21T00:22:53.000Z",
    );
  });
});

describe("lead created_at display", () => {
  it("formatIST applies Asia/Kolkata (+5:30)", () => {
    expect(formatIST(SAMPLE, "h:mm a")).toBe("5:52 AM");
  });

  it("formatSupabaseTimestamptz matches Supabase table text (no IST shift)", () => {
    expect(formatSupabaseTimestamptz(SAMPLE)).toBe("2026-05-21 00:22:53");
    expect(formatSupabaseTimestamptz(USER_SAMPLE)).toBe("2026-05-20 23:55:10");
  });

  /*
   * This asserted `formatSupabaseTimestamptz` until 90a042a ("founder role")
   * switched the implementation to formatIST and left the test behind — it has
   * been red on main ever since.
   *
   * The IST display is the correct contract, not the raw text: this value is
   * shown to users in LeadInfoCard, LeadsTable (created and updated) and the
   * lead dossier, and the house rule is Asia/Kolkata for anything user-facing.
   * `formatSupabaseTimestamptz` still exists for the case it is named after —
   * matching what you see in the Supabase table — and is covered above.
   */
  it("formatLeadCreatedAt renders IST for display", () => {
    // 2026-05-20 23:55:10 UTC is 05:25 on the 21st in Asia/Kolkata.
    expect(formatLeadCreatedAt(USER_SAMPLE)).toBe("21 May 2026, 5:25 AM");
  });

  it("formatLeadCreatedAt shifts the clock — it is not the raw Supabase text", () => {
    // Pins the distinction the two formatters exist to draw, so a future revert
    // to the raw string fails loudly instead of silently changing the UI.
    expect(formatLeadCreatedAt(USER_SAMPLE)).not.toBe(
      formatSupabaseTimestamptz(USER_SAMPLE),
    );
  });

  it("formatLeadCreatedAt handles an empty value", () => {
    expect(formatLeadCreatedAt("")).toBe("—");
    expect(formatLeadCreatedAt("   ")).toBe("—");
  });
});
