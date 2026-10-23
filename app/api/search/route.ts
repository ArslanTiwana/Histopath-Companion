import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { searchCases } from "@/lib/phase6-actions";
import { containsPatientIdentifier } from "@/src/lib/privacy";

const input = z.object({ query: z.string().trim().min(2).max(500) });

export async function POST(request: Request) {
  if (!(await isAuthenticated()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Enter a search" }, { status: 400 });
  const query = parsed.data.query;
  if (containsPatientIdentifier(query))
    return NextResponse.json(
      {
        error:
          "Search by case label or pathology terms, without patient details.",
      },
      { status: 400 },
    );
  return NextResponse.json(await searchCases(query));
}
