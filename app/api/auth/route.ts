import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSession,
  isAuthenticated,
  isSetup,
  setPin,
  verifyPin,
} from "@/lib/auth";
const input = z.object({
  pin: z.string().regex(/^\d{4}$/, "PIN must be 4 digits"),
  setup: z.boolean(),
});
export async function GET() {
  return NextResponse.json({
    setup: !(await isSetup()),
    authenticated: await isAuthenticated(),
  });
}
export async function POST(req: Request) {
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid PIN request" },
      { status: 400 },
    );
  if (parsed.data.setup && !(await isSetup())) {
    await setPin(parsed.data.pin);
    await createSession();
    return NextResponse.json({ ok: true });
  }
  const result = await verifyPin(parsed.data.pin);
  if (result.ok) return NextResponse.json(result);
  return NextResponse.json(
    {
      ...result,
      error: result.lockedUntil
        ? "Locked for 5 minutes"
        : `Incorrect PIN. ${5 - (result.attempts || 0)} attempts left.`,
    },
    { status: 400 },
  );
}
