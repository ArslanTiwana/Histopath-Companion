import { z } from "zod";
import { prisma } from "./db";

export const saveMicroSchema = z.object({
  dictation: z.string().trim().min(3),
  differential: z.array(z.string()).max(6).default([]),
  ihc: z.array(z.string()).max(8).default([]),
  provisionalDx: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  confirmed: z.literal(true),
});

export async function completeMicro(
  caseId: number,
  input: z.infer<typeof saveMicroSchema>,
) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.case.findUnique({ where: { id: caseId } });
    if (!current) throw new Error("Case not found");
    if (current.status !== "micro_pending")
      throw new Error("This case is not waiting for microscopy");
    const entry = await tx.microEntry.create({
      data: {
        caseId,
        dictation: input.dictation,
        differential: input.differential,
        ihc: input.ihc,
        provisionalDx: input.provisionalDx || null,
        notes: input.notes || null,
      },
    });
    await tx.caseStep.update({
      where: { caseId_step: { caseId, step: "micro" } },
      data: { status: "done", completedAt: new Date() },
    });
    await tx.case.update({
      where: { id: caseId },
      data: { status: "micro_done" },
    });
    await tx.event.createMany({
      data: [
        {
          caseId,
          type: "micro_saved",
          payload: {
            confirmed: true,
            hasProvisionalDx: Boolean(input.provisionalDx),
          },
        },
        {
          caseId,
          type: "status_changed",
          payload: { from: "micro_pending", to: "micro_done" },
        },
      ],
    });
    return entry;
  });
}

export async function sendCasesToConsultant(caseIds: number[]) {
  const uniqueIds = Array.from(new Set(caseIds));
  const cases = await prisma.case.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, caseLabel: true, status: true },
  });
  const ready = cases.filter((item) => item.status === "micro_done");
  const notReady = cases.filter((item) => item.status !== "micro_done");
  if (ready.length) {
    await prisma.$transaction(
      ready.flatMap((item) => [
        prisma.case.update({
          where: { id: item.id },
          data: { status: "with_consultant" },
        }),
        prisma.event.create({
          data: {
            caseId: item.id,
            type: "sent_to_consultant",
            payload: { confirmed: true },
          },
        }),
        prisma.event.create({
          data: {
            caseId: item.id,
            type: "status_changed",
            payload: { from: "micro_done", to: "with_consultant" },
          },
        }),
      ]),
    );
  }
  return {
    ready: ready.map((item) => item.caseLabel),
    notReady: notReady.map((item) => item.caseLabel),
  };
}
