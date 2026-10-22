import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { sendCasesToConsultant } from "@/lib/micro-actions";
const input = z.object({
  caseIds: z.array(z.number().int()).min(1),
  confirmed: z.literal(true),
});
export async function POST(request: Request) {
  if (!(await isAuthenticated()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = input.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "Select cases and confirm first" },
      { status: 400 },
    );
  return NextResponse.json(await sendCasesToConsultant(parsed.data.caseIds));
}
