import { z } from "zod";
import { Document, HeadingLevel, Packer, Paragraph } from "docx";
import { prisma } from "./db";
import { changeCaseStatus } from "./status";

export const diagnosisFieldsSchema = z.object({
  diagnosis: z.string().trim().min(2),
  grade: z.string().trim().max(80).default(""),
  pT: z.string().trim().max(40).default(""),
  pN: z.string().trim().max(40).default(""),
  margins: z.string().trim().max(120).default(""),
  laterality: z.string().trim().max(80).default(""),
  tumourSize: z.string().trim().max(80).default(""),
});

export const saveConsultantSchema = z.object({
  consultantDx: diagnosisFieldsSchema,
  learnedNote: z.string().trim().max(4000).optional(),
  confirmed: z.literal(true),
});

export const approveReportSchema = z.object({
  content: z.record(z.string(), z.string()),
  confirmed: z.literal(true),
});

export const typistCheckSchema = z.object({
  typedText: z.string().trim().min(10),
  confirmed: z.literal(true),
});

export type DiagnosisFields = z.infer<typeof diagnosisFieldsSchema>;
export type ComparisonRow = {
  field: keyof DiagnosisFields;
  label: string;
  resident: string;
  consultant: string;
  matches: boolean;
  hint?: string;
};

const fieldLabels: Record<keyof DiagnosisFields, string> = {
  diagnosis: "Diagnosis",
  grade: "Grade",
  pT: "pT",
  pN: "pN",
  margins: "Margins",
  laterality: "Laterality",
  tumourSize: "Tumour size",
};

export function normalizeClinicalValue(value: string) {
  return value
    .toLowerCase()
    .replace(/millimet(?:er|re)s?/g, "mm")
    .replace(/centimet(?:er|re)s?/g, "cm")
    .replace(/\s+/g, " ")
    .replace(/\s*([:;,])\s*/g, "$1")
    .trim();
}

export function digitsLookSwapped(left: string, right: string) {
  const a = left.match(/\d+(?:\.\d+)?/)?.[0];
  const b = right.match(/\d+(?:\.\d+)?/)?.[0];
  if (!a || !b || a === b) return false;
  return (
    a.replace(".", "").split("").sort().join("") ===
    b.replace(".", "").split("").sort().join("")
  );
}

export function parseDiagnosisText(text: string): DiagnosisFields {
  const find = (pattern: RegExp) => text.match(pattern)?.[1]?.trim() || "";
  return {
    diagnosis: text.trim() || "Not recorded",
    grade: find(/\b(G(?:rade)?\s*[1-4])\b/i),
    pT: find(/\b(pT\s*[0-4][a-d]?)\b/i),
    pN: find(/\b(pN\s*[0-3][a-c]?)\b/i),
    margins: find(
      /\bmargins?\s*[:=-]?\s*(clear|negative|positive|involved)\b/i,
    ),
    laterality: find(/\b(left|right|bilateral)\b/i),
    tumourSize: find(/\b(\d+(?:\.\d+)?\s*(?:mm|cm))\b/i),
  };
}

export function compareDiagnoses(
  resident: DiagnosisFields,
  consultant: DiagnosisFields,
): ComparisonRow[] {
  return (Object.keys(fieldLabels) as (keyof DiagnosisFields)[]).map(
    (field) => {
      const residentValue = resident[field];
      const consultantValue = consultant[field];
      const matches =
        Boolean(residentValue) &&
        normalizeClinicalValue(residentValue) ===
          normalizeClinicalValue(consultantValue);
      return {
        field,
        label: fieldLabels[field],
        resident: residentValue || "Not recorded",
        consultant: consultantValue || "Not recorded",
        matches,
        ...(digitsLookSwapped(residentValue, consultantValue)
          ? { hint: "Digits look swapped" }
          : {}),
      };
    },
  );
}

export async function saveConsultantEntry(
  caseId: number,
  input: z.infer<typeof saveConsultantSchema>,
) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.case.findUnique({
      where: { id: caseId },
      include: { microEntry: true },
    });
    if (!item) throw new Error("Case not found");
    if (item.status !== "with_consultant")
      throw new Error("This case is not awaiting consultant review");
    const resident = parseDiagnosisText(item.microEntry?.provisionalDx || "");
    const comparison = compareDiagnoses(resident, input.consultantDx);
    const differences = comparison.filter((row) => !row.matches);
    const entry = await tx.consultantEntry.create({
      data: {
        caseId,
        consultantDx: input.consultantDx,
        comparison,
        learnedNote: differences.length ? input.learnedNote || null : null,
      },
    });
    await tx.caseStep.update({
      where: { caseId_step: { caseId, step: "consultant" } },
      data: { status: "done", completedAt: new Date() },
    });
    await tx.event.create({
      data: {
        caseId,
        type: "consultant_diagnosis_saved",
        payload: { confirmed: true, differenceCount: differences.length },
      },
    });
    await changeCaseStatus(
      caseId,
      "consultant_dx_added",
      { differenceCount: differences.length },
      tx,
    );
    return { entry, comparison, differenceCount: differences.length };
  });
}

export type ReportContent = {
  specimen: string;
  gross: string;
  microscopy: string;
  diagnosis: string;
  grade: string;
  stage: string;
  margins: string;
  laterality: string;
  tumourSize: string;
};

export async function generateReport(caseId: number) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.case.findUnique({
      where: { id: caseId },
      include: { grossEntry: true, microEntry: true, consultantEntry: true },
    });
    if (!item) throw new Error("Case not found");
    if (item.status !== "consultant_dx_added")
      throw new Error("Save the consultant diagnosis first");
    const dx = diagnosisFieldsSchema.parse(item.consultantEntry?.consultantDx);
    const content: ReportContent = {
      specimen: item.specimenType || "Not recorded",
      gross: item.grossEntry?.descriptionText || "Not recorded",
      microscopy: item.microEntry?.dictation || "Not recorded",
      diagnosis: dx.diagnosis,
      grade: dx.grade || "Not recorded",
      stage: [dx.pT, dx.pN].filter(Boolean).join(" ") || "Not recorded",
      margins: dx.margins || "Not recorded",
      laterality: dx.laterality || "Not recorded",
      tumourSize: dx.tumourSize || "Not recorded",
    };
    const report = await tx.report.create({ data: { caseId, content } });
    await tx.event.create({
      data: { caseId, type: "report_generated", payload: { version: 1 } },
    });
    await changeCaseStatus(caseId, "report_draft", {}, tx);
    return report;
  });
}

export async function approveReport(
  caseId: number,
  input: z.infer<typeof approveReportSchema>,
) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.case.findUnique({ where: { id: caseId } });
    if (!item || item.status !== "report_draft")
      throw new Error("This report is not ready for approval");
    const report = await tx.report.update({
      where: { caseId },
      data: {
        content: input.content,
        status: "approved",
        approvedAt: new Date(),
      },
    });
    await tx.caseStep.update({
      where: { caseId_step: { caseId, step: "report" } },
      data: { status: "done", completedAt: new Date() },
    });
    await tx.event.create({
      data: { caseId, type: "report_approved", payload: { confirmed: true } },
    });
    await changeCaseStatus(caseId, "report_approved", {}, tx);
    return report;
  });
}

export function parseTypedReport(text: string) {
  const result: Record<string, string> = {};
  const aliases: Record<string, keyof ReportContent> = {
    specimen: "specimen",
    gross: "gross",
    microscopy: "microscopy",
    diagnosis: "diagnosis",
    grade: "grade",
    stage: "stage",
    margins: "margins",
    laterality: "laterality",
    "tumour size": "tumourSize",
    "tumor size": "tumourSize",
  };
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([^:]+):\s*(.+)\s*$/);
    if (!match) continue;
    const key = aliases[match[1].trim().toLowerCase()];
    if (key) result[key] = match[2].trim();
  }
  return result;
}

export function compareTypedReport(
  approved: Record<string, string>,
  typedText: string,
) {
  const typed = parseTypedReport(typedText);
  const fields = [
    "laterality",
    "diagnosis",
    "grade",
    "tumourSize",
    "stage",
    "margins",
  ];
  return fields.map((field) => {
    const expected = approved[field] || "Not recorded";
    const actual = typed[field] || "Missing";
    const matches =
      normalizeClinicalValue(expected) === normalizeClinicalValue(actual);
    return {
      field,
      label:
        field === "stage"
          ? "Stage"
          : fieldLabels[field as keyof DiagnosisFields],
      approved: expected,
      typed: actual,
      matches,
      ...(digitsLookSwapped(expected, actual)
        ? { hint: "Digits look swapped" }
        : {}),
    };
  });
}

export async function sendApprovedReports(caseIds?: number[]) {
  const cases = await prisma.case.findMany({
    where: {
      status: "report_approved",
      ...(caseIds?.length ? { id: { in: caseIds } } : {}),
    },
    include: { report: true },
    orderBy: { caseLabel: "asc" },
  });
  if (!cases.length) throw new Error("No approved reports are ready");
  await prisma.$transaction(async (tx) => {
    for (const item of cases) {
      await changeCaseStatus(item.id, "with_typist", {}, tx);
      await tx.event.create({
        data: {
          caseId: item.id,
          type: "sent_to_typist",
          payload: { confirmed: true },
        },
      });
    }
  });
  const children = cases.flatMap((item, index) => {
    const report = item.report?.content as Record<string, string>;
    return [
      new Paragraph({
        text: `Case ${item.caseLabel}`,
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: index > 0,
      }),
      ...Object.entries(report).map(
        ([key, value]) =>
          new Paragraph({ text: `${key}: ${value}`, spacing: { after: 120 } }),
      ),
    ];
  });
  const file = await Packer.toBuffer(
    new Document({ sections: [{ properties: {}, children }] }),
  );
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return {
    count: cases.length,
    filename: `Typist_${date}.docx`,
    fileBase64: file.toString("base64"),
  };
}

export async function checkTypedReport(
  caseId: number,
  input: z.infer<typeof typistCheckSchema>,
) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.case.findUnique({
      where: { id: caseId },
      include: { report: true },
    });
    if (!item || item.status !== "with_typist" || !item.report)
      throw new Error("This case is not awaiting a typist check");
    const diff = compareTypedReport(
      item.report.content as Record<string, string>,
      input.typedText,
    );
    const differences = diff.filter((row) => !row.matches);
    const check = await tx.typistCheck.create({
      data: {
        caseId,
        typedText: input.typedText,
        diff,
        result: differences.length ? "differences" : "match",
      },
    });
    await tx.event.create({
      data: {
        caseId,
        type: differences.length
          ? "typist_differences_found"
          : "typist_check_matched",
        payload: { differenceCount: differences.length },
      },
    });
    if (!differences.length)
      await changeCaseStatus(caseId, "needs_confirmation", {}, tx);
    return { check, diff, differenceCount: differences.length };
  });
}

export async function deliverCase(caseId: number, overrideReason?: string) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.case.findUnique({
      where: { id: caseId },
      include: { typistChecks: { orderBy: { checkedAt: "desc" }, take: 1 } },
    });
    if (!item) throw new Error("Case not found");
    const last = item.typistChecks[0];
    const canDeliver =
      item.status === "needs_confirmation" && last?.result === "match";
    if (!canDeliver && !overrideReason?.trim())
      throw new Error("Resolve every difference or provide an override reason");
    if (!last) throw new Error("Run the typist comparison before delivery");
    if (!canDeliver && item.status !== "with_typist")
      throw new Error("This case is not awaiting typist verification");
    if (!canDeliver) {
      await tx.typistCheck.update({
        where: { id: last.id },
        data: { result: "override", overrideReason: overrideReason!.trim() },
      });
      await changeCaseStatus(
        caseId,
        "needs_confirmation",
        { overrideReason: overrideReason!.trim() },
        tx,
      );
    }
    await tx.caseStep.update({
      where: { caseId_step: { caseId, step: "typist" } },
      data: { status: "done", completedAt: new Date() },
    });
    await tx.caseStep.update({
      where: { caseId_step: { caseId, step: "delivered" } },
      data: { status: "done", completedAt: new Date() },
    });
    await tx.event.create({
      data: {
        caseId,
        type: "typist_confirmed",
        payload: { confirmed: true, overridden: !canDeliver },
      },
    });
    return changeCaseStatus(caseId, "delivered", { confirmed: true }, tx);
  });
}
