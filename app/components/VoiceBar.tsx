"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
type VoiceState = "idle" | "listening" | "transcribing" | "thinking";
export default function VoiceBar() {
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [typed, setTyped] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  function speak(text: string) {
    if (typeof window !== "undefined" && "speechSynthesis" in window)
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }
  async function command(text: string) {
    setState("thinking");
    setTranscript(text);
    try {
      const data = await apiFetch<{
        reply?: string;
        error?: string;
        navigateTo?: string;
        filter?: string;
        refresh?: boolean;
        goBack?: boolean;
      }>("/api/voice/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: text,
          context: { screen: "worklist" },
        }),
      });
      const message = data.reply || data.error || "I couldn't complete that.";
      setReply(message);
      speak(message);
      if (data.filter)
        window.dispatchEvent(
          new CustomEvent("voice-filter", { detail: data.filter }),
        );
      if (data.refresh) window.dispatchEvent(new Event("cases-changed"));
      if (data.goBack) window.history.back();
      else if (data.navigateTo && window.location.pathname !== data.navigateTo)
        window.location.href = data.navigateTo;
    } catch {
      setReply("Network error. Please try the typed command again.");
    } finally {
      setState("idle");
    }
  }
  async function stop() {
    recorder.current?.stop();
    setState("transcribing");
  }
  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setReply(
        "Microphone access is not available. Use the typed command box.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const media = new MediaRecorder(stream, { mimeType: "audio/webm" });
      recorder.current = media;
      chunks.current = [];
      media.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      media.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const form = new FormData();
        form.append("audio", new Blob(chunks.current, { type: "audio/webm" }));
        try {
          const data = await apiFetch<{
            transcript?: string;
            error?: string;
          }>("/api/voice/transcribe", {
            method: "POST",
            body: form,
          });
          if (!data.transcript?.trim()) {
            setReply("I didn't catch that. Please try again.");
            setState("idle");
            return;
          }
          await command(data.transcript);
        } catch {
          setReply("Network error. Please use the typed command box.");
          setState("idle");
        }
      };
      media.start();
      setState("listening");
    } catch {
      setReply("Microphone permission is needed. Use the typed command box.");
      setState("idle");
    }
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (typed.trim()) {
      void command(typed.trim());
      setTyped("");
    }
  }
  useEffect(
    () => () =>
      recorder.current?.stream?.getTracks().forEach((track) => track.stop()),
    [],
  );
  return (
    <div className="voice-bar">
      <div className="voice-feedback">
        {transcript && (
          <span>
            <b>You:</b> {transcript}
          </span>
        )}
        {reply && (
          <span>
            <b>Companion:</b> {reply}
          </span>
        )}
      </div>
      <form onSubmit={submit} className="voice-input">
        <input
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="Say or type a command…"
          aria-label="Type a voice command"
        />
        <button className="send-command" type="submit">
          Send
        </button>
      </form>
      <button
        className={`mic-button ${state}`}
        onClick={() =>
          state === "listening"
            ? void stop()
            : state === "idle"
              ? void start()
              : undefined
        }
        aria-label={
          state === "listening" ? "Stop recording" : "Start recording"
        }
      >
        {state === "idle" ? "🎙" : state === "listening" ? "■" : "…"}
      </button>
      <span className="voice-state">
        {state === "idle" ? "Tap to speak" : state}
      </span>
    </div>
  );
}
