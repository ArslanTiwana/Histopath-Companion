import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  hasConsultantDifferences,
  type ComparisonRow,
} from "@/lib/phase5-actions";
import { z } from "zod";
import { assertNoPatientIdentifiers } from "@/src/lib/privacy";

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

const update = z.object({
  id: z.number().int().positive(),
  note: z.string().trim().max(4000),
});
export async function POST(request: Request) {
  if (!(await isAuthenticated()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = update.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid learned note" },
      { status: 400 },
    );
  try {
    assertNoPatientIdentifiers(parsed.data.note);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Remove patient identifiers",
      },
      { status: 400 },
    );
  }
  const entry = await prisma.consultantEntry.update({
    where: { id: parsed.data.id },
    data: { learnedNote: parsed.data.note || null },
  });
  await prisma.event.create({
    data: {
      caseId: entry.caseId,
      type: "learned_note_updated",
      payload: { consultantEntryId: entry.id },
    },
  });
  return NextResponse.json(entry);
}
