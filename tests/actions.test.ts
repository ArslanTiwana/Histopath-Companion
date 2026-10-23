import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ActionRegistry, actionManifest, defineAction } from "@/lib/actions";
import { estimateRouterStaticTokens } from "@/lib/action-router";

describe("action registry", () => {
  it("validates arguments and restores shadowed screen actions", async () => {
    const registry = new ActionRegistry();
    const first = vi.fn();
    const second = vi.fn();
    const make = (run: (args: { value: string }) => void) =>
      defineAction({
        id: "set_value",
        description: "Set a value",
        args: z.object({ value: z.string() }),
        screens: ["test"],
        risk: "safe" as const,
        describe: ({ value }) => value,
        run,
      });
    const removeFirst = registry.register([make(first)]);
    const removeSecond = registry.register([make(second)]);
    await registry.run("set_value", { value: "new" }, { source: "voice" });
    expect(second).toHaveBeenCalledWith({ value: "new" }, { source: "voice" });
    removeSecond();
    await registry.run("set_value", { value: "old" }, { source: "tap" });
    expect(first).toHaveBeenCalledWith({ value: "old" }, { source: "tap" });
    removeFirst();
  });

  it("publishes compact schemas and risk metadata", () => {
    const action = defineAction({
      id: "open",
      description: "Open a case",
      args: z.object({ label: z.string() }),
      screens: ["global"],
      risk: "safe" as const,
      describe: ({ label }) => label,
      run: () => undefined,
    });
    const manifest = actionManifest(action);
    expect(manifest).toMatchObject({ id: "open", risk: "safe" });
    expect(JSON.stringify(manifest).length).toBeLessThan(500);
    expect(estimateRouterStaticTokens(Array(20).fill(manifest))).toBeLessThan(
      1000,
    );
  });
});
