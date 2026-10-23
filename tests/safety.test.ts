import { describe, expect, it } from "vitest";
import { compactLocalDate, localDateKey } from "@/lib/local-date";
import {
  assertNoPatientIdentifiers,
  containsPatientIdentifierInValue,
} from "@/src/lib/privacy";

describe("patient identifier safety boundary", () => {
  it("screens nested free-text structures", () => {
    expect(
      containsPatientIdentifierInValue({
        fields: { gross: "Patient name is Jane Doe" },
      }),
    ).toBe(true);
    expect(() => assertNoPatientIdentifiers({ note: "MRN 12345678" })).toThrow(
      /patient-identifying/i,
    );
  });

  it("allows non-identifying clinical findings", () => {
    expect(() =>
      assertNoPatientIdentifiers({
        microscopy: "Transmural neutrophilic infiltrate",
      }),
    ).not.toThrow();
  });
});

describe("user-local date formatting", () => {
  it("uses calendar fields instead of UTC conversion", () => {
    const local = new Date(2026, 9, 23, 0, 15);
    expect(localDateKey(local)).toBe("2026-10-23");
    expect(compactLocalDate(local)).toBe("20261023");
  });
});
