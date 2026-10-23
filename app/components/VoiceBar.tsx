"use client";
import { useState } from "react";
import { useActions } from "@/app/components/ActionProvider";
import { useRegisterActions } from "@/app/components/ActionProvider";
import { z } from "zod";
import { defineAction, type AnyAction } from "@/lib/actions";
export default function VoiceBar({
  submitTypedCommand,
}: {
  submitTypedCommand: (text: string) => Promise<void>;
}) {
  const [typed, setTyped] = useState("");
  const actions = useActions();
  useRegisterActions(
    "global",
    [
      defineAction({
        id: "set_voice_command",
        description: "Set the typed voice command fallback.",
        args: z.object({ text: z.string() }),
        screens: ["global"],
        risk: "safe",
        describe: () => "Set typed command",
        run: ({ text }) => setTyped(text),
      }),
      defineAction({
        id: "submit_voice_command",
        description:
          "Submit the typed command through the voice action router.",
        args: z.object({ text: z.string().optional() }),
        screens: ["global"],
        risk: "safe",
        describe: () => "Submit typed command",
        run: ({ text }) => {
          const value = text || typed;
          if (value.trim()) {
            void submitTypedCommand(value.trim());
            setTyped("");
          }
        },
      }),
    ] as AnyAction[],
    () => ({ screenId: "global" }),
  );
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (typed.trim()) {
      void actions.run("submit_voice_command", { text: typed.trim() });
    }
  }
  return (
      <form onSubmit={submit} className="voice-input floating-typed-command">
        <input
          data-action="set_voice_command"
          value={typed}
          onChange={(event) =>
            void actions.run("set_voice_command", { text: event.target.value })
          }
          placeholder="Say or type a command…"
          aria-label="Type a voice command"
        />
        <button
          data-action="submit_voice_command"
          className="send-command"
          type="submit"
        >
          Send
        </button>
      </form>
  );
}
