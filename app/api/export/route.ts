import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function GET(request: Request) {
  if (!(await isAuthenticated()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsedDate = dateSchema.safeParse(
    new URL(request.url).searchParams.get("date"),
  );
  if (!parsedDate.success)
    return NextResponse.json(
      { error: "A valid local date is required" },
      { status: 400 },
    );
  const cases = await prisma.case.findMany({
    include: {
      batch: true,
      grossEntry: true,
      microEntry: true,
      consultantEntry: true,
      report: true,
      typistChecks: true,
      reminders: true,
      events: true,
    },
    orderBy: { caseLabel: "asc" },
  });
  const body = JSON.stringify(
    { exportedAt: new Date().toISOString(), cases },
    null,
    2,
  );
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="histopath-export-${parsedDate.data}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
