import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";

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
