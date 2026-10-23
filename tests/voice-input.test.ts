import { describe, expect, it } from "vitest";
import {
  chooseVoiceMimeType,
  extensionForMimeType,
  isJunkTranscript,
  isStopListeningCommand,
} from "@/lib/voice-input";

describe("voice input helpers", () => {
  it("prefers MP4 on iOS Safari", () => {
    expect(
      chooseVoiceMimeType(
        (type) => ["audio/mp4", "audio/webm"].includes(type),
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      ),
    ).toBe("audio/mp4");
  });

  it("prefers Opus WebM outside iOS and falls back to a supported format", () => {
    expect(chooseVoiceMimeType((type) => type === "audio/mp4", "Firefox")).toBe(
      "audio/mp4",
    );
    expect(extensionForMimeType("audio/mp4")).toBe("m4a");
  });

  it("recognizes only standalone stop commands", () => {
    expect(isStopListeningCommand("stop listening")).toBe(true);
    expect(isStopListeningCommand("stop")).toBe(true);
    expect(isStopListeningCommand("stop the case")).toBe(false);
  });

  it("filters empty and configured hallucinations without dropping short commands", () => {
    expect(isJunkTranscript(" ")).toBe(true);
    expect(isJunkTranscript("Thanks for watching.")).toBe(true);
    expect(isJunkTranscript("ambient caption", "ambient caption")).toBe(true);
    expect(isJunkTranscript("no")).toBe(false);
    expect(isJunkTranscript("show pending")).toBe(false);
  });
});
