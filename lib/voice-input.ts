export const DEFAULT_VOICE_IDLE_TIMEOUT_MS = 120_000;
export const DEFAULT_VOICE_SILENCE_MS = 1_000;
export const DEFAULT_VOICE_MIN_SPEECH_MS = 400;

import { VOICE_HALLUCINATION_PHRASES } from "@/lib/voice-config";

const SHORT_COMMANDS = new Set([
  "stop",
  "yes",
  "no",
  "confirm",
  "cancel",
  "undo",
  "next case",
  "show pending",
]);

export function isStopListeningCommand(value: string): boolean {
  return /^(?:stop listening|stop)[.!]?$/i.test(value.trim());
}

export function isJunkTranscript(
  value: string,
  configuredPhrases = "",
): boolean {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, "");
  if (!normalized) return true;
  const phrases = [
    ...VOICE_HALLUCINATION_PHRASES,
    ...configuredPhrases
      .split(",")
      .map((phrase) => phrase.trim().toLowerCase())
      .filter(Boolean),
  ];
  if (phrases.some((phrase) => normalized === phrase)) return true;
  return normalized.length < 4 && !SHORT_COMMANDS.has(normalized);
}

export function chooseVoiceMimeType(
  isSupported: (mimeType: string) => boolean,
  userAgent: string,
): string {
  const ios = /iPad|iPhone|iPod/.test(userAgent);
  const candidates = ios
    ? [
        "audio/mp4",
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
      ]
    : [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ];
  return candidates.find(isSupported) || "";
}

export function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}
