import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  batch: { create: vi.fn() },
  case: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  caseStep: { update: vi.fn() },
  event: { create: vi.fn(), createMany: vi.fn() },
  grossEntry: { create: vi.fn() },
  report: { update: vi.fn() },
  template: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma }));

import { createBatch, createSingleCase } from "@/lib/case-actions";
import { completeGross } from "@/lib/gross-actions";
import { sendCasesToConsultant } from "@/lib/micro-actions";
import { approveReport, sendApprovedReports } from "@/lib/phase5-actions";

beforeEach(() => {
  vi.clearAllMocks();
  prisma.$transaction.mockImplementation(async (work: unknown) => {
    if (typeof work === "function")
      return (work as (tx: typeof prisma) => Promise<unknown>)(prisma);
    return Promise.all(work as Promise<unknown>[]);
  });
  prisma.case.update.mockResolvedValue({});
  prisma.caseStep.update.mockResolvedValue({});
  prisma.event.create.mockResolvedValue({});
  prisma.event.createMany.mockResolvedValue({ count: 0 });
});

describe("case intake characterization", () => {
  it("creates a single independent case with every workflow step", async () => {
    prisma.case.create.mockResolvedValue({ id: 11, caseLabel: "S-141" });

    await createSingleCase("S-141", "Appendix", "urgent");

    expect(prisma.case.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        caseLabel: "S-141",
        specimenType: "Appendix",
        priority: "urgent",
        steps: {
          create: [
            { step: "gross" },
            { step: "micro" },
            { step: "consultant" },
            { step: "report" },
            { step: "typist" },
            { step: "delivered" },
          ],
        },
      }),
    });
  });

  it("creates a batch label containing independent full cases", async () => {
    prisma.case.findMany.mockResolvedValue([]);
    prisma.batch.create.mockResolvedValue({
      id: 4,
      count: 3,
      rangeStart: "S-101",
      rangeEnd: "S-103",
      cases: [],
    });

    await createBatch("Friday batch", "S-101", "S-103");

    const call = prisma.batch.create.mock.calls[0][0];
    expect(call.data).toMatchObject({
      name: "Friday batch",
      rangeStart: "S-101",
      rangeEnd: "S-103",
      count: 3,
    });
    expect(call.data.cases.create).toHaveLength(3);
    expect(
      call.data.cases.create.map(
        (item: { caseLabel: string }) => item.caseLabel,
      ),
    ).toEqual(["S-101", "S-102", "S-103"]);
    expect(call.data.cases.create[0].steps.create).toHaveLength(6);
  });
});

describe("clinical workflow characterization", () => {
  it("saves gross, completes its step, advances to micro, and records events", async () => {
    prisma.template.findUnique.mockResolvedValue(null);
    prisma.case.findUnique.mockResolvedValue({
      id: 11,
      status: "gross_pending",
    });
    prisma.grossEntry.create.mockResolvedValue({ id: 20 });

    await completeGross(11, {
      action: "save",
      specimenType: "Other",
      fields: {
        received: "In formalin",
        dimensions: "2 cm",
        appearance: "Tan tissue",
        sections: "A1",
      },
      descriptionText: "Other specimen. Complete gross description.",
      transcript: "Complete gross description",
      notes: "",
      confirmed: true,
    });

    expect(prisma.caseStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { caseId_step: { caseId: 11, step: "gross" } },
        data: expect.objectContaining({ status: "done" }),
      }),
    );
    expect(prisma.case.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 11 },
        data: expect.objectContaining({
          specimenType: "Other",
          status: "micro_pending",
        }),
      }),
    );
    expect(prisma.event.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ type: "gross_saved" }),
        expect.objectContaining({
          type: "status_changed",
          payload: expect.objectContaining({ to: "micro_pending" }),
        }),
      ]),
    });
  });

  it("sends only micro-complete cases to the consultant", async () => {
    prisma.case.findMany.mockResolvedValue([
      { id: 1, caseLabel: "S-101", status: "micro_done" },
      { id: 2, caseLabel: "S-102", status: "micro_pending" },
    ]);
    prisma.case.findUnique.mockImplementation(async ({ where }) => ({
      id: where.id,
      status: where.id === 1 ? "micro_done" : "micro_pending",
      incomplete: false,
      locked: false,
    }));

    const result = await sendCasesToConsultant([1, 2]);

    expect(result).toEqual({ ready: ["S-101"], notReady: ["S-102"] });
    expect(prisma.case.update).toHaveBeenCalledTimes(1);
    expect(prisma.case.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({ status: "with_consultant" }),
      }),
    );
    expect(prisma.event.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ caseId: 1, type: "sent_to_consultant" }),
      ]),
    });
  });

  it("approves a draft report, completes its step, and advances status", async () => {
    prisma.case.findUnique.mockResolvedValue({
      id: 11,
      status: "report_draft",
      locked: false,
      incomplete: false,
      report: {
        content: { diagnosis: "Adenocarcinoma" },
        version: 2,
        readBackAt: new Date(),
        readBackVersion: 2,
      },
    });
    prisma.report.update.mockResolvedValue({ id: 30, status: "approved" });

    await approveReport(11, {
      content: { diagnosis: "Adenocarcinoma" },
      confirmed: true,
    });

    expect(prisma.report.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { caseId: 11 },
        data: expect.objectContaining({ status: "approved" }),
      }),
    );
    expect(prisma.caseStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { caseId_step: { caseId: 11, step: "report" } },
        data: expect.objectContaining({ status: "done" }),
      }),
    );
    expect(prisma.case.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 11 },
        data: expect.objectContaining({ status: "report_approved" }),
      }),
    );
  });

  it("bundles approved reports and advances each selected case to typist", async () => {
    prisma.case.findMany.mockResolvedValue([
      {
        id: 1,
        caseLabel: "S-101",
        status: "report_approved",
        report: { content: { diagnosis: "A" } },
      },
      {
        id: 2,
        caseLabel: "S-102",
        status: "report_approved",
        report: { content: { diagnosis: "B" } },
      },
    ]);
    prisma.case.findUnique.mockImplementation(async ({ where }) => ({
      id: where.id,
      status: "report_approved",
      locked: false,
      incomplete: false,
    }));

    const result = await sendApprovedReports([1, 2], "2026-10-23");

    expect(result.count).toBe(2);
    expect(result.filename).toMatch(/^Typist_\d{8}\.docx$/);
    expect(result.fileBase64.length).toBeGreaterThan(0);
    expect(prisma.case.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({ status: "with_typist" }),
      }),
    );
    expect(prisma.case.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 2 },
        data: expect.objectContaining({ status: "with_typist" }),
      }),
    );
  });
});
