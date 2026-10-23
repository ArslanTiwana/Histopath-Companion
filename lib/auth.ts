import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { isSessionId, SESSION_COOKIE } from "./session";
export async function isSetup() {
  return Boolean(await prisma.setting.findUnique({ where: { id: 1 } }));
}
export async function isAuthenticated() {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!isSessionId(value)) return false;
  const session = await prisma.authSession.findUnique({
    where: { id: value },
    select: { expiresAt: true },
  });
  return Boolean(session && session.expiresAt > new Date());
}
export async function getSessionId() {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!isSessionId(value)) throw new Error("Unauthorized");
  const session = await prisma.authSession.findUnique({
    where: { id: value },
    select: { expiresAt: true },
  });
  if (!session || session.expiresAt <= new Date())
    throw new Error("Unauthorized");
  return value;
}
export async function createSession() {
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
  await prisma.authSession.create({ data: { id: sessionId, expiresAt } });
  (await cookies()).set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 12,
    path: "/",
  });
  return sessionId;
}
export async function setPin(pin: string) {
  const hash = await bcrypt.hash(pin, 12);
  await prisma.setting.upsert({
    where: { id: 1 },
    update: { pinHash: hash, failedAttempts: 0, lockedUntil: null },
    create: { id: 1, pinHash: hash },
  });
}
export async function verifyPin(pin: string) {
  const setting = await prisma.setting.findUnique({ where: { id: 1 } });
  if (!setting) return { ok: false, setup: true };
  if (setting.lockedUntil && setting.lockedUntil > new Date())
    return { ok: false, lockedUntil: setting.lockedUntil };
  const ok = await bcrypt.compare(pin, setting.pinHash);
  if (ok) {
    await prisma.setting.update({
      where: { id: 1 },
      data: { failedAttempts: 0, lockedUntil: null },
    });
    await createSession();
    return { ok: true };
  }
  const attempts = setting.failedAttempts + 1;
  const lockedUntil =
    attempts >= 5 ? new Date(Date.now() + 5 * 60 * 1000) : null;
  await prisma.setting.update({
    where: { id: 1 },
    data: { failedAttempts: lockedUntil ? 0 : attempts, lockedUntil },
  });
  return { ok: false, attempts, lockedUntil };
}
export async function requireAuth() {
  if (!(await isAuthenticated())) throw new Error("Unauthorized");
}
