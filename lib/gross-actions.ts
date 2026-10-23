import { z } from "zod";
import { prisma } from "./db";
import { GROSS_TEMPLATES } from "@/src/lib/gross/templates";
import { transitionCase } from "./status";

export const saveGrossSchema = z.object({
  action: z.literal("save"),
  specimenType: z.string().trim().min(1),
  fields: z.record(z.string(), z.string().trim()),
  descriptionText: z.string().trim().min(1),
  transcript: z.string().optional(),
  notes: z.string().optional(),
  confirmed: z.literal(true),
});
export async function completeGross(
  caseId: number,
  input: z.infer<typeof saveGrossSchema>,
) {
  const managed = await prisma.template.findUnique({
    where: {
      kind_specimenType: { kind: "gross", specimenType: input.specimenType },
    },
    select: { id: true, schema: true },
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
    await transitionCase(
      {
        caseId,
        from: "gross_pending",
        to: "micro_pending",
        specimenType: input.specimenType,
        steps: [{ step: "gross", status: "done" }],
        event: {
          type: "gross_saved",
          payload: { specimenType: input.specimenType, confirmed: true },
        },
      },
      tx,
    );
    if (managed?.id)
      await tx.case.update({
        where: { id: caseId },
        data: { specimenTemplateId: managed.id },
      });
    return entry;
  });
}
