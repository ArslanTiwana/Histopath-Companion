import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionId, isAuthenticated } from "@/lib/auth";
import {
  matchFastPath,
  normalizeCaseLabel,
  parseRange,
} from "@/src/lib/voice/parser";
import { runCommand, AiBusyError } from "@/src/lib/ai";
import { prisma } from "@/lib/db";
import {
  cancelPendingAction,
  confirmPendingAction,
  prepareConfirmedAction,
  undoLastAction,
} from "@/lib/confirmed-actions";
import {
  assertNoPatientIdentifiers,
  PATIENT_IDENTIFIER_MESSAGE,
} from "@/src/lib/privacy";
const input = z.object({
  transcript: z.string().trim(),
  context: z.object({
    screen: z.string(),
    caseId: z.number().int().optional(),
  }),
});
async function execute(
  sessionId: string,
  tool: string,
  args: Record<string, unknown>,
) {
  if (tool === "confirm") {
    const confirmed = await confirmPendingAction(sessionId);
    return {
      reply: `Confirmed ${confirmed.action.replaceAll("_", " ")}.`,
      result: confirmed.result,
      refresh: true,
    };
  }
  if (tool === "cancel") {
    const result = await cancelPendingAction(sessionId);
    return {
      reply: result.cancelled
        ? "Cancelled."
        : "There is nothing waiting for confirmation.",
    };
  }
  if (tool === "undo_last") return undoLastAction(sessionId);
  if (tool === "create_batch") {
    const start =
      typeof args.start === "string" ? normalizeCaseLabel(args.start) : null;
    const end =
      typeof args.end === "string" ? normalizeCaseLabel(args.end) : null;
    if (!start || !end) {
      return {
        reply: "What case range should I create, for example S-101 to S-140?",
        needsConfirm: false,
      };
    }
    const range = parseRange(`${start} to ${end}`);
    const pending = await prepareConfirmedAction(sessionId, "create_batch", {
      name: typeof args.name === "string" ? args.name : "Voice batch",
      start,
      end,
      source: "voice",
    });
    return {
      reply: pending.readBackText,
      pendingToken: pending.token,
      range,
      needsConfirm: true,
    };
  }
  if (tool === "create_case") {
    const label =
      typeof args.label === "string" ? normalizeCaseLabel(args.label) : null;
    if (!label) {
      return {
        reply:
          "Tell me the case label, specimen, and whether it is routine or urgent.",
        needsConfirm: false,
      };
    }
    const pending = await prepareConfirmedAction(sessionId, "create_case", {
      label,
      caseLabel: label,
      specimenType:
        typeof args.specimen === "string" ? args.specimen : undefined,
      priority: args.priority === "urgent" ? "urgent" : "routine",
      source: "voice",
    });
    return {
      reply: pending.readBackText,
      pendingToken: pending.token,
      needsConfirm: true,
    };
  }
  if (tool === "send_to_consultant") {
    const start =
      typeof args.start === "string" ? normalizeCaseLabel(args.start) : null;
    const end =
      typeof args.end === "string" ? normalizeCaseLabel(args.end) : null;
    if (!start || !end)
      return {
        reply: "Which case range should I send to the consultant?",
        needsConfirm: false,
      };
    const first = Number(start.match(/\d+/)?.[0]);
    const last = Number(end.match(/\d+/)?.[0]);
    if (!Number.isInteger(first) || !Number.isInteger(last) || last < first)
      return { reply: "Use a valid case range.", needsConfirm: false };
    const labels = Array.from(
      { length: last - first + 1 },
      (_, index) => `S-${first + index}`,
    );
    const selected = await prisma.case.findMany({
      where: { caseLabel: { in: labels } },
      select: { id: true, status: true },
    });
    const pending = await prepareConfirmedAction(
      sessionId,
      "send_to_consultant",
      {
        caseIds: selected.map((item) => item.id),
        source: "voice",
      },
    );
    return {
      reply: pending.readBackText,
      pendingToken: pending.token,
      needsConfirm: true,
    };
  }
  if (tool === "open_worklist")
    return {
      tool,
      args,
      reply: "Opening the worklist.",
      navigateTo: "/",
      needsConfirm: false,
    };
  if (tool === "next_case") {
    const next = await prisma.case.findFirst({
      where: { status: "gross_pending" },
      orderBy: { createdAt: "asc" },
      select: { id: true, caseLabel: true },
    });
    return next
      ? {
          tool,
          args,
          reply: `Opening ${next.caseLabel} for grossing.`,
          navigateTo: `/cases/${next.id}/gross`,
          needsConfirm: false,
        }
      : {
          tool,
          args,
          reply: "There are no cases waiting for grossing.",
          needsConfirm: false,
        };
  }
  if (tool === "open_case") {
    const label =
      typeof args.label === "string" ? normalizeCaseLabel(args.label) : null;
    if (!label)
      return {
        reply: "Which case should I open? Say a label such as S-101.",
        needsConfirm: false,
      };
    const item = await prisma.case.findUnique({
      where: { caseLabel: label },
      select: { id: true },
    });
    return item
      ? {
          tool,
          args: { label },
          reply: `Opening ${label}.`,
          navigateTo: `/cases/${item.id}`,
          needsConfirm: false,
        }
      : { reply: `${label} was not found.`, needsConfirm: false };
  }
  if (tool === "show_pending")
    return {
      tool,
      args,
      reply: "Showing cases with pending work.",
      filter: "pending",
      navigateTo: "/",
      needsConfirm: false,
    };
  if (tool === "show_incomplete")
    return {
      tool,
      args,
      reply: "Showing incomplete cases.",
      filter: "incomplete",
      navigateTo: "/",
      needsConfirm: false,
    };
  if (tool === "go_back")
    return {
      tool,
      args,
      reply: "Going back.",
      goBack: true,
      needsConfirm: false,
    };
  return {
    tool,
    args,
    reply:
      tool === "show_pending"
        ? "Showing pending cases."
        : tool === "open_worklist"
          ? "Opening the worklist."
          : tool === "next_case"
            ? "Opening the next pending case."
            : tool === "show_incomplete"
              ? "Showing incomplete cases."
              : tool === "show_stuck"
                ? "Showing stuck cases."
                : tool === "open_case"
                  ? `Opening ${String(args.label)}.`
                  : tool === "go_back"
                    ? "Going back."
                    : "I need more detail for that action.",
    needsConfirm: false,
  };
}
export async function POST(request: Request) {
  if (!(await isAuthenticated()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Transcript and screen context are required" },
      { status: 400 },
    );
  if (!parsed.data.transcript)
    return NextResponse.json({
      reply: "I didn't catch that. Please try again.",
      needsConfirm: false,
    });
  try {
    assertNoPatientIdentifiers(parsed.data.transcript);
  } catch {
    return NextResponse.json(
      { error: PATIENT_IDENTIFIER_MESSAGE },
      { status: 400 },
    );
  }
  let command = matchFastPath(parsed.data.transcript);
  try {
    if (!command) {
      const routed = await runCommand(
        parsed.data.transcript,
        parsed.data.context,
      );
      if (!("tool" in routed)) return NextResponse.json(routed);
      command = routed;
    }
    const result = await execute(
      await getSessionId(),
      command.tool,
      command.args,
    );
    return NextResponse.json({
      ...command,
      ...result,
      transcript: parsed.data.transcript,
    });
  } catch (error) {
    if (error instanceof AiBusyError)
      return NextResponse.json(
        { error: error.message, code: "RATE_LIMIT" },
        { status: 429 },
      );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Command failed" },
      { status: 400 },
    );
  }
}
