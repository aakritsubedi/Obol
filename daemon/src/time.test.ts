import { describe, expect, it } from "vitest";
import { dateForTimeZone, shiftDate } from "./time.js";

describe("time helpers", () => {
  it("anchors date shifts at noon so DST transitions do not change the calendar date", () => {
    expect(shiftDate("2024-03-09", 1, "America/Los_Angeles")).toBe("2024-03-10");
    expect(shiftDate("2024-11-02", 1, "America/Los_Angeles")).toBe("2024-11-03");
  });

  it("formats the same instant in the requested zone", () => {
    expect(dateForTimeZone(new Date("2024-03-10T07:30:00Z"), "America/Los_Angeles")).toBe("2024-03-09");
  });
});
