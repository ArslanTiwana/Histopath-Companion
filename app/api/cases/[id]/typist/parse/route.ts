import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { parseTypedReportFields } from "@/src/lib/ai";
import { assertNoPatientIdentifiers } from "@/src/lib/privacy";

const input = z.object({ text: z.string().trim().min(10).max(30000) });
export async function POST(request: Request) {
  if (!(await isAuthenticated()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Typed report text is required" },
      { status: 400 },
    );
  try {
    assertNoPatientIdentifiers(parsed.data.text);
    const fields = await parseTypedReportFields(parsed.data.text);
    const labels: Record<string, string> = { tumourSize: "Tumour size" };
    return NextResponse.json({
      fields,
      canonicalText: Object.entries(fields)
        .map(([key, value]) => `${labels[key] || key}: ${value}`)
        .join("\n"),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not parse typed report",
      },
      { status: 400 },
    );
  }
}
