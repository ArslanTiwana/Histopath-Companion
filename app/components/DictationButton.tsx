"use client";

import { useState } from "react";
import { useVoice } from "@/app/components/VoiceProvider";
import { z } from "zod";
import { useRegisterActions } from "@/app/components/ActionProvider";
import { defineAction, type AnyAction } from "@/lib/actions";

export default function DictationButton({
  label,
  onTranscript,
}: {
  label: string;
  onTranscript: (text: string) => void;
}) {
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState("");
  const voice = useVoice();

  async function start() {
    setWaiting(true);
    setError("");
    try {
      onTranscript(await voice.captureOnce());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Transcription failed");
    } finally {
      setWaiting(false);
    }
  }
  const actions = useRegisterActions(
    "global",
    [
      defineAction({
        id: "dictate",
        description: label,
        args: z.object({}),
        screens: ["global"],
        risk: "safe",
        describe: () => label,
        run: start,
      }),
    ] as AnyAction[],
    () => ({ screenId: "global" }),
  );

  return (
    <>
      <button
        type="button"
        className="voice-answer wide"
        data-action="dictate"
        disabled={waiting}
        onClick={() => void actions.run("dictate")}
      >
        {waiting ? `${voice.state}…` : `🎙 ${label}`}
      </button>
      {error && <div className="error">{error}</div>}
    </>
  );
}
