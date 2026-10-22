import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";

const templateSchema = z.object({ id: z.number().int().positive().optional(), kind: z.enum(["gross", "report"]), specimenType: z.string().trim().min(2).max(100), schema: z.record(z.string(), z.unknown()), defaultText: z.string().max(8000).optional(), confirmed: z.literal(true) });

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await prisma.template.findMany({ orderBy: [{ kind: "asc" }, { specimenType: "asc" }] }));
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = templateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid template" }, { status: 400 });
  const data = { kind: parsed.data.kind, specimenType: parsed.data.specimenType, schema: parsed.data.schema as unknown as Prisma.InputJsonObject, defaultText: parsed.data.defaultText || null };
  const template = parsed.data.id ? await prisma.template.update({ where: { id: parsed.data.id }, data }) : await prisma.template.upsert({ where: { kind_specimenType: { kind: data.kind, specimenType: data.specimenType } }, update: data, create: data });
  await prisma.event.create({ data: { type: "template_saved", payload: { templateId: template.id, kind: template.kind, specimenType: template.specimenType } } });
  return NextResponse.json(template);
}
