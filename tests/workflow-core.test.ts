import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  case: { findUnique: vi.fn(), update: vi.fn() },
  caseStep: { update: vi.fn() },
  event: { create: vi.fn(), createMany: vi.fn() },
  microEntry: { create: vi.fn() },
  report: { findUnique: vi.fn(), update: vi.fn() },
  typistCheck: { create: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma }));

import { bypassStep } from "@/lib/bypass-actions";
import { completeMicro } from "@/lib/micro-actions";
import {
  approveReport,
  checkTypedReport,
  deliverCase,
  markReportReadBack,
  sendBackToTypist,
  unlockCase,
} from "@/lib/phase5-actions";
import { transitionCase } from "@/lib/status";
import { nextGrossCase, readyConsultantCaseIds } from "@/lib/worklist";
import { previousGrossForSpecimen } from "@/lib/gross-selection";

beforeEach(() => {
  vi.clearAllMocks();
  prisma.$transaction.mockImplementation(async (work) => work(prisma));
  prisma.case.update.mockResolvedValue({ id: 1 });
  prisma.caseStep.update.mockResolvedValue({});
  prisma.event.create.mockResolvedValue({});
  prisma.event.createMany.mockResolvedValue({ count: 2 });
  prisma.microEntry.create.mockResolvedValue({ id: 9, caseId: 1 });
  prisma.report.update.mockResolvedValue({ id: 4, version: 2 });
  prisma.typistCheck.update.mockResolvedValue({ id: 8 });
});

describe("transactional workflow core", () => {
  it("updates step, flags, case and events through one transition transaction", async () => {
    prisma.case.findUnique.mockResolvedValue({
      id: 1,
      status: "gross_pending",
      incomplete: false,
      locked: false,
    });

    await transitionCase({
      caseId: 1,
      from: "gross_pending",
      to: "micro_pending",
      steps: [{ step: "gross", status: "done" }],
      event: { type: "gross_saved" },
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.caseStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { caseId_step: { caseId: 1, step: "gross" } },
        data: expect.objectContaining({ status: "done" }),
      }),
    );
    expect(prisma.case.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({
        status: "micro_pending",
        incomplete: false,
        locked: false,
      }),
    });
    const events = prisma.event.createMany.mock.calls[0][0].data;
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "gross_saved" }),
        expect.objectContaining({
          type: "status_changed",
          payload: expect.objectContaining({
            from: "gross_pending",
            to: "micro_pending",
          }),
        }),
      ]),
    );
    expect(JSON.stringify(events)).not.toContain("gross_done");
  });

  it("bypasses an allowed step with a required reason and incomplete audit", async () => {
    prisma.case.findUnique.mockResolvedValue({
      id: 1,
      status: "micro_pending",
      incomplete: false,
      locked: false,
    });

    await bypassStep(1, "micro", "skip", "No tissue remains");

    expect(prisma.caseStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "skipped",
          reason: "No tissue remains",
        }),
      }),
    );
    expect(prisma.case.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "micro_done",
          incomplete: true,
        }),
      }),
    );
    await expect(bypassStep(1, "gross", "skip", "")).rejects.toThrow();
    prisma.case.findUnique.mockResolvedValue({
      id: 1,
      status: "gross_pending",
      incomplete: false,
      locked: false,
    });
    await expect(
      bypassStep(1, "micro", "force", "No tissue remains"),
    ).rejects.toThrow("Invalid transition");
  });

  it("saves micro and sends to consultant atomically, then treats retry as success", async () => {
    prisma.case.findUnique
      .mockResolvedValueOnce({
        id: 1,
        status: "micro_pending",
        incomplete: false,
        locked: false,
        microEntry: null,
      })
      .mockResolvedValueOnce({
        id: 1,
        status: "micro_pending",
        incomplete: false,
        locked: false,
      })
      .mockResolvedValueOnce({
        id: 1,
        status: "micro_done",
        incomplete: false,
        locked: false,
      });
    const input = {
      dictation: "Benign mucosa with inflammation",
      differential: [],
      ihc: [],
      provisionalDx: "Inflammation",
      notes: "",
      confirmed: true as const,
    };

    await completeMicro(1, input, true);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.case.update).toHaveBeenCalledTimes(2);
    expect(prisma.case.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "with_consultant" }),
      }),
    );

    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (work) => work(prisma));
    prisma.case.findUnique.mockResolvedValue({
      id: 1,
      status: "with_consultant",
      microEntry: { id: 9 },
    });
    await expect(completeMicro(1, input, true)).resolves.toEqual({
      entry: { id: 9 },
      status: "with_consultant",
    });
    expect(prisma.microEntry.create).not.toHaveBeenCalled();
    expect(prisma.case.update).not.toHaveBeenCalled();
  });
});

describe("report, typist and lock safety", () => {
  it("versions report edits at read-back and rejects approval without that version", async () => {
    prisma.case.findUnique.mockResolvedValueOnce({
      id: 1,
      status: "report_draft",
      report: { content: { diagnosis: "Old" }, version: 1 },
    });
    await markReportReadBack(1, { diagnosis: "Revised" });
    expect(prisma.report.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ version: 2, readBackVersion: 2 }),
      }),
    );

    prisma.case.findUnique.mockResolvedValueOnce({
      id: 1,
      status: "report_draft",
      report: {
        content: { diagnosis: "Revised" },
        version: 2,
        readBackAt: new Date(),
        readBackVersion: 1,
      },
    });
    await expect(
      approveReport(1, {
        content: { diagnosis: "Revised" },
        confirmed: true,
      }),
    ).rejects.toThrow("Read back the current report version");
  });

  it("marks the latest typist check returned with its corrections", async () => {
    prisma.case.findUnique.mockResolvedValue({
      id: 1,
      status: "with_typist",
      typistChecks: [{ id: 8, result: "differences" }],
    });
    await sendBackToTypist(1, ["Laterality", "Stage"]);
    expect(prisma.typistCheck.update).toHaveBeenCalledWith({
      where: { id: 8 },
      data: expect.objectContaining({
        result: "returned",
        corrections: ["Laterality", "Stage"],
      }),
    });
  });

  it("creates a fresh check when corrected typist text is resubmitted", async () => {
    prisma.case.findUnique.mockResolvedValue({
      id: 1,
      status: "with_typist",
      report: {
        content: {
          diagnosis: "Adenocarcinoma",
          grade: "G2",
          stage: "pT2",
          margins: "Clear",
          laterality: "Right",
          tumourSize: "2 cm",
        },
      },
    });
    prisma.typistCheck.create.mockResolvedValue({ id: 10 });

    await checkTypedReport(1, {
      typedText: "Diagnosis: Corrected wording",
      confirmed: true,
    });

    expect(prisma.typistCheck.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ caseId: 1, result: "differences" }),
      }),
    );
  });

  it("requires a latest match for delivery unless an override reason is given", async () => {
    prisma.case.findUnique.mockResolvedValue({
      id: 1,
      status: "with_typist",
      incomplete: false,
      locked: false,
      typistChecks: [{ id: 8, result: "returned" }],
    });
    await expect(deliverCase(1)).rejects.toThrow("provide an override reason");
    await deliverCase(1, "Senior authorised delivery");
    expect(prisma.typistCheck.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ result: "override" }),
      }),
    );
    expect(prisma.case.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "delivered", locked: true }),
      }),
    );
  });

  it("unlocks a delivered case only with a reason and logs the transition", async () => {
    prisma.case.findUnique.mockResolvedValue({
      id: 1,
      status: "delivered",
      incomplete: false,
      locked: true,
    });
    await expect(unlockCase(1, "")).rejects.toThrow();
    await unlockCase(1, "Correction requested");
    expect(prisma.case.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "needs_confirmation",
          locked: false,
          incomplete: true,
        }),
      }),
    );
    expect(prisma.event.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ type: "case_unlocked" }),
      ]),
    });
  });
});

describe("worklist batch parity", () => {
  const cases = [
    { id: 1, status: "gross_pending", batch: 1 },
    { id: 2, status: "gross_pending", batch: 2 },
    { id: 3, status: "micro_done", batch: 1 },
    { id: 4, status: "with_consultant", batch: 1 },
  ];

  it("chooses next gross only from the visible active batch", () => {
    expect(nextGrossCase(cases.filter((item) => item.batch === 2))?.id).toBe(2);
  });

  it("preselects only consultant-ready cases", () => {
    expect(readyConsultantCaseIds(cases)).toEqual([3]);
  });

  it("copies gross fields only from the same specimen and exposes its source", () => {
    const previous = previousGrossForSpecimen(
      [
        {
          fields: { size: "3 cm" },
          case: { caseLabel: "S-100", specimenType: "Colon" },
        },
        {
          fields: { size: "1 cm" },
          case: { caseLabel: "S-099", specimenType: "Appendix" },
        },
      ],
      "Appendix",
    );
    expect(previous).toEqual(
      expect.objectContaining({
        case: expect.objectContaining({ caseLabel: "S-099" }),
      }),
    );
  });
});
