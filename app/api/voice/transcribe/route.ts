import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { transcribe, AiBusyError } from "@/src/lib/ai";
import {
  containsPatientIdentifier,
  PATIENT_IDENTIFIER_MESSAGE,
} from "@/src/lib/privacy";
export const runtime = "nodejs";
const audioSchema = z
  .instanceof(Blob)
  .refine((audio) => audio.size > 0, "Audio is required")
  .refine(
    (audio) =>
      /^(audio\/(?:webm|ogg|mp4)|video\/webm)(?:;.*)?$/i.test(audio.type),
    "Use a webm, ogg, or mp4 audio recording",
  );
export async function POST(request: Request) {
  if (!(await isAuthenticated()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const parsed = audioSchema.safeParse(form?.get("audio"));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid audio" },
      { status: 400 },
    );
  const audio = parsed.data;
  try {
    const transcript = await transcribe(audio);
    if (containsPatientIdentifier(transcript))
      return NextResponse.json(
        { error: PATIENT_IDENTIFIER_MESSAGE },
        { status: 400 },
      );
    return NextResponse.json({ transcript });
  } catch (error) {
    if (error instanceof AiBusyError)
      return NextResponse.json(
        { error: error.message, code: "RATE_LIMIT" },
        { status: 429 },
      );
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Transcription failed",
      },
      { status: 502 },
    );
  }
}
