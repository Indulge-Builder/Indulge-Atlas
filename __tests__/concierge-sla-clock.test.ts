import { describe, it, expect } from "vitest";
import {
  addSlaMinutes,
  slaMinutesBetween,
  computeSlaDueDates,
  isOverdueSince,
  MINUTES_PER_DAY,
  OVERDUE_THRESHOLD_MINUTES,
} from "@/lib/concierge/slaClock";

// 24/7 calendar clock. IST anchors: 09:00 IST = 03:30Z, 17:00 IST = 11:30Z.
const MON_0900 = "2026-07-13T03:30:00.000Z";
const SAT_1700 = "2026-07-11T11:30:00.000Z";

describe("constants", () => {
  it("1 day = 1440 min, overdue = 480 min", () => {
    expect(MINUTES_PER_DAY).toBe(1440);
    expect(OVERDUE_THRESHOLD_MINUTES).toBe(480);
  });
});

describe("addSlaMinutes (calendar, 24/7)", () => {
  it("adds within a day", () => {
    expect(addSlaMinutes(new Date(MON_0900), 480).toISOString()).toBe("2026-07-13T11:30:00.000Z"); // +8h
  });
  it("does NOT skip weekends (24/7)", () => {
    // Sat 17:00 + 120 = Sat 19:00, no jump to Monday
    expect(addSlaMinutes(new Date(SAT_1700), 120).toISOString()).toBe("2026-07-11T13:30:00.000Z");
  });
  it("rolls across multiple days (2 days = 2880 min)", () => {
    // Mon 09:00 + 48h = Wed 09:00
    expect(addSlaMinutes(new Date(MON_0900), 2880).toISOString()).toBe("2026-07-15T03:30:00.000Z");
  });
  it("clamps a non-positive duration to the start", () => {
    expect(addSlaMinutes(new Date(MON_0900), 0).toISOString()).toBe(MON_0900);
  });
});

describe("slaMinutesBetween", () => {
  it("counts calendar minutes", () => {
    expect(slaMinutesBetween(new Date(MON_0900), new Date("2026-07-13T12:00:00.000Z"))).toBe(510); // 8.5h
  });
  it("returns 0 when end <= start", () => {
    expect(slaMinutesBetween(new Date("2026-07-13T12:00:00.000Z"), new Date(MON_0900))).toBe(0);
  });
});

describe("computeSlaDueDates", () => {
  it("15m first response, 8h resolution from Monday 09:00", () => {
    const { firstResponseDue, resolutionDue } = computeSlaDueDates(MON_0900, 15, 480);
    expect(firstResponseDue).toBe("2026-07-13T03:45:00.000Z");
    expect(resolutionDue).toBe("2026-07-13T11:30:00.000Z");
  });
  it("2-day resolution (Retail Watches & Bags = 2880m)", () => {
    const { resolutionDue } = computeSlaDueDates(MON_0900, 15, 2880);
    expect(resolutionDue).toBe("2026-07-15T03:30:00.000Z");
  });
});

describe("isOverdueSince", () => {
  it("is true past 8h", () => {
    expect(isOverdueSince(MON_0900, new Date("2026-07-13T12:00:00.000Z"))).toBe(true); // 8.5h
  });
  it("is false before 8h", () => {
    expect(isOverdueSince(MON_0900, new Date("2026-07-13T10:30:00.000Z"))).toBe(false); // 7h
  });
});
