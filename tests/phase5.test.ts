import { describe, expect, it } from "vitest";
import {
  compareDiagnoses,
  compareTypedReport,
  digitsLookSwapped,
  normalizeClinicalValue,
  parseDiagnosisText,
  hasConsultantDifferences,
} from "@/lib/phase5-actions";
import { applyReportTemplate } from "@/lib/report-templates";

describe("Phase 5 consultant comparison", () => {
  it("extracts structured staging fields from consultant dictation", () => {
    const result = parseDiagnosisText(
      "Right colon adenocarcinoma G2, pT3 pN1, margins clear, 3.2 cm",
    );
    expect(result.grade).toMatch(/G2/i);
    expect(result.pT).toMatch(/pT3/i);
    expect(result.pN).toMatch(/pN1/i);
    expect(result.laterality.toLowerCase()).toBe("right");
    expect(result.tumourSize).toBe("3.2 cm");
  });

  it("highlights differences from the resident diagnosis", () => {
    const resident = parseDiagnosisText(
      "Adenocarcinoma G2 pT2 pN0 margins clear",
    );
    const consultant = parseDiagnosisText(
      "Adenocarcinoma G2 pT3 pN1 margins clear",
    );
    const differences = compareDiagnoses(resident, consultant).filter(
      (row) => !row.matches,
    );
    expect(differences.map((row) => row.field)).toEqual(
      expect.arrayContaining(["pT", "pN"]),
    );
  });

  it("keeps every difference in Learned From even without a written note", () => {
    expect(
      hasConsultantDifferences([
        {
          field: "grade",
          label: "Grade",
          resident: "G1",
          consultant: "G2",
          matches: false,
        },
      ]),
    ).toBe(true);
  });
});

describe("Phase 5 report templates", () => {
  it("selects configured fields and interpolates default report text", () => {
    const content = applyReportTemplate(
      {
        specimen: "Colon",
        gross: "Segment of colon",
        microscopy: "Invasive glands",
        diagnosis: "Adenocarcinoma",
        grade: "G2",
        stage: "pT3 pN1",
        margins: "Clear",
        laterality: "Right",
        tumourSize: "3.2 cm",
      },
      {
        id: 4,
        schema: { fields: ["diagnosis", "stage", "margins"] },
        defaultText: "Summary: {{diagnosis}}, {stage}.",
      },
    );

    expect(content).toEqual({
      diagnosis: "Adenocarcinoma",
      stage: "pT3 pN1",
      margins: "Clear",
      additionalText: "Summary: Adenocarcinoma, pT3 pN1.",
    });
  });
});

describe("Phase 5 typist verification", () => {
  it("normalizes spacing and unit words", () => {
    expect(normalizeClinicalValue("3.2 centimetres")).toBe("3.2 cm");
  });

  it("detects transposed measurement digits", () => {
    expect(digitsLookSwapped("3.2 cm", "2.3 cm")).toBe(true);
  });

  it("blocks a typed report with a swapped measurement", () => {
    const diff = compareTypedReport(
      {
        laterality: "Right",
        diagnosis: "Adenocarcinoma",
        grade: "G2",
        tumourSize: "3.2 cm",
        stage: "pT3 pN1",
        margins: "Clear",
      },
      [
        "Laterality: Right",
        "Diagnosis: Adenocarcinoma",
        "Grade: G2",
        "Tumour size: 2.3 cm",
        "Stage: pT3 pN1",
        "Margins: Clear",
      ].join("\n"),
    );
    const size = diff.find((row) => row.field === "tumourSize");
    expect(size).toMatchObject({ matches: false, hint: "Digits look swapped" });
  });
});
