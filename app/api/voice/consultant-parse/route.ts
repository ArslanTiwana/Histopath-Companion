import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { parseConsultantDictation } from "@/src/lib/ai";
import {
  assertNoPatientIdentifiers,
  PATIENT_IDENTIFIER_MESSAGE,
} from "@/src/lib/privacy";

const input = z.object({ text: z.string().trim().min(1).max(4000) });

export async function POST(request: Request) {
  if (!(await isAuthenticated()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Dictation is required" },
      { status: 400 },
    );
  try {
    assertNoPatientIdentifiers(parsed.data.text);
    return NextResponse.json(await parseConsultantDictation(parsed.data.text));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : PATIENT_IDENTIFIER_MESSAGE,
      },
      { status: 400 },
    );
  }
}
