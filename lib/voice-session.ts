import { prisma } from "./db";
import { createBatch, createSingleCase } from "./case-actions";
import { sendCasesToConsultant } from "./micro-actions";
type Pending = {
  action: "create_batch" | "create_case" | "send_to_consultant";
  args: {
    name?: string;
    start?: string;
    end?: string;
    label?: string;
    specimen?: string;
    priority?: "routine" | "urgent";
    caseIds?: number[];
  };
  description: string;
  createdIds?: number[];
};
let pending: Pending | null = null;
let lastCreatedIds: number[] = [];
let draft: {
  tool: "create_batch" | "create_case";
  args: Record<string, unknown>;
} | null = null;
export function getDraft() {
  return draft;
}
export function setDraft(value: NonNullable<typeof draft>) {
  draft = value;
}
export function clearDraft() {
  draft = null;
}
export function getPending() {
  return pending;
}
export function setPending(value: Pending) {
  draft = null;
  pending = value;
  return value;
}
export function clearPending() {
  pending = null;
}
export async function confirmPending() {
  if (!pending) return { reply: "There is nothing waiting for confirmation." };
  const action = pending;
  pending = null;
  if (action.action === "create_batch") {
    const result = await createBatch(
      action.args.name!,
      action.args.start!,
      action.args.end!,
    );
    lastCreatedIds = result.cases.map((item) => item.id);
    return {
      reply: `Created ${result.count} cases, ${result.rangeStart} to ${result.rangeEnd}.`,
      result,
    };
  }
  if (action.action === "send_to_consultant") {
    const result = await sendCasesToConsultant(action.args.caseIds || []);
    return {
      reply: `Sent ${result.ready.length} cases. ${result.notReady.length} were not ready.`,
      result,
    };
  }
  const result = await createSingleCase(
    action.args.label!,
    action.args.specimen,
    action.args.priority,
  );
  lastCreatedIds = [result.id];
  return { reply: `Created ${result.caseLabel}.`, result };
}
export function cancelPending() {
  if (!pending && !draft)
    return { reply: "There is nothing waiting for confirmation." };
  pending = null;
  draft = null;
  return { reply: "Cancelled." };
}
export async function undoLast() {
  if (!lastCreatedIds.length)
    return { reply: "There is no safe action to undo." };
  const cases = await prisma.case.findMany({
    where: { id: { in: lastCreatedIds } },
    include: { events: true },
  });
  if (
    cases.some(
      (item) => item.status !== "gross_pending" || item.events.length > 1,
    )
  )
    return {
      reply: "I cannot safely undo that action after progress has started.",
    };
  await prisma.case.deleteMany({ where: { id: { in: lastCreatedIds } } });
  lastCreatedIds = [];
  return { reply: "The last case creation was undone." };
}
