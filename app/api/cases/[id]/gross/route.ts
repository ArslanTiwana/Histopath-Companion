import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  bypassGross,
  completeGross,
  grossActionSchema,
} from "@/lib/gross-actions";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  if (!(await isAuthenticated()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number(params.id);
  const current = await prisma.case.findUnique({
    where: { id },
    include: { grossEntry: true },
  });
  if (!current)
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  const previous = await prisma.grossEntry.findFirst({
    where: { case: { createdAt: { lt: current.createdAt } } },
    orderBy: { createdAt: "desc" },
    include: { case: { select: { specimenType: true } } },
  });
  return NextResponse.json({ case: current, previous });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  if (!(await isAuthenticated()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = grossActionSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid gross action" },
      { status: 400 },
    );
  try {
    const result =
      parsed.data.action === "save"
        ? await completeGross(Number(params.id), parsed.data)
        : await bypassGross(Number(params.id), parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gross action failed" },
      { status: 400 },
    );
  }
}
