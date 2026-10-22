import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { completeMicro, saveMicroSchema } from "@/lib/micro-actions";
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  if (!(await isAuthenticated()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const item = await prisma.case.findUnique({
    where: { id: Number(params.id) },
    include: { microEntry: true },
  });
  return item
    ? NextResponse.json(item)
    : NextResponse.json({ error: "Case not found" }, { status: 404 });
}
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  if (!(await isAuthenticated()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = saveMicroSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid microscopy entry" },
      { status: 400 },
    );
  try {
    return NextResponse.json(
      await completeMicro(Number(params.id), parsed.data),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not save microscopy",
      },
      { status: 400 },
    );
  }
}
