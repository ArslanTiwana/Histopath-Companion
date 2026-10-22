import { describe, expect, it } from "vitest";
import {
  compareDiagnoses,
  compareTypedReport,
  digitsLookSwapped,
  normalizeClinicalValue,
  parseDiagnosisText,
} from "@/lib/phase5-actions";

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
