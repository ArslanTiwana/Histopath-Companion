import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  saveConsultantEntry,
  saveConsultantSchema,
} from "@/lib/phase5-actions";
import { containsPatientIdentifier } from "@/src/lib/privacy";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  if (!(await isAuthenticated()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const item = await prisma.case.findUnique({
    where: { id: Number(params.id) },
    include: { microEntry: true, consultantEntry: true },
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
  const parsed = saveConsultantSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message || "Invalid consultant diagnosis",
      },
      { status: 400 },
    );
  const text = [
    ...Object.values(parsed.data.consultantDx),
    parsed.data.learnedNote || "",
  ].join(" ");
  if (containsPatientIdentifier(text))
    return NextResponse.json(
      { error: "Remove patient-identifying details before saving." },
      { status: 400 },
    );
  try {
    return NextResponse.json(
      await saveConsultantEntry(Number(params.id), parsed.data),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not save consultant review",
      },
      { status: 400 },
    );
  }
}
