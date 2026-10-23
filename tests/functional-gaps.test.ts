import { describe, expect, it } from "vitest";
import { attentionReasons } from "@/lib/case-attention";
import { parseReminderCommand } from "@/lib/phase6-actions";
import { specimenName, specimenSlug } from "@/lib/specimens";
import { compareTypedReport } from "@/lib/phase5-actions";

describe("remaining functional gaps", () => {
  it("computes every worklist attention reason and supports overdue filtering", () => {
    expect(
      attentionReasons(
        {
          priority: "urgent",
          incomplete: true,
          status: "with_typist",
          updatedAt: "2026-10-01",
          reminders: [{ done: false }],
          typistChecks: [{ result: "returned" }],
        },
        2,
        new Date("2026-10-23"),
      ),
    ).toEqual([
      "urgent",
      "incomplete",
      "overdue",
      "revisit",
      "typist returned",
    ]);
  });

  it("parses a natural reminder with date, task and case label", () => {
    expect(
      parseReminderCommand("remind me Thursday to check S 141 colon IHC"),
    ).toEqual({
      when: "thursday",
      text: "check S 141 colon IHC",
      label: "S-141",
    });
  });

  it("normalises specimen storage to stable slugs", () => {
    expect(specimenSlug("Skin ellipse")).toBe("skin-ellipse");
    expect(specimenName("skin-ellipse")).toBe("Skin ellipse");
  });

  it("flags exact-number and laterality typist differences", () => {
    const diff = compareTypedReport(
      {
        diagnosis: "Carcinoma",
        grade: "2",
        stage: "pT3",
        margins: "clear",
        laterality: "left",
        tumourSize: "1.2 cm",
      },
      "Diagnosis: Carcinoma\nGrade: 2\nStage: pT3\nMargins: clear\nLaterality: right\nTumour size: 2.1 cm",
    );
    expect(diff.find((row) => row.field === "tumourSize")?.hint).toBe(
      "Digits look swapped",
    );
    expect(diff.find((row) => row.field === "laterality")?.hint).toBe(
      "Laterality differs",
    );
  });
});
