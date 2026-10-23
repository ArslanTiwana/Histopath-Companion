import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { assertNoPatientIdentifiers } from "@/src/lib/privacy";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!(await isAuthenticated()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size > 5_000_000)
    return NextResponse.json(
      { error: "Choose a .txt or .docx file under 5 MB" },
      { status: 400 },
    );
  const extension = file.name.toLowerCase().split(".").pop();
  try {
    let text = "";
    if (extension === "txt") text = await file.text();
    else if (extension === "docx") {
      const mammoth = await import("mammoth");
      text = (
        await mammoth.extractRawText({
          buffer: Buffer.from(await file.arrayBuffer()),
        })
      ).value;
    } else
      return NextResponse.json(
        { error: "Only .txt and .docx files are supported" },
        { status: 400 },
      );
    assertNoPatientIdentifiers(text);
    return NextResponse.json({ text: text.trim() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not read file" },
      { status: 400 },
    );
  }
}
