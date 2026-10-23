import { describe, expect, it } from "vitest";
import {
  endOfToday,
  parseReminderDate,
  startOfToday,
} from "@/lib/phase6-actions";

describe("Phase 6 reminders and daily boundaries", () => {
  const monday = new Date("2026-10-19T14:30:00");

  it("parses tomorrow at the start-of-work time", () => {
    expect(parseReminderDate("remind me tomorrow", monday)?.getDate()).toBe(20);
    expect(parseReminderDate("tomorrow", monday)?.getHours()).toBe(9);
  });

  it("chooses the next named weekday", () => {
    const thursday = parseReminderDate("Thursday", monday);
    expect(thursday?.getDay()).toBe(4);
    expect(thursday?.getDate()).toBe(22);
  });

  it("returns null for an unclear reminder date", () => {
    expect(parseReminderDate("sometime later", monday)).toBeNull();
  });

  it("builds inclusive local day boundaries", () => {
    expect(startOfToday(monday).getHours()).toBe(0);
    expect(endOfToday(monday).getHours()).toBe(23);
    expect(endOfToday(monday).getDate()).toBe(19);
  });
});
