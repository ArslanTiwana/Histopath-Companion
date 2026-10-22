import { describe, expect, it } from "vitest";
import { bypassGrossSchema, saveGrossSchema } from "@/lib/gross-actions";
import {
  buildGrossDescription,
  GROSS_TEMPLATES,
} from "@/src/lib/gross/templates";

describe("gross templates", () => {
  it("builds a description without inventing missing fields", () => {
    const text = buildGrossDescription("Appendix", {
      length: "7 cm",
      perforation: "No perforation identified",
    });
    expect(text).toBe(
      "Appendix specimen. Length: 7 cm. Perforation: No perforation identified.",
    );
    expect(text).not.toContain("Diameter");
  });

  it("provides a guided checklist for each supported specimen", () => {
    for (const template of Object.values(GROSS_TEMPLATES)) {
      expect(template.fields.length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("gross confirmation validation", () => {
  it("requires explicit confirmation before saving", () => {
    expect(
      saveGrossSchema.safeParse({
        action: "save",
        specimenType: "Appendix",
        fields: { length: "7 cm" },
        descriptionText: "Appendix specimen. Length: 7 cm.",
      }).success,
    ).toBe(false);
  });

  it("requires a reason to skip or force", () => {
    expect(
      bypassGrossSchema.safeParse({
        action: "skip",
        reason: "",
        confirmed: true,
      }).success,
    ).toBe(false);
  });
});
