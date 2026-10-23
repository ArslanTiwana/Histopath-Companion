import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getBriefing } from "@/lib/phase6-actions";

export async function GET() {
  if (!(await isAuthenticated()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getBriefing());
}
