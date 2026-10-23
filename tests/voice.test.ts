import { describe, expect, it } from "vitest";
import {
  matchFastPath,
  matchRegistryFastPath,
  normalizeCaseLabel,
  parseRange,
} from "@/src/lib/voice/parser";

describe("case label parsing", () => {
  it.each([
    ["S 101", "S-101"],
    ["s-101", "S-101"],
    ["S one oh one", "S-101"],
  ])("normalizes %s", (input, expected) =>
    expect(normalizeCaseLabel(input)).toBe(expected),
  );
  it("parses ranges", () =>
    expect(parseRange("S-101 to S-140")).toEqual({
      start: "S-101",
      end: "S-140",
    }));
});

describe("voice fast path", () => {
  it("matches deterministic commands without AI", () =>
    expect(matchFastPath("show pending")?.tool).toBe("show_pending"));
  it("maps fast paths to registered action ids", () =>
    expect(matchRegistryFastPath("show pending")).toMatchObject({
      tool: "set_filter",
      args: { filter: "pending" },
    }));
  it("recognizes natural case intake and extracts its details", () => {
    expect(matchFastPath("Let's add a new case")?.tool).toBe("create_case");
    expect(
      matchFastPath("create case S 141 appendix urgent")?.args,
    ).toMatchObject({
      label: "S-141",
      specimen: "Appendix",
      priority: "urgent",
    });
  });
});
