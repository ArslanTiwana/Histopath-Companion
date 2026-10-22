import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { transcribe, AiBusyError } from "@/src/lib/ai";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!(await isAuthenticated()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await request.formData();
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0)
    return NextResponse.json({ error: "Audio is required" }, { status: 400 });
  if (!/^(audio\/(webm|ogg|mp4)|video\/webm)$/.test(audio.type))
    return NextResponse.json(
      { error: "Use a webm, ogg, or mp4 audio recording" },
      { status: 400 },
    );
  try {
    return NextResponse.json({ transcript: await transcribe(audio) });
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
