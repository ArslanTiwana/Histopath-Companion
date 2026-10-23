"use client";
import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { runConfirmedAction } from "@/lib/client-actions";
type Message = { role: "user" | "assistant"; content: string };
export default function HelpPanel({
  caseId,
  caseLabel,
  contextStep,
  currentText,
  onAddNote,
  onClose,
}: {
  caseId: string;
  caseLabel: string;
  contextStep: "gross" | "micro";
  currentText: string;
  onAddNote: (note: string) => void;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState<"tap" | "voice">("tap");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  async function ask(question: string, nextSource: "tap" | "voice") {
    if (!question.trim()) return;
    setBusy(true);
    setError("");
    setMessages((value) => [...value, { role: "user", content: question }]);
    try {
      setSource(nextSource);
      const result = await apiFetch<{
        reply?: string;
        error?: string;
      }>(`/api/cases/${caseId}/help`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contextStep, message: question, currentText }),
      });
      if (!result.reply) throw new Error(result.error || "Help is unavailable");
      setMessages((value) => [
        ...value,
        { role: "assistant", content: result.reply! },
      ]);
      window.speechSynthesis?.speak(new SpeechSynthesisUtterance(result.reply));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Help is unavailable");
    } finally {
      setBusy(false);
    }
  }
  async function startVoice() {
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
        setBusy(true);
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
          if (!result.transcript)
            throw new Error(result.error || "I didn't catch that");
          await ask(result.transcript, "voice");
        } catch (cause) {
          setError(
            cause instanceof Error ? cause.message : "I didn't catch that",
          );
          setBusy(false);
        }
      };
      media.start();
      setBusy(true);
    } catch {
      setError(
        "Microphone permission is required. Type your question instead.",
      );
    }
  }
  async function close(addedNote?: string) {
    if (messages.length)
      await runConfirmedAction("save_help_session", {
        caseId: Number(caseId),
        contextStep,
        messages,
        addedNote,
        source,
      });
    if (addedNote) onAddNote(addedNote);
    onClose();
  }
  const latestReply = [...messages]
    .reverse()
    .find((message) => message.role === "assistant")?.content;
  return (
    <div className="help-overlay">
      <section className="help-panel">
        <div className="help-head">
          <div>
            <div className="eyebrow">{contextStep.toUpperCase()} HELP</div>
            <h2>
              {contextStep === "gross" ? "Gross help" : "Micro help"} ·{" "}
              {caseLabel}
            </h2>
          </div>
          <button className="close" onClick={() => void close()}>
            ×
          </button>
        </div>
        <p className="study-aid">Study aid. Follow your department protocol.</p>
        <div className="help-messages">
          {messages.map((message, index) => (
            <div
              className={`help-message ${message.role}`}
              key={`${message.role}-${index}`}
            >
              {message.content}
            </div>
          ))}
          {!messages.length && (
            <p className="subtle">
              Ask what to describe, measure, examine, or submit.
            </p>
          )}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const value = text;
            setText("");
            void ask(value, "tap");
          }}
          className="help-input"
        >
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Describe what you see or ask a question…"
          />
          <div className="gross-actions">
            <button
              type="button"
              className="voice-answer"
              onClick={() =>
                busy && recorder.current?.state === "recording"
                  ? recorder.current.stop()
                  : void startVoice()
              }
            >
              {busy ? "■ Stop" : "🎙 Ask by voice"}
            </button>
            <button className="primary" disabled={busy || !text.trim()}>
              Ask
            </button>
          </div>
        </form>
        {latestReply && (
          <button
            className="secondary wide"
            onClick={() => void close(latestReply)}
          >
            Add answer to notes and close
          </button>
        )}
        <button className="secondary wide" onClick={() => void close()}>
          Close without adding
        </button>
        {error && <div className="error">{error}</div>}
      </section>
    </div>
  );
}
