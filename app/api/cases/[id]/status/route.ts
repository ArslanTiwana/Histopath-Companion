import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { changeCaseStatus } from "@/lib/status";
import type { CaseStatus } from "@prisma/client";
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  if (!(await isAuthenticated()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await req.json()) as { status: CaseStatus };
    return NextResponse.json(
      await changeCaseStatus(Number(params.id), body.status),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid transition" },
      { status: 400 },
    );
  }
}
