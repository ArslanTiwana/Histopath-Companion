import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { closeDay, getEndOfDay } from "@/lib/phase6-actions";

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getEndOfDay());
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = z.object({ confirmed: z.literal(true) }).safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Confirm before closing the day" }, { status: 400 });
  return NextResponse.json(await closeDay());
}
