import { describe, expect, it } from "vitest";
import {
  matchFastPath,
  normalizeCaseLabel,
  parseRange,
} from "@/src/lib/voice/parser";
import {
  cancelPending,
  getDraft,
  getPending,
  setDraft,
  setPending,
} from "@/lib/voice-session";

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
  it("handles confirmation and cancellation state", () => {
    setPending({
      action: "create_case",
      args: { label: "S-101" },
      description: "Create S-101?",
    });
    expect(getPending()?.action).toBe("create_case");
    expect(cancelPending().reply).toBe("Cancelled.");
    expect(getPending()).toBeNull();
  });
  it("cancels an intake clarification draft", () => {
    setDraft({ tool: "create_case", args: {} });
    expect(getDraft()?.tool).toBe("create_case");
    expect(cancelPending().reply).toBe("Cancelled.");
    expect(getDraft()).toBeNull();
  });
});
