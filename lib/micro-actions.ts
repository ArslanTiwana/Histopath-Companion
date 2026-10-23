import { z } from "zod";
import { prisma } from "./db";
import { transitionCase } from "./status";

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
  sendToConsultant = false,
) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.case.findUnique({
      where: { id: caseId },
      include: { microEntry: true },
    });
    if (!current) throw new Error("Case not found");
    if (
      current.microEntry &&
      ["micro_done", "with_consultant"].includes(current.status)
    ) {
      if (sendToConsultant && current.status === "micro_done")
        await transitionCase(
          {
            caseId,
            from: "micro_done",
            to: "with_consultant",
            steps: [{ step: "consultant", status: "pending" }],
            event: {
              type: "sent_to_consultant",
              payload: { confirmed: true },
            },
          },
          tx,
        );
      return {
        entry: current.microEntry,
        status:
          sendToConsultant && current.status === "micro_done"
            ? "with_consultant"
            : current.status,
      };
    }
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
    if (input.ihc.length)
      await tx.case.update({
        where: { id: caseId },
        data: { waitingIhc: true },
      });
    await transitionCase(
      {
        caseId,
        from: "micro_pending",
        to: "micro_done",
        steps: [{ step: "micro", status: "done" }],
        event: {
          type: "micro_saved",
          payload: {
            confirmed: true,
            hasProvisionalDx: Boolean(input.provisionalDx),
          },
        },
      },
      tx,
    );
    if (sendToConsultant)
      await transitionCase(
        {
          caseId,
          from: "micro_done",
          to: "with_consultant",
          steps: [{ step: "consultant", status: "pending" }],
          event: {
            type: "sent_to_consultant",
            payload: { confirmed: true },
          },
        },
        tx,
      );
    return {
      entry,
      status: sendToConsultant ? "with_consultant" : "micro_done",
    };
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
    for (const item of ready)
      await transitionCase({
        caseId: item.id,
        from: "micro_done",
        to: "with_consultant",
        steps: [{ step: "consultant", status: "pending" }],
        event: {
          type: "sent_to_consultant",
          payload: { confirmed: true },
        },
      });
  }
  return {
    ready: ready.map((item) => item.caseLabel),
    notReady: notReady.map((item) => item.caseLabel),
  };
}
