"use client";

import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";

export default function DictationButton({
  label,
  onTranscript,
}: {
  label: string;
  onTranscript: (text: string) => void;
}) {
  const [state, setState] = useState<"idle" | "listening" | "transcribing">(
    "idle",
  );
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const media = new MediaRecorder(stream);
      recorder.current = media;
      chunks.current = [];
      media.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      media.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setState("transcribing");
        const form = new FormData();
        form.append(
          "audio",
          new Blob(chunks.current, { type: media.mimeType || "audio/webm" }),
        );
        try {
          const result = await apiFetch<{
            transcript?: string;
            error?: string;
          }>("/api/voice/transcribe", {
            method: "POST",
            body: form,
          });
          if (!result.transcript?.trim())
            throw new Error(result.error || "I didn't catch that");
          onTranscript(result.transcript.trim());
        } catch (cause) {
          setError(
            cause instanceof Error ? cause.message : "Transcription failed",
          );
        } finally {
          setState("idle");
        }
      };
      media.start();
      setState("listening");
    } catch {
      setError("Microphone permission is required. Type instead.");
    }
  }

  return (
    <>
      <button
        type="button"
        className="voice-answer wide"
        disabled={state === "transcribing"}
        onClick={() =>
          state === "listening" ? recorder.current?.stop() : void start()
        }
      >
        {state === "listening"
          ? "■ Stop"
          : state === "transcribing"
            ? "Transcribing…"
            : `🎙 ${label}`}
      </button>
      {error && <div className="error">{error}</div>}
    </>
  );
}
