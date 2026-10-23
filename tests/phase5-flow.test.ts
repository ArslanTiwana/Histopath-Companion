import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const state = {
    case: {
      id: 1,
      caseLabel: "S-501",
      specimenType: "Colon",
      status: "micro_pending",
      incomplete: false,
      locked: false,
      deliveredAt: null as Date | null,
    },
    grossEntry: { descriptionText: "Colon segment, 12 cm" },
    microEntry: null as Record<string, unknown> | null,
    consultantEntry: null as Record<string, unknown> | null,
    report: null as Record<string, unknown> | null,
    checks: [] as Record<string, unknown>[],
    events: [] as Record<string, unknown>[],
    steps: new Map<string, Record<string, unknown>>(),
  };

  const client = {
    case: {
      findUnique: vi.fn(async () => ({
        ...state.case,
        grossEntry: state.grossEntry,
        microEntry: state.microEntry,
        consultantEntry: state.consultantEntry,
        report: state.report,
        typistChecks: state.checks.slice(-1).reverse(),
      })),
      findMany: vi.fn(async () =>
        state.case.status === "report_approved"
          ? [{ ...state.case, report: state.report }]
          : [],
      ),
      update: vi.fn(async (input: unknown) => {
        const { data } = input as { data: Record<string, unknown> };
        Object.assign(state.case, data);
        return { ...state.case };
      }),
    },
    caseStep: {
      update: vi.fn(async (input: unknown) => {
        const value = input as {
          where: { caseId_step: { step: string } };
          data: Record<string, unknown>;
        };
        state.steps.set(value.where.caseId_step.step, value.data);
        return value.data;
      }),
    },
    event: {
      create: vi.fn(async (input: unknown) => {
        const { data } = input as { data: Record<string, unknown> };
        state.events.push(data);
        return data;
      }),
      createMany: vi.fn(async (input: unknown) => {
        const { data } = input as { data: Record<string, unknown>[] };
        state.events.push(...data);
        return { count: data.length };
      }),
    },
    microEntry: {
      create: vi.fn(async (input: unknown) => {
        const { data } = input as { data: Record<string, unknown> };
        state.microEntry = { id: 1, ...data };
        return state.microEntry;
      }),
    },
    consultantEntry: {
      create: vi.fn(async (input: unknown) => {
        const { data } = input as { data: Record<string, unknown> };
        state.consultantEntry = { id: 1, ...data };
        return state.consultantEntry;
      }),
    },
    template: {
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => null),
    },
    report: {
      create: vi.fn(async (input: unknown) => {
        const { data } = input as { data: Record<string, unknown> };
        state.report = {
          id: 1,
          status: "draft",
          version: 1,
          readBackAt: null,
          readBackVersion: null,
          ...data,
        };
        return state.report;
      }),
      update: vi.fn(async (input: unknown) => {
        const { data } = input as { data: Record<string, unknown> };
        state.report = { ...state.report, ...data };
        return state.report;
      }),
    },
    typistCheck: {
      create: vi.fn(async (input: unknown) => {
        const { data } = input as { data: Record<string, unknown> };
        const check = {
          id: state.checks.length + 1,
          checkedAt: new Date(),
          ...data,
        };
        state.checks.push(check);
        return check;
      }),
      update: vi.fn(async (input: unknown) => {
        const value = input as {
          where: { id: number };
          data: Record<string, unknown>;
        };
        const index = state.checks.findIndex(
          (check) => check.id === value.where.id,
        );
        state.checks[index] = { ...state.checks[index], ...value.data };
        return state.checks[index];
      }),
    },
    $transaction: vi.fn(),
  };
  client.$transaction.mockImplementation(async (work: unknown) =>
    (work as (tx: typeof client) => Promise<unknown>)(client),
  );
  return { client, state };
});

vi.mock("@/lib/db", () => ({ prisma: db.client }));

import { completeMicro } from "@/lib/micro-actions";
import {
  approveReport,
  checkTypedReport,
  deliverCase,
  generateReport,
  markReportReadBack,
  saveConsultantEntry,
  sendApprovedReports,
  sendBackToTypist,
} from "@/lib/phase5-actions";

beforeEach(() => {
  db.state.case.status = "micro_pending";
  db.state.case.incomplete = false;
  db.state.case.locked = false;
  db.state.case.deliveredAt = null;
  db.state.microEntry = null;
  db.state.consultantEntry = null;
  db.state.report = null;
  db.state.checks.length = 0;
  db.state.events.length = 0;
  db.state.steps.clear();
  vi.clearAllMocks();
  db.client.$transaction.mockImplementation(async (work: unknown) =>
    (work as (tx: typeof db.client) => Promise<unknown>)(db.client),
  );
});

describe("Phase 5 completion flow", () => {
  it("moves micro to Delivered only after catching and correcting a typist error", async () => {
    await completeMicro(
      1,
      {
        dictation: "Invasive malignant glands",
        differential: [],
        ihc: [],
        provisionalDx: "Adenocarcinoma G2 pT2 pN0 margins clear",
        notes: "",
        confirmed: true,
      },
      true,
    );
    expect(db.state.case.status).toBe("with_consultant");

    await saveConsultantEntry(1, {
      consultantDx: {
        diagnosis: "Adenocarcinoma",
        grade: "G2",
        pT: "pT3",
        pN: "pN1",
        margins: "Clear",
        laterality: "Right",
        tumourSize: "3.2 cm",
      },
      learnedNote: "Recheck depth and nodes",
      confirmed: true,
    });
    expect(db.state.case.status).toBe("consultant_dx_added");

    await generateReport(1);
    const reportContent = (db.state.report?.content || {}) as Record<
      string,
      string
    >;
    await markReportReadBack(1, reportContent);
    await approveReport(1, { content: reportContent, confirmed: true });
    expect(db.state.case.status).toBe("report_approved");

    await sendApprovedReports([1], "2026-10-23");
    expect(db.state.case.status).toBe("with_typist");

    const wrong = await checkTypedReport(1, {
      typedText: [
        "Laterality: Right",
        "Diagnosis: Adenocarcinoma",
        "Grade: G2",
        "Tumour size: 2.3 cm",
        "Stage: pT3 pN1",
        "Margins: Clear",
      ].join("\n"),
      confirmed: true,
    });
    expect(wrong.differenceCount).toBe(1);
    expect(wrong.diff).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "tumourSize",
          matches: false,
          hint: "Digits look swapped",
        }),
      ]),
    );
    expect(db.state.case.status).toBe("with_typist");
    await expect(deliverCase(1)).rejects.toThrow("provide an override reason");

    await sendBackToTypist(1, ["Tumour size"]);
    expect(db.state.checks[0]).toMatchObject({
      result: "returned",
      corrections: ["Tumour size"],
    });

    const corrected = await checkTypedReport(1, {
      typedText: [
        "Laterality: Right",
        "Diagnosis: Adenocarcinoma",
        "Grade: G2",
        "Tumour size: 3.2 cm",
        "Stage: pT3 pN1",
        "Margins: Clear",
      ].join("\n"),
      confirmed: true,
    });
    expect(corrected.differenceCount).toBe(0);
    expect(db.state.case.status).toBe("needs_confirmation");

    await deliverCase(1);
    expect(db.state.case).toMatchObject({ status: "delivered", locked: true });
    expect(db.state.case.deliveredAt).toBeInstanceOf(Date);
    expect(db.state.steps.get("delivered")).toMatchObject({ status: "done" });
  });
});
