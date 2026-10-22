import { describe, expect, it } from "vitest";
import { saveMicroSchema } from "@/lib/micro-actions";
import { containsPatientIdentifier } from "@/src/lib/privacy";

describe("Phase 4 microscopy validation", () => {
  it("requires confirmation before saving microscopy", () => {
    expect(
      saveMicroSchema.safeParse({
        dictation: "Transmural neutrophilic infiltrate",
        differential: [],
        ihc: [],
      }).success,
    ).toBe(false);
  });

  it("accepts a confirmed structured microscopy entry", () => {
    expect(
      saveMicroSchema.safeParse({
        dictation: "Transmural neutrophilic infiltrate",
        differential: ["Acute appendicitis"],
        ihc: [],
        provisionalDx: "Acute appendicitis",
        confirmed: true,
      }).success,
    ).toBe(true);
  });
});

describe("AI privacy boundary", () => {
  it("detects common patient identifiers", () => {
    expect(containsPatientIdentifier("MRN 12345678, appendix specimen")).toBe(
      true,
    );
    expect(containsPatientIdentifier("Patient name is Jane Doe")).toBe(true);
  });

  it("allows clinical findings without identifiers", () => {
    expect(
      containsPatientIdentifier(
        "Transmural inflammation and mucosal ulceration",
      ),
    ).toBe(false);
  });
});
