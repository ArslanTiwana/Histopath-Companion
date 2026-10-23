import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./db";
import { createBatch, createSingleCase } from "./case-actions";
import { completeGross, saveGrossSchema } from "./gross-actions";
import { bypassStep, bypassStepSchema } from "./bypass-actions";
import {
  completeMicro,
  saveMicroSchema,
  sendCasesToConsultant,
} from "./micro-actions";
import {
  approveReport,
  approveReportSchema,
  checkTypedReport,
  deliverCase,
  generateReport,
  markReportReadBack,
  saveConsultantEntry,
  saveConsultantSchema,
  sendApprovedReports,
  sendBackToTypist,
  typistCheckSchema,
  unlockCase,
} from "./phase5-actions";
import { closeDay, parseReminderDate } from "./phase6-actions";
import { assertNoPatientIdentifiers } from "@/src/lib/privacy";

const sourceSchema = z.enum(["tap", "voice"]);
const actionSchemas = {
  create_case: z.object({
    caseLabel: z.string().regex(/^S-\d+$/i, "Case ID must look like S-101"),
    specimenType: z.string().trim().max(100).optional(),
    priority: z.enum(["routine", "urgent"]).default("routine"),
    source: sourceSchema,
  }),
  create_batch: z
    .object({
      name: z.string().trim().min(1).max(120),
      start: z.string().regex(/^S-\d+$/i),
      end: z.string().regex(/^S-\d+$/i),
      source: sourceSchema,
    })
    .superRefine((value, context) => {
      const start = Number(value.start.match(/\d+/)?.[0]);
      const end = Number(value.end.match(/\d+/)?.[0]);
      if (end < start || end - start > 500)
        context.addIssue({
          code: "custom",
          message: "Use a valid case range of at most 501 cases",
        });
    }),
  save_gross: saveGrossSchema.omit({ confirmed: true }).extend({
    caseId: z.number().int().positive(),
    source: sourceSchema,
  }),
  bypass_step: bypassStepSchema.extend({
    source: sourceSchema,
  }),
  save_micro: saveMicroSchema.omit({ confirmed: true }).extend({
    caseId: z.number().int().positive(),
    sendToConsultant: z.boolean().default(false),
    source: sourceSchema,
  }),
  send_to_consultant: z.object({
    caseIds: z.array(z.number().int().positive()).min(1),
    source: sourceSchema,
  }),
  save_consultant: saveConsultantSchema.omit({ confirmed: true }).extend({
    caseId: z.number().int().positive(),
    source: sourceSchema,
  }),
  generate_report: z.object({
    caseId: z.number().int().positive(),
    source: sourceSchema,
  }),
  approve_report: approveReportSchema.omit({ confirmed: true }).extend({
    caseId: z.number().int().positive(),
    source: sourceSchema,
  }),
  read_report: z.object({
    caseId: z.number().int().positive(),
    content: z.record(z.string(), z.string()),
    source: sourceSchema,
  }),
  send_to_typist: z.object({
    caseIds: z.array(z.number().int().positive()).min(1),
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    source: sourceSchema,
  }),
  check_typist: typistCheckSchema.omit({ confirmed: true }).extend({
    caseId: z.number().int().positive(),
    source: sourceSchema,
  }),
  send_back_typist: z.object({
    caseId: z.number().int().positive(),
    fields: z.array(z.string().trim().min(1)).min(1),
    source: sourceSchema,
  }),
  deliver_case: z.object({
    caseId: z.number().int().positive(),
    source: sourceSchema,
  }),
  override_delivery: z.object({
    caseId: z.number().int().positive(),
    reason: z.string().trim().min(3).max(1000),
    source: sourceSchema,
  }),
  unlock_case: z.object({
    caseId: z.number().int().positive(),
    reason: z.string().trim().min(3).max(1000),
    source: sourceSchema,
  }),
  create_reminder: z.object({
    caseId: z.number().int().positive().optional(),
    text: z.string().trim().min(2).max(500),
    when: z.string().trim().min(2).max(100),
    source: sourceSchema,
  }),
  close_day: z.object({ source: sourceSchema }),
  save_help_session: z.object({
    caseId: z.number().int().positive(),
    contextStep: z.enum(["gross", "micro"]),
    messages: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().trim().min(1).max(8000),
        }),
      )
      .min(1),
    addedNote: z.string().trim().max(8000).optional(),
    source: sourceSchema,
  }),
} as const;

export type ConfirmedActionName = keyof typeof actionSchemas;
type ActionArgs = z.infer<(typeof actionSchemas)[ConfirmedActionName]>;

function validateAction(action: string, args: unknown): ActionArgs {
  if (!(action in actionSchemas)) throw new Error("Unknown action");
  const schema = actionSchemas[action as ConfirmedActionName];
  const parsed = schema.safeParse(args);
  if (!parsed.success)
    throw new Error(parsed.error.issues[0]?.message || "Invalid action");
  return parsed.data as ActionArgs;
}

function checkFreeText(action: ConfirmedActionName, args: ActionArgs) {
  const value = args as Record<string, unknown>;
  const fields: Partial<Record<ConfirmedActionName, unknown>> = {
    create_case: value.specimenType,
    create_batch: value.name,
    save_gross: {
      specimenType: value.specimenType,
      fields: value.fields,
      descriptionText: value.descriptionText,
      transcript: value.transcript,
      notes: value.notes,
    },
    bypass_step: value.reason,
    save_micro: {
      dictation: value.dictation,
      differential: value.differential,
      ihc: value.ihc,
      provisionalDx: value.provisionalDx,
      notes: value.notes,
    },
    save_consultant: {
      consultantDx: value.consultantDx,
      learnedNote: value.learnedNote,
    },
    approve_report: value.content,
    read_report: value.content,
    check_typist: value.typedText,
    send_back_typist: value.fields,
    override_delivery: value.reason,
    unlock_case: value.reason,
    create_reminder: value.text,
    save_help_session: {
      messages: value.messages,
      addedNote: value.addedNote,
    },
  };
  assertNoPatientIdentifiers(fields[action]);
}

async function readBackFor(action: ConfirmedActionName, args: ActionArgs) {
  const value = args as Record<string, unknown>;
  if (action === "create_case")
    return `Create ${value.caseLabel}, ${value.specimenType || "specimen not set"}, ${value.priority}?`;
  if (action === "create_batch") {
    const start = Number(String(value.start).match(/\d+/)?.[0]);
    const end = Number(String(value.end).match(/\d+/)?.[0]);
    return `Create ${end - start + 1} cases, ${value.start} to ${value.end}, in ${value.name}?`;
  }
  if (action === "save_gross") return `Save gross: ${value.descriptionText}`;
  if (action === "bypass_step")
    return `${value.mode === "skip" ? "Skip" : "Force complete"} ${value.step} because ${value.reason}?`;
  if (action === "save_micro")
    return `Save microscopy: ${value.dictation}. Provisional diagnosis: ${value.provisionalDx || "not set"}${value.sendToConsultant ? ", then send to consultant" : ""}?`;
  if (action === "send_to_consultant") {
    const cases = await prisma.case.findMany({
      where: { id: { in: value.caseIds as number[] } },
      select: { status: true },
    });
    const ready = cases.filter((item) => item.status === "micro_done").length;
    return `Send ${ready} ready cases to the consultant? ${cases.length - ready} selected cases are not ready.`;
  }
  if (action === "save_consultant")
    return `Save consultant diagnosis: ${JSON.stringify(value.consultantDx)}?`;
  if (action === "generate_report")
    return "Generate this report and move the case to report draft?";
  if (action === "approve_report")
    return `Approve report: ${Object.entries(
      value.content as Record<string, string>,
    )
      .map(([key, text]) => `${key}: ${text}`)
      .join(". ")}?`;
  if (action === "read_report")
    return "Save and read back this report version?";
  if (action === "send_to_typist")
    return `Send ${(value.caseIds as number[]).length} approved reports to the typist?`;
  if (action === "check_typist")
    return `Compare typed report: ${value.typedText}?`;
  if (action === "send_back_typist")
    return `Send back these fields to the typist: ${(value.fields as string[]).join(", ")}?`;
  if (action === "deliver_case") return "Confirm and deliver this case?";
  if (action === "override_delivery")
    return `Override the typist differences and deliver because ${value.reason}?`;
  if (action === "unlock_case")
    return `Unlock this delivered case because ${value.reason}?`;
  if (action === "create_reminder")
    return `Save reminder “${value.text}” for ${value.when}?`;
  if (action === "close_day") return "Close today and save the summary?";
  return `Save this ${value.contextStep} help session${value.addedNote ? " and add the selected answer to notes" : ""}?`;
}

export async function prepareConfirmedAction(
  sessionId: string,
  actionValue: string,
  rawArgs: unknown,
) {
  const action = actionValue as ConfirmedActionName;
  const args = validateAction(action, rawArgs);
  checkFreeText(action, args);
  const readBackText = await readBackFor(action, args);
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.pendingAction.create({
    data: {
      token,
      sessionId,
      action,
      args: args as unknown as Prisma.InputJsonValue,
      readBackText,
      expiresAt,
    },
  });
  return { token, readBackText, expiresAt };
}

async function rememberUndo(
  sessionId: string,
  action: string,
  args: Prisma.InputJsonValue,
) {
  await prisma.undoAction.create({
    data: {
      sessionId,
      action,
      args,
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
    },
  });
}

async function executeAction(
  sessionId: string,
  action: ConfirmedActionName,
  args: ActionArgs,
) {
  const value = args as Record<string, unknown>;
  if (action === "create_case") {
    const result = await createSingleCase(
      String(value.caseLabel).toUpperCase(),
      value.specimenType as string | undefined,
      value.priority as "routine" | "urgent",
      value.source as "tap" | "voice",
    );
    await rememberUndo(sessionId, "delete_created_cases", {
      caseIds: [result.id],
    });
    return result;
  }
  if (action === "create_batch") {
    const result = await createBatch(
      String(value.name),
      String(value.start).toUpperCase(),
      String(value.end).toUpperCase(),
      value.source as "tap" | "voice",
    );
    await rememberUndo(sessionId, "delete_created_cases", {
      caseIds: result.cases.map((item) => item.id),
    });
    return result;
  }
  if (action === "save_gross")
    return completeGross(Number(value.caseId), {
      ...(value as z.infer<typeof saveGrossSchema>),
      confirmed: true,
    });
  if (action === "bypass_step")
    return bypassStep(
      Number(value.caseId),
      value.step as z.infer<typeof bypassStepSchema>["step"],
      value.mode as "skip" | "force",
      String(value.reason),
    );
  if (action === "save_micro") {
    return completeMicro(
      Number(value.caseId),
      {
        ...(value as z.infer<typeof saveMicroSchema>),
        confirmed: true,
      },
      Boolean(value.sendToConsultant),
    );
  }
  if (action === "send_to_consultant")
    return sendCasesToConsultant(value.caseIds as number[]);
  if (action === "save_consultant")
    return saveConsultantEntry(Number(value.caseId), {
      ...(value as z.infer<typeof saveConsultantSchema>),
      confirmed: true,
    });
  if (action === "generate_report") return generateReport(Number(value.caseId));
  if (action === "approve_report")
    return approveReport(Number(value.caseId), {
      content: value.content as Record<string, string>,
      confirmed: true,
    });
  if (action === "read_report")
    return markReportReadBack(
      Number(value.caseId),
      value.content as Record<string, string>,
    );
  if (action === "send_to_typist")
    return sendApprovedReports(
      value.caseIds as number[],
      String(value.localDate),
    );
  if (action === "check_typist")
    return checkTypedReport(Number(value.caseId), {
      typedText: String(value.typedText),
      confirmed: true,
    });
  if (action === "deliver_case") return deliverCase(Number(value.caseId));
  if (action === "override_delivery")
    return deliverCase(Number(value.caseId), String(value.reason));
  if (action === "send_back_typist")
    return sendBackToTypist(Number(value.caseId), value.fields as string[]);
  if (action === "unlock_case")
    return unlockCase(Number(value.caseId), String(value.reason));
  if (action === "create_reminder") {
    const dueAt = parseReminderDate(String(value.when));
    if (!dueAt) throw new Error("Use tomorrow, a weekday, or YYYY-MM-DD");
    const reminder = await prisma.reminder.create({
      data: {
        caseId: value.caseId as number | undefined,
        text: String(value.text),
        dueAt,
      },
    });
    await prisma.event.create({
      data: {
        caseId: reminder.caseId,
        type: "reminder_created",
        payload: {
          reminderId: reminder.id,
          dueAt: reminder.dueAt.toISOString(),
        },
      },
    });
    return reminder;
  }
  if (action === "close_day") return closeDay();
  const [session] = await prisma.$transaction([
    prisma.helpSession.create({
      data: {
        caseId: Number(value.caseId),
        contextStep: String(value.contextStep),
        messages: value.messages as Prisma.InputJsonValue,
        addedNote: (value.addedNote as string | undefined) || null,
      },
    }),
    prisma.event.create({
      data: {
        caseId: Number(value.caseId),
        type: "help_session_saved",
        payload: {
          contextStep: String(value.contextStep),
          addedToNotes: Boolean(value.addedNote),
        },
      },
    }),
  ]);
  return session;
}

export async function confirmPendingAction(sessionId: string, token?: string) {
  const pending = token
    ? await prisma.pendingAction.findFirst({
        where: { token, sessionId },
      })
    : await prisma.pendingAction.findFirst({
        where: { sessionId },
        orderBy: { createdAt: "desc" },
      });
  if (!pending) throw new Error("There is nothing waiting for confirmation.");
  await prisma.pendingAction.delete({ where: { token: pending.token } });
  if (pending.expiresAt <= new Date())
    throw new Error("That confirmation expired.");
  const action = pending.action as ConfirmedActionName;
  const args = validateAction(action, pending.args);
  checkFreeText(action, args);
  const result = await executeAction(sessionId, action, args);
  return { action, result };
}

export async function cancelPendingAction(sessionId: string, token?: string) {
  const pending = token
    ? await prisma.pendingAction.findFirst({ where: { token, sessionId } })
    : await prisma.pendingAction.findFirst({
        where: { sessionId },
        orderBy: { createdAt: "desc" },
      });
  if (!pending) return { cancelled: false };
  await prisma.pendingAction.delete({ where: { token: pending.token } });
  return { cancelled: true };
}

export async function undoLastAction(sessionId: string) {
  const undo = await prisma.undoAction.findFirst({
    where: { sessionId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!undo) return { reply: "There is no safe action to undo." };
  const parsed = z
    .object({ caseIds: z.array(z.number().int().positive()).min(1) })
    .safeParse(undo.args);
  if (!parsed.success || undo.action !== "delete_created_cases")
    return { reply: "There is no safe action to undo." };
  const cases = await prisma.case.findMany({
    where: { id: { in: parsed.data.caseIds } },
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
  await prisma.$transaction([
    prisma.case.deleteMany({ where: { id: { in: parsed.data.caseIds } } }),
    prisma.undoAction.delete({ where: { id: undo.id } }),
  ]);
  return { reply: "The last case creation was undone.", refresh: true };
}
