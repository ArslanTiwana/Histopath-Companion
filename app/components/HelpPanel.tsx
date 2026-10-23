"use client";
import { useState } from "react";
import { z } from "zod";
import { apiFetch } from "@/lib/api-fetch";
import { runConfirmedAction } from "@/lib/client-actions";
import DictationButton from "@/app/components/DictationButton";
import { useRegisterActions } from "@/app/components/ActionProvider";
import { defineAction, type AnyAction } from "@/lib/actions";
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
  const screenActions: AnyAction[] = [
    defineAction({
      id: "set_help_question",
      description: "Set the contextual help question.",
      args: z.object({ text: z.string() }),
      screens: ["help"],
      risk: "safe",
      describe: ({ text: value }) => `Set help question to ${value}`,
      run: ({ text: value }) => setText(value),
    }),
    defineAction({
      id: "ask_help",
      description: "Ask the contextual study-aid assistant.",
      args: z.object({ question: z.string().optional() }),
      screens: ["help"],
      risk: "safe",
      describe: ({ question }) => `Ask ${question || text}`,
      run: ({ question }, ctx) => ask(question || text, ctx.source),
    }),
    defineAction({
      id: "close_help",
      description: "Close help without adding its answer to notes.",
      args: z.object({}),
      screens: ["help"],
      risk: "confirm",
      describe: () => "Close help",
      run: () => close(),
    }),
    defineAction({
      id: "add_help_answer",
      description: "Add the latest help answer to notes and close.",
      args: z.object({}),
      screens: ["help"],
      risk: "confirm",
      describe: () => "Add the latest help answer to notes",
      run: () => {
        if (!latestReply) throw new Error("There is no help answer to add.");
        return close(latestReply);
      },
    }),
  ];
  const actions = useRegisterActions(
    `${contextStep}_help`,
    screenActions,
    () => ({
      screenId: `${contextStep}_help`,
      caseLabel,
      currentText,
      question: text,
      latestReply,
      modal: "help",
    }),
  );
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
          <button
            data-action="close_help"
            className="close"
            onClick={() => void actions.run("close_help")}
          >
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
            void actions.run("ask_help", { question: value });
          }}
          className="help-input"
        >
          <textarea
            data-action="set_help_question"
            value={text}
            onChange={(event) =>
              void actions.run("set_help_question", {
                text: event.target.value,
              })
            }
            placeholder="Describe what you see or ask a question…"
          />
          <div className="gross-actions">
            <DictationButton
              label="Ask by voice"
              onTranscript={(value) =>
                void actions.run(
                  "ask_help",
                  { question: value },
                  { source: "voice" },
                )
              }
            />
            <button
              data-action="ask_help"
              className="primary"
              disabled={busy || !text.trim()}
            >
              Ask
            </button>
          </div>
        </form>
        {latestReply && (
          <button
            className="secondary wide"
            data-action="add_help_answer"
            onClick={() => void actions.run("add_help_answer")}
          >
            Add answer to notes and close
          </button>
        )}
        <button
          data-action="close_help"
          className="secondary wide"
          onClick={() => void actions.run("close_help")}
        >
          Close without adding
        </button>
        {error && <div className="error">{error}</div>}
      </section>
    </div>
  );
}
