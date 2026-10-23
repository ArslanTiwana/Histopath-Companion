import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";
export async function GET() {
  if (!(await isAuthenticated()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cases = await prisma.case.findMany({
    include: {
      batch: true,
      steps: true,
      events: { orderBy: { at: "desc" }, take: 10 },
    },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(cases);
}
