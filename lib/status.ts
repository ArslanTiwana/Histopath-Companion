import type { CaseStatus, Prisma, StepName, StepStatus } from "@prisma/client";
import { prisma } from "./db";

type TransitionClient = Prisma.TransactionClient;

export type CaseTransition = {
  caseId: number;
  from: CaseStatus | CaseStatus[];
  to: CaseStatus;
  steps: { step: StepName; status: StepStatus; reason?: string | null }[];
  event: { type: string; payload?: Record<string, unknown> };
  statusPayload?: Record<string, unknown>;
  incomplete?: boolean;
  locked?: boolean;
  deliveredAt?: Date | null;
  specimenType?: string;
  allowLocked?: boolean;
};

const allowedTransitions = new Set([
  "gross_pending:micro_pending",
  "micro_pending:micro_done",
  "micro_done:with_consultant",
  "with_consultant:consultant_dx_added",
  "consultant_dx_added:report_draft",
  "report_draft:report_approved",
  "report_approved:with_typist",
  "with_typist:needs_confirmation",
  "with_typist:delivered",
  "needs_confirmation:delivered",
  "delivered:needs_confirmation",
]);

async function applyTransition(tx: TransitionClient, input: CaseTransition) {
  const current = await tx.case.findUnique({ where: { id: input.caseId } });
  if (!current) throw new Error("Case not found");
  const expected = Array.isArray(input.from) ? input.from : [input.from];
  if (!expected.includes(current.status))
    throw new Error(`Invalid transition from ${current.status} to ${input.to}`);
  if (
    current.status !== input.to &&
    !allowedTransitions.has(`${current.status}:${input.to}`)
  )
    throw new Error(`Invalid transition from ${current.status} to ${input.to}`);
  if (current.locked && !input.allowLocked)
    throw new Error("Delivered cases are locked");

  const completedAt = new Date();
  for (const step of input.steps) {
    await tx.caseStep.update({
      where: { caseId_step: { caseId: input.caseId, step: step.step } },
      data: {
        status: step.status,
        reason: step.reason ?? null,
        completedAt: step.status === "pending" ? null : completedAt,
      },
    });
  }

  const updated = await tx.case.update({
    where: { id: input.caseId },
    data: {
      status: input.to,
      incomplete: input.incomplete ?? current.incomplete,
      locked: input.locked ?? current.locked,
      ...(input.deliveredAt !== undefined
        ? { deliveredAt: input.deliveredAt }
        : {}),
      ...(input.specimenType !== undefined
        ? { specimenType: input.specimenType }
        : {}),
    },
  });

  const events: Prisma.EventCreateManyInput[] = [
    {
      caseId: input.caseId,
      type: input.event.type,
      payload: (input.event.payload || {}) as Prisma.InputJsonValue,
    },
  ];
  if (current.status !== input.to)
    events.push({
      caseId: input.caseId,
      type: "status_changed",
      payload: {
        from: current.status,
        to: input.to,
        ...(input.statusPayload || {}),
      } as Prisma.InputJsonValue,
    });
  await tx.event.createMany({ data: events });
  return updated;
}

/** The only service allowed to mutate Case.status or workflow CaseStep rows. */
export async function transitionCase(
  input: CaseTransition,
  client?: TransitionClient,
) {
  if (client) return applyTransition(client, input);
  return prisma.$transaction((tx) => applyTransition(tx, input));
}
