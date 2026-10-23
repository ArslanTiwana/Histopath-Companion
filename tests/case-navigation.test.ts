import { describe, expect, it } from "vitest";
import type { CaseStatus } from "@prisma/client";
import { caseMatchesFilter } from "@/lib/case-filters";
import { caseNextAction } from "@/lib/case-navigation";

describe("Cases list filters", () => {
  it("defaults started semantics to active cases only", () => {
    expect(caseMatchesFilter("micro_pending", "started")).toBe(true);
    expect(caseMatchesFilter("gross_pending", "started")).toBe(false);
    expect(caseMatchesFilter("delivered", "started")).toBe(false);
  });

  it("separates not-started and completed cases", () => {
    expect(caseMatchesFilter("gross_pending", "not_started")).toBe(true);
    expect(caseMatchesFilter("delivered", "completed")).toBe(true);
  });
});

describe("Case detail next actions", () => {
  it("provides an action for every persisted workflow status", () => {
    const statuses: CaseStatus[] = [
      "gross_pending",
      "micro_pending",
      "micro_done",
      "with_consultant",
      "consultant_dx_added",
      "report_draft",
      "report_approved",
      "with_typist",
      "needs_confirmation",
      "delivered",
    ];

    expect(statuses.map((status) => caseNextAction(status, 9))).toEqual([
      expect.objectContaining({ href: "/cases/9/gross" }),
      expect.objectContaining({ href: "/cases/9/micro" }),
      expect.objectContaining({ kind: "send_to_consultant" }),
      expect.objectContaining({ href: "/cases/9/consultant" }),
      expect.objectContaining({ href: "/cases/9/report" }),
      expect.objectContaining({ href: "/cases/9/report" }),
      expect.objectContaining({ href: "/typist?caseId=9" }),
      expect.objectContaining({ href: "/cases/9/typist" }),
      expect.objectContaining({ href: "/cases/9/typist" }),
      expect.objectContaining({ href: "/cases/9/delivered" }),
    ]);
  });
});
