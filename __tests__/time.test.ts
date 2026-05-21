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

  it("formatLeadCreatedAt delegates to formatSupabaseTimestamptz", () => {
    expect(formatLeadCreatedAt(USER_SAMPLE)).toBe("2026-05-20 23:55:10");
  });
});
