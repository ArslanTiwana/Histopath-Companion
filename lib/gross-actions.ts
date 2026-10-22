import { z } from "zod";
import { prisma } from "./db";
import { GROSS_TEMPLATES } from "@/src/lib/gross/templates";

export const saveGrossSchema = z.object({
  action: z.literal("save"),
  specimenType: z.string().trim().min(1),
  fields: z.record(z.string(), z.string().trim()),
  descriptionText: z.string().trim().min(1),
  transcript: z.string().optional(),
  notes: z.string().optional(),
  confirmed: z.literal(true),
});
export const bypassGrossSchema = z.object({
  action: z.enum(["skip", "force"]),
  reason: z.string().trim().min(3, "A reason is required"),
  confirmed: z.literal(true),
});
export const grossActionSchema = z.discriminatedUnion("action", [
  saveGrossSchema,
  bypassGrossSchema,
]);

export async function completeGross(
  caseId: number,
  input: z.infer<typeof saveGrossSchema>,
) {
  const managed = await prisma.template.findUnique({
    where: {
      kind_specimenType: { kind: "gross", specimenType: input.specimenType },
    },
    select: { schema: true },
  });
  const parsedManaged = z
    .object({
      fields: z.array(
        z.object({
          key: z.string(),
          label: z.string(),
          question: z.string(),
          placeholder: z.string(),
        }),
      ),
    })
    .safeParse(managed?.schema);
  const template = parsedManaged.success
    ? parsedManaged.data
    : GROSS_TEMPLATES[input.specimenType] || GROSS_TEMPLATES.Other;
  const missing = template.fields.filter(
    (field) => !input.fields[field.key]?.trim(),
  );
  if (missing.length)
    throw new Error(
      `Complete or force the missing fields: ${missing.map((field) => field.label).join(", ")}`,
    );
  return prisma.$transaction(async (tx) => {
    const current = await tx.case.findUnique({ where: { id: caseId } });
    if (!current) throw new Error("Case not found");
    if (current.status !== "gross_pending")
      throw new Error("This case is not waiting for grossing");
    const entry = await tx.grossEntry.create({
      data: {
        caseId,
        fields: input.fields,
        transcript: input.transcript || null,
        descriptionText: input.descriptionText,
        notes: input.notes || null,
      },
    });
    await tx.caseStep.update({
      where: { caseId_step: { caseId, step: "gross" } },
      data: { status: "done", completedAt: new Date() },
    });
    await tx.case.update({
      where: { id: caseId },
      data: { specimenType: input.specimenType, status: "micro_pending" },
    });
    await tx.event.createMany({
      data: [
        {
          caseId,
          type: "gross_saved",
          payload: { specimenType: input.specimenType, confirmed: true },
        },
        {
          caseId,
          type: "status_changed",
          payload: { from: "gross_pending", to: "gross_done" },
        },
        {
          caseId,
          type: "status_changed",
          payload: { from: "gross_done", to: "micro_pending" },
        },
      ],
    });
    return entry;
  });
}

export async function bypassGross(
  caseId: number,
  input: z.infer<typeof bypassGrossSchema>,
) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.case.findUnique({ where: { id: caseId } });
    if (!current) throw new Error("Case not found");
    if (current.status !== "gross_pending")
      throw new Error("This case is not waiting for grossing");
    const stepStatus = input.action === "skip" ? "skipped" : "forced";
    await tx.caseStep.update({
      where: { caseId_step: { caseId, step: "gross" } },
      data: {
        status: stepStatus,
        reason: input.reason,
        completedAt: new Date(),
      },
    });
    await tx.case.update({
      where: { id: caseId },
      data: { incomplete: true, status: "micro_pending" },
    });
    await tx.event.createMany({
      data: [
        {
          caseId,
          type: `gross_${stepStatus}`,
          payload: { reason: input.reason, confirmed: true },
        },
        {
          caseId,
          type: "status_changed",
          payload: {
            from: "gross_pending",
            to: "gross_done",
            incomplete: true,
          },
        },
        {
          caseId,
          type: "status_changed",
          payload: {
            from: "gross_done",
            to: "micro_pending",
            incomplete: true,
          },
        },
      ],
    });
    return { status: "micro_pending", incomplete: true };
  });
}
