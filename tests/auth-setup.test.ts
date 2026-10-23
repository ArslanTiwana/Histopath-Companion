import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cookie: null as { name: string; value: string } | null,
  findUnique: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  sessionCreate: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => state.cookie,
    set: (name: string, value: string) => {
      state.cookie = { name, value };
    },
  }),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    setting: {
      findUnique: state.findUnique,
      upsert: state.upsert,
      update: state.update,
    },
    authSession: {
      create: state.sessionCreate,
      findUnique: vi.fn(),
    },
  },
}));

import { POST } from "@/app/api/auth/route";
import { isSessionId, SESSION_COOKIE } from "@/lib/session";

describe("first-time PIN setup", () => {
  it("creates an authenticated session cookie after storing the PIN hash", async () => {
    state.cookie = null;
    state.findUnique.mockResolvedValue(null);
    state.upsert.mockResolvedValue({ id: 1 });
    state.sessionCreate.mockResolvedValue({ id: "session" });

    const response = await POST(
      new Request("http://localhost/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: "1234", setup: true }),
      }),
    );

    expect(response.status).toBe(200);
    expect(state.upsert).toHaveBeenCalledOnce();
    expect(state.sessionCreate).toHaveBeenCalledOnce();
    const cookie = state.cookie as { name: string; value: string } | null;
    expect(cookie?.name).toBe(SESSION_COOKIE);
    expect(isSessionId(cookie?.value)).toBe(true);
  });
});
