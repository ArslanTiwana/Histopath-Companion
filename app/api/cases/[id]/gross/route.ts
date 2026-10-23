import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseIdParam } from "@/lib/validation";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  if (!(await isAuthenticated()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = parseIdParam(params.id);
  if (!id)
    return NextResponse.json({ error: "Invalid case ID" }, { status: 400 });
  const current = await prisma.case.findUnique({
    where: { id },
    include: { grossEntry: true },
  });
  if (!current)
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  const previous = await prisma.grossEntry.findMany({
    where: { case: { createdAt: { lt: current.createdAt } } },
    orderBy: { createdAt: "desc" },
    include: {
      case: { select: { caseLabel: true, specimenType: true } },
    },
  });
  return NextResponse.json({ case: current, previous });
}
