import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";
import { attentionReasons } from "@/lib/case-attention";
export async function GET() {
  if (!(await isAuthenticated()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [cases, setting] = await Promise.all([
    prisma.case.findMany({
      include: {
        batch: true,
        steps: true,
        reminders: { where: { done: false }, select: { done: true } },
        typistChecks: {
          orderBy: { checkedAt: "desc" },
          take: 1,
          select: { result: true },
        },
        events: { orderBy: { at: "desc" }, take: 10 },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.setting.findUnique({
      where: { id: 1 },
      select: { overdueDays: true },
    }),
  ]);
  const overdueDays = setting?.overdueDays || 2;
  return NextResponse.json(
    cases.map((item) => ({
      ...item,
      attention: attentionReasons(item, overdueDays),
    })),
  );
}
