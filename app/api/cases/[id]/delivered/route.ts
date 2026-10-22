import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  if (!(await isAuthenticated()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const item = await prisma.case.findUnique({
    where: { id: Number(params.id) },
    include: { steps: true, events: { orderBy: { at: "asc" } } },
  });
  return item
    ? NextResponse.json(item)
    : NextResponse.json({ error: "Case not found" }, { status: 404 });
}
