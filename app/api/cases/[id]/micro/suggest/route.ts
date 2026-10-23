import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { chat, AiBusyError } from "@/src/lib/ai";
import { containsPatientIdentifier } from "@/src/lib/privacy";
import { parseIdParam } from "@/lib/validation";
const input = z.object({ findings: z.string().trim().min(3).max(6000) });
const output = z.object({
  differential: z.array(z.string()).max(6),
  ihc: z.array(z.string()).max(8),
});
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  if (!(await isAuthenticated()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const caseId = parseIdParam(params.id);
  if (!caseId)
    return NextResponse.json({ error: "Invalid case ID" }, { status: 400 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Microscopy findings are required" },
      { status: 400 },
    );
  if (containsPatientIdentifier(parsed.data.findings))
    return NextResponse.json(
      {
        error:
          "Remove patient-identifying details before requesting suggestions.",
      },
      { status: 400 },
    );
  const item = await prisma.case.findUnique({
    where: { id: caseId },
    select: { specimenType: true },
  });
  if (!item)
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  try {
    const response = await chat({
      system:
        "You are a histopathology study aid. Return JSON only with differential (short strings) and ihc (short strings). Never state a final diagnosis. Never ask for or include patient identifiers. Use an empty array when not relevant.",
      messages: [
        {
          role: "user",
          content: `Specimen: ${item.specimenType || "unknown"}\nMicroscopy findings: ${parsed.data.findings}`,
        },
      ],
      maxTokens: 300,
    });
    const json = response.match(/\{[\s\S]*\}/)?.[0];
    const suggestions = output.safeParse(json ? JSON.parse(json) : null);
    if (!suggestions.success)
      throw new Error("Suggestions could not be structured");
    return NextResponse.json(suggestions.data);
  } catch (error) {
    if (error instanceof AiBusyError)
      return NextResponse.json({ error: error.message }, { status: 429 });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not generate suggestions",
      },
      { status: 502 },
    );
  }
}
