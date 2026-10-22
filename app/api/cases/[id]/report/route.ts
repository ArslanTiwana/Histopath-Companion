import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  approveReport,
  approveReportSchema,
  generateReport,
} from "@/lib/phase5-actions";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate"), confirmed: z.literal(true) }),
  approveReportSchema.extend({ action: z.literal("approve") }),
]);

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  if (!(await isAuthenticated()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const item = await prisma.case.findUnique({
    where: { id: Number(params.id) },
    include: { report: true, consultantEntry: true },
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
      { error: "A confirmed report action is required" },
      { status: 400 },
    );
  try {
    const result =
      parsed.data.action === "generate"
        ? await generateReport(Number(params.id))
        : await approveReport(Number(params.id), parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Report action failed",
      },
      { status: 400 },
    );
  }
}
