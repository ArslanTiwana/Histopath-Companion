import { prisma } from "./db";
import type { CaseStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
const order: CaseStatus[] = [
  "gross_pending",
  "gross_done",
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
export async function changeCaseStatus(
  caseId: number,
  next: CaseStatus,
  payload: Record<string, unknown> = {},
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const current = await client.case.findUnique({ where: { id: caseId } });
  if (!current) throw new Error("Case not found");
  if (current.locked) throw new Error("Delivered cases are locked");
  const allowed = order.indexOf(next) === order.indexOf(current.status) + 1;
  if (!allowed)
    throw new Error(`Invalid transition from ${current.status} to ${next}`);
  const updated = await client.case.update({
    where: { id: caseId },
    data: {
      status: next,
      ...(next === "delivered"
        ? { locked: true, deliveredAt: new Date() }
        : {}),
    },
  });
  await client.event.create({
    data: {
      caseId,
      type: "status_changed",
      payload: { from: current.status, to: next, ...payload },
    },
  });
  return updated;
}
