import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { searchCases } from "@/lib/phase6-actions";
import { containsPatientIdentifier } from "@/src/lib/privacy";

export async function GET(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (query.length < 2) return NextResponse.json({ error: "Enter a search" }, { status: 400 });
  if (containsPatientIdentifier(query)) return NextResponse.json({ error: "Search by case label or pathology terms, without patient details." }, { status: 400 });
  return NextResponse.json(await searchCases(query));
}
