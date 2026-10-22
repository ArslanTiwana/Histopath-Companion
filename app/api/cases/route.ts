import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";
import { createBatch, createSingleCase } from "@/lib/case-actions";
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
export async function POST(req: Request) {
  if (!(await isAuthenticated()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json()) as {
    mode: "batch" | "single";
    name?: string;
    start?: string;
    end?: string;
    caseLabel?: string;
    specimenType?: string;
    priority?: "routine" | "urgent";
  };
  try {
    if (body.mode === "single") {
      if (!/^S-\d+$/i.test(body.caseLabel ?? ""))
        throw new Error("Case ID must look like S-101");
      const c = await createSingleCase(
        body.caseLabel!.toUpperCase(),
        body.specimenType,
        body.priority || "routine",
      );
      return NextResponse.json(c);
    }
    const match = (body.start ?? "").match(/^S-(\d+)$/i);
    const endMatch = (body.end ?? "").match(/^S-(\d+)$/i);
    if (!match || !endMatch || Number(endMatch[1]) < Number(match[1]))
      throw new Error("Use a valid range such as S-101 to S-140");
    const batch = await createBatch(
      body.name?.trim() || `Batch ${new Date().toLocaleDateString()}`,
      `S-${match[1]}`,
      `S-${endMatch[1]}`,
    );
    return NextResponse.json(batch);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not create cases",
      },
      { status: 400 },
    );
  }
}
