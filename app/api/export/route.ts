import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cases = await prisma.case.findMany({ include: { batch: true, grossEntry: true, microEntry: true, consultantEntry: true, report: true, typistChecks: true, reminders: true, events: true }, orderBy: { caseLabel: "asc" } });
  const body = JSON.stringify({ exportedAt: new Date().toISOString(), cases }, null, 2);
  return new NextResponse(body, { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="histopath-export-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" } });
}
