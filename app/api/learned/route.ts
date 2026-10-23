import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  hasConsultantDifferences,
  type ComparisonRow,
} from "@/lib/phase5-actions";

export async function GET() {
  if (!(await isAuthenticated()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const entries = await prisma.consultantEntry.findMany({
    include: {
      case: { select: { id: true, caseLabel: true, specimenType: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(
    entries.filter((entry) =>
      hasConsultantDifferences(entry.comparison as ComparisonRow[]),
    ),
  );
}
