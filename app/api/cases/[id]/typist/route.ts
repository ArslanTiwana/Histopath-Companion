import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  checkTypedReport,
  deliverCase,
  typistCheckSchema,
} from "@/lib/phase5-actions";
import { containsPatientIdentifier } from "@/src/lib/privacy";

const actionSchema = z.discriminatedUnion("action", [
  typistCheckSchema.extend({ action: z.literal("check") }),
  z.object({ action: z.literal("deliver"), confirmed: z.literal(true) }),
  z.object({
    action: z.literal("override"),
    reason: z.string().trim().min(3),
    confirmed: z.literal(true),
  }),
  z.object({
    action: z.literal("send_back"),
    fields: z.array(z.string()).min(1),
    confirmed: z.literal(true),
  }),
]);

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  if (!(await isAuthenticated()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const item = await prisma.case.findUnique({
    where: { id: Number(params.id) },
    include: {
      report: true,
      typistChecks: { orderBy: { checkedAt: "desc" }, take: 1 },
    },
  });
  return item
    ? NextResponse.json(item)
    : NextResponse.json({ error: "Case not found" }, { status: 404 });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  if (!(await isAuthenticated()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = actionSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid typist action" },
      { status: 400 },
    );
  const caseId = Number(params.id);
  try {
    if (parsed.data.action === "check") {
      if (containsPatientIdentifier(parsed.data.typedText))
        return NextResponse.json(
          { error: "Remove patient-identifying details before saving." },
          { status: 400 },
        );
      return NextResponse.json(await checkTypedReport(caseId, parsed.data));
    }
    if (parsed.data.action === "deliver")
      return NextResponse.json(await deliverCase(caseId));
    if (parsed.data.action === "override")
      return NextResponse.json(await deliverCase(caseId, parsed.data.reason));
    await prisma.event.create({
      data: {
        caseId,
        type: "returned_to_typist",
        payload: { fields: parsed.data.fields, confirmed: true },
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Typist action failed",
      },
      { status: 400 },
    );
  }
}
