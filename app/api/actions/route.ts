import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionId, isAuthenticated } from "@/lib/auth";
import {
  cancelPendingAction,
  confirmPendingAction,
  prepareConfirmedAction,
  undoLastAction,
} from "@/lib/confirmed-actions";

const requestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("prepare"),
    action: z.string().trim().min(1),
    args: z.record(z.string(), z.unknown()),
  }),
  z.object({
    mode: z.enum(["confirm", "cancel"]),
    token: z.uuid().optional(),
  }),
  z.object({ mode: z.literal("undo") }),
]);

export async function POST(request: Request) {
  if (!(await isAuthenticated()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid action request" },
      { status: 400 },
    );
  const sessionId = await getSessionId();
  try {
    if (parsed.data.mode === "prepare")
      return NextResponse.json(
        await prepareConfirmedAction(
          sessionId,
          parsed.data.action,
          parsed.data.args,
        ),
      );
    if (parsed.data.mode === "confirm")
      return NextResponse.json(
        await confirmPendingAction(sessionId, parsed.data.token),
      );
    if (parsed.data.mode === "cancel")
      return NextResponse.json(
        await cancelPendingAction(sessionId, parsed.data.token),
      );
    return NextResponse.json(await undoLastAction(sessionId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Action failed" },
      { status: 400 },
    );
  }
}
