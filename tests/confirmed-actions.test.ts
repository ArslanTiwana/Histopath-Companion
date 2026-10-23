import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  pending: null as null | {
    token: string;
    sessionId: string;
    action: string;
    args: unknown;
    readBackText: string;
    expiresAt: Date;
    createdAt: Date;
  },
  pendingCreate: vi.fn(),
  pendingFindFirst: vi.fn(),
  pendingDelete: vi.fn(),
  undoCreate: vi.fn(),
  caseCreate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    pendingAction: {
      create: db.pendingCreate,
      findFirst: db.pendingFindFirst,
      delete: db.pendingDelete,
    },
    undoAction: { create: db.undoCreate },
    case: { create: db.caseCreate },
    template: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));

import {
  cancelPendingAction,
  confirmPendingAction,
  prepareConfirmedAction,
} from "@/lib/confirmed-actions";

describe("persisted confirmation actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.pending = null;
    db.pendingCreate.mockImplementation(async ({ data }) => {
      db.pending = { ...data, createdAt: new Date() };
      return db.pending;
    });
    db.pendingFindFirst.mockImplementation(async () => db.pending);
    db.pendingDelete.mockImplementation(async () => {
      const value = db.pending;
      db.pending = null;
      return value;
    });
    db.caseCreate.mockResolvedValue({ id: 41, caseLabel: "S-141" });
    db.undoCreate.mockResolvedValue({ id: 1 });
  });

  it("persists validated read-back state and consumes it for the same session", async () => {
    const sessionId = "04d95889-0ff4-4ef6-a75a-0f975ef31d20";
    const pending = await prepareConfirmedAction(sessionId, "create_case", {
      caseLabel: "S-141",
      specimenType: "Appendix",
      priority: "urgent",
      source: "tap",
    });

    expect(pending.readBackText).toContain("Create S-141");
    expect(db.pending?.sessionId).toBe(sessionId);

    await confirmPendingAction(sessionId, pending.token);

    expect(db.pending).toBeNull();
    expect(db.caseCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        caseLabel: "S-141",
        events: {
          create: { type: "case_created", payload: { source: "tap" } },
        },
      }),
    });
    expect(db.undoCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ sessionId }),
    });
  });

  it("consumes a cancelled token without executing it", async () => {
    const sessionId = "04d95889-0ff4-4ef6-a75a-0f975ef31d20";
    const pending = await prepareConfirmedAction(sessionId, "create_case", {
      caseLabel: "S-142",
      priority: "routine",
      source: "voice",
    });

    expect(await cancelPendingAction(sessionId, pending.token)).toEqual({
      cancelled: true,
    });
    expect(db.pending).toBeNull();
    expect(db.caseCreate).not.toHaveBeenCalled();
  });

  it("requires a persisted confirmation token for a bypass reason", async () => {
    const sessionId = "04d95889-0ff4-4ef6-a75a-0f975ef31d20";
    const pending = await prepareConfirmedAction(sessionId, "bypass_step", {
      caseId: 17,
      step: "micro",
      mode: "force",
      reason: "Tissue is unavailable",
      source: "voice",
    });

    expect(db.pending).toMatchObject({
      token: pending.token,
      sessionId,
      action: "bypass_step",
      args: expect.objectContaining({ reason: "Tissue is unavailable" }),
    });
    expect(pending.readBackText).toContain("Force complete micro");
  });
});
