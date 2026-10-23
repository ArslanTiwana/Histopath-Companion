import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

describe("registered UI controls", () => {
  it("keeps every static data-action in the generated voice action registry", () => {
    const root = process.cwd();
    const docs = readFileSync(path.join(root, "docs/voice-actions.md"), "utf8");
    const registered = new Set(
      Array.from(docs.matchAll(/`([a-z0-9_]+)`/g), (match) => match[1]),
    );
    const excludedPinControls = new Set(["pin_input", "change_pin"]);
    const missing = new Set<string>();
    const files = (directory: string): string[] =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? files(path.join(directory, entry.name))
          : entry.name.endsWith(".tsx")
            ? [path.join(directory, entry.name)]
            : [],
      );
    for (const filename of files(path.join(root, "app"))) {
      const source = readFileSync(filename, "utf8");
      for (const match of Array.from(
        source.matchAll(/data-action="([a-z0-9_]+)"/g),
      ))
        if (!registered.has(match[1]) && !excludedPinControls.has(match[1]))
          missing.add(match[1]);
    }
    expect(Array.from(missing)).toEqual([]);
  });
});
