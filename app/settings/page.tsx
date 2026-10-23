"use client";

import Link from "@/app/components/ActionLink";
import { useEffect, useState } from "react";
import { z } from "zod";
import AppNav from "@/app/components/AppNav";
import { LoadingState } from "@/app/components/ScreenState";
import { apiFetch } from "@/lib/api-fetch";
import { localDateKey } from "@/lib/local-date";
import { useVoice } from "@/app/components/VoiceProvider";
import { useRegisterActions } from "@/app/components/ActionProvider";
import { defineAction, type AnyAction } from "@/lib/actions";

type Settings = {
  overdueDays: number;
  ai: {
    provider: string;
    commandModel: string;
    chatModel: string;
    sttModel: string;
  };
};

export default function SettingsPage() {
  const voice = useVoice();
  const [data, setData] = useState<Settings | null>(null);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [message, setMessage] = useState("");
  const [voiceSettings, setVoiceSettings] = useState(() => ({
    silenceMs:
      Number(
        typeof localStorage !== "undefined"
          ? localStorage.getItem("histopath_voice_silence_ms")
          : 1000,
      ) || 1000,
    idleMinutes: Math.round(
      (Number(
        typeof localStorage !== "undefined"
          ? localStorage.getItem("histopath_voice_idle_ms")
          : 120000,
      ) || 120000) / 60000,
    ),
    rate:
      Number(
        typeof localStorage !== "undefined"
          ? localStorage.getItem("histopath_voice_rate")
          : 1,
      ) || 1,
    voice:
      typeof localStorage !== "undefined"
        ? localStorage.getItem("histopath_voice_name") || ""
        : "",
    transcript:
      typeof localStorage === "undefined" ||
      localStorage.getItem("histopath_voice_transcript") !== "off",
  }));
  const setVoiceSetting = (key: string, value: string) => {
    localStorage.setItem(key, value);
    setVoiceSettings((current) => ({
      ...current,
      ...(key === "histopath_voice_silence_ms"
        ? { silenceMs: Number(value) }
        : key === "histopath_voice_idle_ms"
          ? { idleMinutes: Number(value) / 60000 }
          : key === "histopath_voice_rate"
            ? { rate: Number(value) }
            : key === "histopath_voice_name"
              ? { voice: value }
              : { transcript: value !== "off" }),
    }));
  };
  useEffect(() => {
    apiFetch<Settings>("/api/settings").then(setData);
  }, []);
  async function save(body: Record<string, unknown>) {
    setMessage("");
    try {
      await apiFetch<{ ok: boolean }>("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setMessage("Saved");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Could not save");
    }
  }
  const screenActions: AnyAction[] = [
    defineAction({
      id: "set_voice_silence",
      description: "Set voice silence length in milliseconds.",
      args: z.object({ milliseconds: z.number().int().min(300).max(5000) }),
      screens: ["settings"],
      risk: "safe",
      describe: ({ milliseconds }) =>
        `Set silence to ${milliseconds} milliseconds`,
      run: ({ milliseconds }) =>
        setVoiceSetting("histopath_voice_silence_ms", String(milliseconds)),
    }),
    defineAction({
      id: "set_voice_auto_stop",
      description: "Set voice auto-stop minutes.",
      args: z.object({ minutes: z.number().int().min(1).max(30) }),
      screens: ["settings"],
      risk: "safe",
      describe: ({ minutes }) => `Set auto stop to ${minutes} minutes`,
      run: ({ minutes }) =>
        setVoiceSetting("histopath_voice_idle_ms", String(minutes * 60000)),
    }),
    defineAction({
      id: "set_speech_voice",
      description: "Select the speech voice.",
      args: z.object({ name: z.string() }),
      screens: ["settings"],
      risk: "safe",
      describe: ({ name }) => `Use voice ${name}`,
      run: ({ name }) => setVoiceSetting("histopath_voice_name", name),
    }),
    defineAction({
      id: "set_speech_rate",
      description: "Set speech rate.",
      args: z.object({ rate: z.number().min(0.5).max(2) }),
      screens: ["settings"],
      risk: "safe",
      describe: ({ rate }) => `Set speech rate to ${rate}`,
      run: ({ rate }) => setVoiceSetting("histopath_voice_rate", String(rate)),
    }),
    defineAction({
      id: "set_transcript_visibility",
      description: "Turn transcript display on or off.",
      args: z.object({ enabled: z.boolean() }),
      screens: ["settings"],
      risk: "safe",
      describe: ({ enabled }) => `${enabled ? "Show" : "Hide"} transcripts`,
      run: ({ enabled }) =>
        setVoiceSetting("histopath_voice_transcript", enabled ? "on" : "off"),
    }),
    defineAction({
      id: "set_overdue_days",
      description: "Set the overdue threshold.",
      args: z.object({ days: z.number().int().min(1).max(30) }),
      screens: ["settings"],
      risk: "safe",
      describe: ({ days }) => `Set overdue threshold to ${days} days`,
      run: ({ days }) =>
        setData((current) =>
          current ? { ...current, overdueDays: days } : current,
        ),
    }),
    defineAction({
      id: "save_settings",
      description: "Save worklist preferences.",
      args: z.object({}),
      screens: ["settings"],
      risk: "confirm",
      describe: () => `Save overdue threshold ${data?.overdueDays || 2}`,
      run: () =>
        save({ action: "preferences", overdueDays: data?.overdueDays }),
    }),
    defineAction({
      id: "set_headset_mode",
      description: "Turn headset barge-in mode on or off.",
      args: z.object({ enabled: z.boolean() }),
      screens: ["settings"],
      risk: "safe",
      describe: ({ enabled }) =>
        `${enabled ? "Enable" : "Disable"} headset mode`,
      run: ({ enabled }) => voice.setHeadsetMode(enabled),
    }),
    defineAction({
      id: "export",
      description: "Download the local-date case export.",
      args: z.object({}),
      screens: ["settings"],
      risk: "safe",
      describe: () => "Export all case data",
      run: () => {
        window.location.href = `/api/export?date=${localDateKey()}`;
      },
    }),
  ];
  const actions = useRegisterActions("settings", screenActions, () => ({
    screenId: "settings",
    overdueDays: data?.overdueDays,
    headsetMode: voice.headsetMode,
    voiceSettings,
    modal: null,
  }));
  if (!data)
    return (
      <main className="app-shell">
        <LoadingState label="Loading settings" />
      </main>
    );
  return (
    <main className="app-shell">
      <div className="eyebrow">PRIVATE APP SETTINGS</div>
      <h1>Settings</h1>
      <section className="detail-card form-stack">
        <h3>Worklist</h3>
        <label className="field-label">
          Mark cases overdue after
          <input
            type="number"
            data-action="set_overdue_days"
            min="1"
            max="30"
            value={data.overdueDays}
            onChange={(event) =>
              void actions.run("set_overdue_days", {
                days: Number(event.target.value),
              })
            }
          />
        </label>
        <button
          className="primary"
          data-action="save_settings"
          onClick={() => void actions.run("save_settings")}
        >
          Confirm settings
        </button>
        <label className="setting-toggle">
          <span>
            <b>Headset mode</b>
            <small>
              Keep listening during replies and interrupt speech when you talk.
            </small>
          </span>
          <input
            type="checkbox"
            data-action="set_headset_mode"
            checked={voice.headsetMode}
            onChange={(event) =>
              void actions.run("set_headset_mode", {
                enabled: event.target.checked,
              })
            }
          />
        </label>
      </section>
      <section className="detail-card form-stack">
        <h3>Voice</h3>
        <label className="field-label">
          Silence length (ms)
          <input
            type="number"
            min="300"
            max="5000"
            data-action="set_voice_silence"
            value={voiceSettings.silenceMs}
            onChange={(event) =>
              void actions.run("set_voice_silence", {
                milliseconds: Number(event.target.value),
              })
            }
          />
        </label>
        <label className="field-label">
          Auto-stop (minutes)
          <input
            type="number"
            min="1"
            max="30"
            data-action="set_voice_auto_stop"
            value={voiceSettings.idleMinutes}
            onChange={(event) =>
              void actions.run("set_voice_auto_stop", {
                minutes: Number(event.target.value),
              })
            }
          />
        </label>
        <label className="field-label">
          Speech rate
          <input
            type="number"
            min="0.5"
            max="2"
            step="0.1"
            data-action="set_speech_rate"
            value={voiceSettings.rate}
            onChange={(event) =>
              void actions.run("set_speech_rate", {
                rate: Number(event.target.value),
              })
            }
          />
        </label>
        <label className="field-label">
          Speech voice
          <input
            type="text"
            data-action="set_speech_voice"
            value={voiceSettings.voice}
            placeholder="Default"
            onChange={(event) =>
              void actions.run("set_speech_voice", { name: event.target.value })
            }
          />
        </label>
        <label className="setting-toggle">
          <span>Show transcripts</span>
          <input
            type="checkbox"
            data-action="set_transcript_visibility"
            checked={voiceSettings.transcript}
            onChange={(event) =>
              void actions.run("set_transcript_visibility", {
                enabled: event.target.checked,
              })
            }
          />
        </label>
      </section>
      <section className="detail-card form-stack">
        <h3>Change PIN</h3>
        <input
          data-action="pin_input"
          inputMode="numeric"
          maxLength={4}
          value={currentPin}
          onChange={(event) =>
            setCurrentPin(event.target.value.replace(/\D/g, ""))
          }
          placeholder="Current PIN"
        />
        <input
          data-action="pin_input"
          inputMode="numeric"
          maxLength={4}
          value={newPin}
          onChange={(event) => setNewPin(event.target.value.replace(/\D/g, ""))}
          placeholder="New 4-digit PIN"
        />
        <button
          className="primary"
          data-action="change_pin"
          disabled={currentPin.length !== 4 || newPin.length !== 4}
          onClick={() => void save({ action: "pin", currentPin, newPin })}
        >
          Confirm PIN change
        </button>
      </section>
      <section className="detail-card">
        <h3>AI configuration</h3>
        <div className="settings-list">
          <span>
            Provider <b>{data.ai.provider}</b>
          </span>
          <span>
            Commands <b>{data.ai.commandModel}</b>
          </span>
          <span>
            Chat <b>{data.ai.chatModel}</b>
          </span>
          <span>
            Speech <b>{data.ai.sttModel}</b>
          </span>
        </div>
        <p className="subtle">
          Model credentials remain server-side environment variables.
        </p>
      </section>
      <div className="settings-links">
        <Link data-action="navigate" href="/voice-help">
          How to talk to the app <span>›</span>
        </Link>
        <Link data-action="navigate" href="/settings/templates">
          Manage templates <span>›</span>
        </Link>
        <a
          data-action="export"
          href={`/api/export?date=${localDateKey()}`}
          download
          onClick={(event) => {
            event.preventDefault();
            void actions.run("export");
          }}
        >
          Export all case data <span>↓</span>
        </a>
        <Link data-action="navigate" href="/end-day">
          End-of-day summary <span>›</span>
        </Link>
      </div>
      {message && <div className="notice">{message}</div>}
      <AppNav active="settings" />
    </main>
  );
}
