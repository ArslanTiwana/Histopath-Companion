import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import {
  matchFastPath,
  normalizeCaseLabel,
  parseRange,
} from "@/src/lib/voice/parser";
import { runCommand, AiBusyError } from "@/src/lib/ai";
import { prisma } from "@/lib/db";
import { rangeLabels } from "@/lib/case-actions";
import {
  confirmPending,
  cancelPending,
  getPending,
  setPending,
  undoLast,
  getDraft,
  setDraft,
} from "@/lib/voice-session";
const input = z.object({
  transcript: z.string().trim(),
  context: z.object({
    screen: z.string(),
    caseId: z.number().int().optional(),
  }),
});
async function execute(tool: string, args: Record<string, unknown>) {
  if (tool === "confirm") {
    const result = await confirmPending();
    return { ...result, refresh: "result" in result };
  }
  if (tool === "cancel") return cancelPending();
  if (tool === "undo_last") return { ...(await undoLast()), refresh: true };
  if (tool === "create_batch") {
    const start =
      typeof args.start === "string" ? normalizeCaseLabel(args.start) : null;
    const end =
      typeof args.end === "string" ? normalizeCaseLabel(args.end) : null;
    if (!start || !end) {
      setDraft({ tool: "create_batch", args });
      return {
        reply: "What case range should I create, for example S-101 to S-140?",
        needsConfirm: false,
      };
    }
    const range = parseRange(`${start} to ${end}`);
    setPending({
      action: "create_batch",
      args: {
        name: typeof args.name === "string" ? args.name : "Voice batch",
        start,
        end,
      },
      description: `Create ${range ? (range.end === range.start ? 1 : Number(range.end.match(/\d+/)![0]) - Number(range.start.match(/\d+/)![0]) + 1) : "the"} cases, ${start} to ${end}?`,
    });
    return { reply: getPending()!.description, needsConfirm: true };
  }
  if (tool === "create_case") {
    const label =
      typeof args.label === "string" ? normalizeCaseLabel(args.label) : null;
    if (!label) {
      setDraft({ tool: "create_case", args });
      return {
        reply:
          "Tell me the case label, specimen, and whether it is routine or urgent.",
        needsConfirm: false,
      };
    }
    setPending({
      action: "create_case",
      args: {
        label,
        specimen: typeof args.specimen === "string" ? args.specimen : undefined,
        priority: args.priority === "urgent" ? "urgent" : "routine",
      },
      description: `Create ${label}${args.specimen ? `, ${String(args.specimen)}` : ""}, ${args.priority === "urgent" ? "urgent" : "routine"}?`,
    });
    return { reply: getPending()!.description, needsConfirm: true };
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
    const labels = rangeLabels(start, end);
    const selected = await prisma.case.findMany({
      where: { caseLabel: { in: labels } },
      select: { id: true, status: true },
    });
    const ready = selected.filter(
      (item) => item.status === "micro_done",
    ).length;
    const notReady = selected.length - ready;
    setPending({
      action: "send_to_consultant",
      args: { caseIds: selected.map((item) => item.id) },
      description: `Send ${ready} ready cases to the consultant? ${notReady} selected cases are not ready.`,
    });
    return { reply: getPending()!.description, needsConfirm: true };
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
  const parsed = input.safeParse(await request.json());
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
  let command = matchFastPath(parsed.data.transcript);
  const draft = getDraft();
  if (!command && draft) {
    const continued = matchFastPath(
      `${draft.tool === "create_case" ? "create case" : "create batch"} ${parsed.data.transcript}`,
    );
    if (continued)
      command = { ...continued, args: { ...draft.args, ...continued.args } };
  }
  try {
    if (!command) {
      const routed = await runCommand(
        parsed.data.transcript,
        parsed.data.context,
      );
      if (!("tool" in routed)) return NextResponse.json(routed);
      command = routed;
    }
    const result = await execute(command.tool, command.args);
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
