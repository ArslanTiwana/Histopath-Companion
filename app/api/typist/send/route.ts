import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendApprovedReports } from "@/lib/phase5-actions";

const sendSchema = z.object({
  caseIds: z.array(z.number().int().positive()).optional(),
  confirmed: z.literal(true),
});

export async function GET() {
  if (!(await isAuthenticated()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cases = await prisma.case.findMany({
    where: { status: "report_approved" },
    select: { id: true, caseLabel: true },
    orderBy: { caseLabel: "asc" },
  });
  return NextResponse.json(cases);
}

export async function POST(request: Request) {
  if (!(await isAuthenticated()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = sendSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "Confirm the reports to send" },
      { status: 400 },
    );
  try {
    return NextResponse.json(await sendApprovedReports(parsed.data.caseIds));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not send reports",
      },
      { status: 400 },
    );
  }
}
