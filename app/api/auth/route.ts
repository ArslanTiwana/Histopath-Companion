import { NextResponse } from "next/server";
import { isAuthenticated, isSetup, setPin, verifyPin } from "@/lib/auth";
export async function GET() {
  return NextResponse.json({
    setup: !(await isSetup()),
    authenticated: await isAuthenticated(),
  });
}
export async function POST(req: Request) {
  const body = (await req.json()) as { pin?: string; setup?: boolean };
  if (!/^\d{4}$/.test(body.pin ?? ""))
    return NextResponse.json(
      { error: "PIN must be 4 digits" },
      { status: 400 },
    );
  if (body.setup && !(await isSetup())) {
    await setPin(body.pin!);
    return NextResponse.json({ ok: true });
  }
  const result = await verifyPin(body.pin!);
  return NextResponse.json(result, { status: result.ok ? 200 : 401 });
}
