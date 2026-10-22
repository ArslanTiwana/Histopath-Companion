import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseReminderDate } from "@/lib/phase6-actions";
import { containsPatientIdentifier } from "@/src/lib/privacy";

const createSchema = z.object({ caseId: z.number().int().positive().optional(), text: z.string().trim().min(2).max(500), when: z.string().trim().min(2), confirmed: z.literal(true) });
const updateSchema = z.object({ id: z.number().int().positive(), done: z.boolean(), confirmed: z.literal(true) });

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await prisma.reminder.findMany({ where: { done: false }, include: { case: { select: { id: true, caseLabel: true } } }, orderBy: { dueAt: "asc" } }));
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body: unknown = await request.json();
  const update = updateSchema.safeParse(body);
  if (update.success) {
    const reminder = await prisma.reminder.update({ where: { id: update.data.id }, data: { done: update.data.done } });
    await prisma.event.create({ data: { caseId: reminder.caseId, type: "reminder_updated", payload: { reminderId: reminder.id, done: reminder.done } } });
    return NextResponse.json(reminder);
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid reminder" }, { status: 400 });
  if (containsPatientIdentifier(parsed.data.text)) return NextResponse.json({ error: "Remove patient-identifying details from the reminder." }, { status: 400 });
  const dueAt = parseReminderDate(parsed.data.when);
  if (!dueAt) return NextResponse.json({ error: "Use tomorrow, a weekday, or YYYY-MM-DD" }, { status: 400 });
  const reminder = await prisma.reminder.create({ data: { caseId: parsed.data.caseId, text: parsed.data.text, dueAt } });
  await prisma.event.create({ data: { caseId: reminder.caseId, type: "reminder_created", payload: { reminderId: reminder.id, dueAt: reminder.dueAt.toISOString() } } });
  return NextResponse.json(reminder);
}
