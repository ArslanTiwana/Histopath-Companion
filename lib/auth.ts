import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "./db";
const COOKIE = "histopath_session";
const SESSION_VALUE = "authenticated";
export async function isSetup() {
  return Boolean(await prisma.setting.findUnique({ where: { id: 1 } }));
}
export async function isAuthenticated() {
  return (await cookies()).get(COOKIE)?.value === SESSION_VALUE;
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
    (await cookies()).set(COOKIE, SESSION_VALUE, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 12,
      path: "/",
    });
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
