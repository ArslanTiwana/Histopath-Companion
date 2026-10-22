import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated, setPin, verifyPin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { aiConfig } from "@/src/lib/ai/config";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preferences"), overdueDays: z.number().int().min(1).max(30), confirmed: z.literal(true) }),
  z.object({ action: z.literal("pin"), currentPin: z.string().regex(/^\d{4}$/), newPin: z.string().regex(/^\d{4}$/), confirmed: z.literal(true) }),
]);

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const setting = await prisma.setting.findUnique({ where: { id: 1 }, select: { overdueDays: true } });
  return NextResponse.json({ overdueDays: setting?.overdueDays || 2, ai: { provider: aiConfig.provider, commandModel: aiConfig.modelCommands, chatModel: aiConfig.modelChat, sttModel: aiConfig.modelStt } });
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = actionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid confirmed setting" }, { status: 400 });
  if (parsed.data.action === "preferences") {
    await prisma.setting.update({ where: { id: 1 }, data: { overdueDays: parsed.data.overdueDays } });
    await prisma.event.create({ data: { type: "settings_updated", payload: { overdueDays: parsed.data.overdueDays } } });
    return NextResponse.json({ ok: true });
  }
  const verified = await verifyPin(parsed.data.currentPin);
  if (!verified.ok) return NextResponse.json({ error: "Current PIN is incorrect" }, { status: 400 });
  await setPin(parsed.data.newPin);
  await prisma.event.create({ data: { type: "pin_changed", payload: { confirmed: true } } });
  return NextResponse.json({ ok: true });
}
