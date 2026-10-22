import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  if (!(await isAuthenticated()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const entries = await prisma.consultantEntry.findMany({
    where: { learnedNote: { not: null } },
    include: {
      case: { select: { id: true, caseLabel: true, specimenType: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(entries);
}
