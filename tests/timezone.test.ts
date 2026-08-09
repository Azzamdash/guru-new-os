import { describe, expect, it } from "vitest";
import { businessDateEndUTC, businessDateStartUTC, formatBusinessDate } from "../src/lib/timezone";

describe("businessDateStartUTC / businessDateEndUTC (Africa/Cairo)", () => {
  it("computes correct UTC bounds in summer (DST, UTC+3)", () => {
    expect(businessDateStartUTC("2026-08-07")).toBe("2026-08-06T21:00:00.000Z");
    expect(businessDateEndUTC("2026-08-07")).toBe("2026-08-07T20:59:59.999Z");
  });

  it("computes correct UTC bounds in winter (no DST, UTC+2)", () => {
    expect(businessDateStartUTC("2026-01-07")).toBe("2026-01-06T22:00:00.000Z");
    expect(businessDateEndUTC("2026-01-07")).toBe("2026-01-07T21:59:59.999Z");
  });

  it("handles a year rollover", () => {
    expect(businessDateStartUTC("2026-12-31")).toBe("2026-12-30T22:00:00.000Z");
    expect(businessDateEndUTC("2026-12-31")).toBe("2026-12-31T21:59:59.999Z");
  });

  it("start/end of the same date are exactly one day (minus 1ms) apart", () => {
    const start = new Date(businessDateStartUTC("2026-03-15")).getTime();
    const end = new Date(businessDateEndUTC("2026-03-15")).getTime();
    expect(end - start).toBe(24 * 60 * 60 * 1000 - 1);
  });

  it("round-trips: a moment just after start formats back to the same business date", () => {
    const start = new Date(businessDateStartUTC("2026-08-07"));
    const justAfter = new Date(start.getTime() + 1000);
    expect(formatBusinessDate(justAfter)).toBe("2026-08-07");
  });

  it("round-trips: a moment just before end formats back to the same business date", () => {
    const end = new Date(businessDateEndUTC("2026-08-07"));
    const justBefore = new Date(end.getTime() - 1000);
    expect(formatBusinessDate(justBefore)).toBe("2026-08-07");
  });

  it("a moment 1ms after end already belongs to the next business date", () => {
    const end = new Date(businessDateEndUTC("2026-08-07"));
    const justAfter = new Date(end.getTime() + 1);
    expect(formatBusinessDate(justAfter)).toBe("2026-08-08");
  });

  it("catches the reported bug: an early-morning Cairo order lands in the right day's window", () => {
    // 01:30 Cairo local time on 2026-08-07 (summer, UTC+3) = 22:30 UTC on 2026-08-06.
    const earlyMorningOrder = new Date("2026-08-06T22:30:00.000Z");
    const startOfToday = new Date(businessDateStartUTC("2026-08-07")).getTime();
    const endOfYesterday = new Date(businessDateEndUTC("2026-08-06")).getTime();
    expect(earlyMorningOrder.getTime()).toBeGreaterThanOrEqual(startOfToday);
    expect(earlyMorningOrder.getTime()).toBeGreaterThan(endOfYesterday);
  });
});
