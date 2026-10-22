import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { chat, AiBusyError } from "@/src/lib/ai";
import { containsPatientIdentifier } from "@/src/lib/privacy";
const messageSchema = z.object({
  contextStep: z.enum(["gross", "micro"]),
  message: z.string().trim().min(2).max(4000),
  currentText: z.string().max(8000).optional(),
});
const saveSchema = z.object({
  action: z.literal("save"),
  contextStep: z.enum(["gross", "micro"]),
  messages: z
    .array(
      z.object({ role: z.enum(["user", "assistant"]), content: z.string() }),
    )
    .min(1),
  addedNote: z.string().optional(),
});
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  if (!(await isAuthenticated()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body: unknown = await request.json();
  const isSave =
    typeof body === "object" &&
    body !== null &&
    "action" in body &&
    body.action === "save";
  if (isSave) {
    const parsed = saveSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(
        { error: "Invalid help session" },
        { status: 400 },
      );
    const savedText = [
      ...parsed.data.messages.map((message) => message.content),
      parsed.data.addedNote || "",
    ].join(" ");
    if (containsPatientIdentifier(savedText))
      return NextResponse.json(
        { error: "Remove patient-identifying details before saving help." },
        { status: 400 },
      );
    await prisma.$transaction([
      prisma.helpSession.create({
        data: {
          caseId: Number(params.id),
          contextStep: parsed.data.contextStep,
          messages: parsed.data.messages,
          addedNote: parsed.data.addedNote || null,
        },
      }),
      prisma.event.create({
        data: {
          caseId: Number(params.id),
          type: "help_session_saved",
          payload: {
            contextStep: parsed.data.contextStep,
            addedToNotes: Boolean(parsed.data.addedNote),
          },
        },
      }),
    ]);
    return NextResponse.json({ ok: true });
  }
  const parsed = messageSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "A help question is required" },
      { status: 400 },
    );
  if (
    containsPatientIdentifier(parsed.data.message) ||
    containsPatientIdentifier(parsed.data.currentText || "")
  )
    return NextResponse.json(
      { error: "Remove patient-identifying details before using help." },
      { status: 400 },
    );
  const item = await prisma.case.findUnique({
    where: { id: Number(params.id) },
    select: { specimenType: true },
  });
  if (!item)
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  try {
    const reply = await chat({
      system:
        "You are a concise histopathology study aid. Suggest what to describe, measure, examine, or submit according to department protocol. Do not provide a final diagnosis. Do not request patient details. End with: Study aid. Follow your department protocol.",
      messages: [
        {
          role: "user",
          content: `Step: ${parsed.data.contextStep}\nSpecimen: ${item.specimenType || "unknown"}\nCurrent work: ${parsed.data.currentText || "none"}\nQuestion: ${parsed.data.message}`,
        },
      ],
      maxTokens: 220,
    });
    return NextResponse.json({ reply });
  } catch (error) {
    if (error instanceof AiBusyError)
      return NextResponse.json({ error: error.message }, { status: 429 });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Help is unavailable" },
      { status: 502 },
    );
  }
}
