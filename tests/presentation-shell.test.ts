import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import actions from "@/lib/generated-voice-actions.json";

describe("presentation and offline shell", () => {
  it("registers every new help and recovery control", () => {
    const ids = new Set(actions.map((entry) => entry.id));
    expect(ids.has("filter_voice_help")).toBe(true);
    expect(ids.has("retry_screen")).toBe(true);
  });

  it("caches only GET case reads and documents offline fallbacks in the shell", () => {
    const serviceWorker = readFileSync(
      path.join(process.cwd(), "public/sw.js"),
      "utf8",
    );
    expect(serviceWorker).toContain('event.request.method !== "GET"');
    expect(serviceWorker).toContain('url.pathname === "/api/cases"');
    expect(serviceWorker).toContain("networkFirst(event.request, CASE_CACHE)");
  });

  it("loads DOCX generation only when an export is requested", () => {
    const source = readFileSync(
      path.join(process.cwd(), "lib/phase5-actions.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/from ["']docx["']/);
    expect(source).toContain('await import("docx")');
  });
});
