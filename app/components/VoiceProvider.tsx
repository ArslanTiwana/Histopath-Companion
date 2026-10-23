"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useAuthState } from "@/app/components/AuthState";
import { useVoiceInput, type VoiceState } from "@/app/hooks/useVoiceInput";
import {
  useActions,
  useRegisterActions,
} from "@/app/components/ActionProvider";
import { defineAction, type AnyAction } from "@/lib/actions";
import { apiFetch } from "@/lib/api-fetch";
import { normalizeCaseLabel } from "@/src/lib/voice/parser";

type VoiceContextValue = {
  state: VoiceState;
  active: boolean;
  lines: string[];
  notice: string;
  lastReply: string;
  headsetMode: boolean;
  startSession: () => Promise<void>;
  stopSession: (message?: string) => void;
  captureOnce: () => Promise<string>;
  submitTypedCommand: (text: string) => Promise<void>;
  setHeadsetMode: (value: boolean) => void;
  speak: (text: string) => Promise<void>;
};

const VoiceContext = createContext<VoiceContextValue | null>(null);

const stateLabels: Record<VoiceState, string> = {
  off: "Voice off",
  listening: "Listening",
  hearing: "Hearing you",
  transcribing: "Transcribing",
  thinking: "Thinking",
  speaking: "Speaking",
  error: "Voice error",
};

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const actionRuntime = useActions();
  const voiceOptions = useMemo(
    () => ({
      getRouterContext: actionRuntime.routerContext,
      runAction: (id: string, args: Record<string, unknown>) =>
        actionRuntime.run(id, args, { source: "voice" }),
    }),
    [actionRuntime],
  );
  const voice = useVoiceInput(voiceOptions);
  const { authenticated } = useAuthState();
  const [expanded, setExpanded] = useState(false);
  const globalActions = useMemo<AnyAction[]>(
    () => [
      defineAction({
        id: "start_listening",
        description: "Start the hands-free voice session.",
        args: z.object({}),
        screens: ["global"],
        risk: "safe",
        describe: () => "Start listening",
        run: () => voice.startSession(),
      }),
      defineAction({
        id: "navigate",
        description: "Open a named app route.",
        args: z.object({
          to: z.string(),
          args: z.record(z.string(), z.unknown()).optional(),
        }),
        screens: ["global"],
        risk: "safe",
        describe: ({ to }) => `Open ${to}`,
        run: ({ to }) => router.push(to),
      }),
      defineAction({
        id: "go_back",
        description: "Return to the previous screen.",
        args: z.object({}),
        screens: ["global"],
        risk: "safe",
        describe: () => "Go back",
        run: () => router.back(),
      }),
      defineAction({
        id: "open_case",
        description: "Open a case by case label.",
        args: z.object({ label: z.string() }),
        screens: ["global"],
        risk: "safe",
        describe: ({ label }) => `Open ${label}`,
        run: async ({ label }) => {
          const normalized = normalizeCaseLabel(label);
          if (!normalized) throw new Error("Use a case label such as S-101.");
          const cases =
            await apiFetch<Array<{ id: number; caseLabel: string }>>(
              "/api/cases",
            );
          const item = cases.find(
            (value) => value.caseLabel.toUpperCase() === normalized,
          );
          if (!item) throw new Error(`${normalized} was not found.`);
          router.push(`/cases/${item.id}`);
        },
      }),
      defineAction({
        id: "next_case",
        description: "Open the next case waiting for grossing.",
        args: z.object({}),
        screens: ["global"],
        risk: "safe",
        describe: () => "Open the next case",
        run: async () => {
          const cases =
            await apiFetch<Array<{ id: number; status: string }>>("/api/cases");
          const item = cases.find((value) => value.status === "gross_pending");
          if (!item)
            throw new Error("There are no cases waiting for grossing.");
          router.push(`/cases/${item.id}/gross`);
        },
      }),
      defineAction({
        id: "set_filter",
        description: "Change the visible case filter.",
        args: z.object({ filter: z.string() }),
        screens: ["global"],
        risk: "safe",
        describe: ({ filter }) => `Show ${filter} cases`,
        run: ({ filter }) =>
          window.dispatchEvent(
            new CustomEvent("voice-filter", { detail: filter }),
          ),
      }),
      defineAction({
        id: "read_screen",
        description: "Read a short summary of the current screen.",
        args: z.object({}),
        screens: ["global"],
        risk: "safe",
        describe: () => "Read this screen",
        run: () =>
          voice.speak(
            JSON.stringify(actionRuntime.routerContext().screenState),
          ),
      }),
      defineAction({
        id: "stop_listening",
        description: "Stop the hands-free voice session.",
        args: z.object({}),
        screens: ["global"],
        risk: "safe",
        describe: () => "Stop listening",
        run: () => voice.stopSession("Voice session stopped."),
      }),
      defineAction({
        id: "toggle_voice_details",
        description: "Show or hide recent voice details.",
        args: z.object({}),
        screens: ["global"],
        risk: "safe",
        describe: () => "Toggle voice details",
        run: () => setExpanded((value) => !value),
      }),
      ...(["undo", "confirm", "cancel"] as const).map((mode) =>
        defineAction({
          id: mode === "undo" ? "undo_last" : mode,
          description: `${mode} the latest eligible action.`,
          args: z.object({ token: z.string().optional() }),
          screens: ["global"],
          risk: "safe" as const,
          describe: () => mode,
          run: ({ token }) =>
            apiFetch<{
              result?: {
                clientAction?: { id: string; args: Record<string, unknown> };
              };
            }>("/api/actions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(
                mode === "undo" ? { mode } : { mode, token },
              ),
            }).then(async (result) => {
              const clientAction = result.result?.clientAction;
              if (clientAction)
                await actionRuntime.run(clientAction.id, clientAction.args, {
                  source: "voice",
                  confirmed: true,
                });
              return result;
            }),
        }),
      ),
    ],
    [actionRuntime, router, voice],
  );
  useRegisterActions("global", globalActions, () => ({ screenId: "global" }));
  return (
    <VoiceContext.Provider value={voice}>
      {children}
      {authenticated && (
        <aside
          className="floating-voice"
          aria-label="Hands-free voice controls"
        >
          {(expanded || voice.active || voice.notice) && (
            <div className="floating-voice-panel">
              <button
                type="button"
                className="voice-panel-toggle"
                onClick={() => void actionRuntime.run("toggle_voice_details")}
                aria-expanded={expanded}
                data-action="toggle_voice_details"
              >
                {expanded ? "Hide voice details" : "Voice details"}
              </button>
              <div className="floating-voice-state" aria-live="polite">
                {stateLabels[voice.state]}
              </div>
              {voice.lines.length > 0 && (
                <div
                  className="floating-transcripts"
                  aria-label="Recent voice transcript"
                >
                  {voice.lines.map((line, index) => (
                    <div key={`${index}-${line}`}>{line}</div>
                  ))}
                </div>
              )}
              {voice.notice && (
                <div className="floating-voice-notice">{voice.notice}</div>
              )}
            </div>
          )}
          <button
            type="button"
            className={`floating-mic ${voice.state}`}
            onClick={() =>
              voice.active
                ? void actionRuntime.run("stop_listening")
                : void actionRuntime.run("start_listening")
            }
            aria-label={
              voice.active
                ? "Stop hands-free listening"
                : "Start hands-free listening"
            }
            aria-pressed={voice.active}
            data-action={voice.active ? "stop_listening" : "start_listening"}
          >
            {voice.active ? "■" : "🎙"}
          </button>
        </aside>
      )}
    </VoiceContext.Provider>
  );
}

export function useVoice() {
  const value = useContext(VoiceContext);
  if (!value) throw new Error("useVoice must be used inside VoiceProvider");
  return value;
}
