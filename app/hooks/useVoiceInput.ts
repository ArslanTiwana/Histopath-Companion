"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch, ApiFetchError } from "@/lib/api-fetch";
import {
  chooseVoiceMimeType,
  DEFAULT_VOICE_IDLE_TIMEOUT_MS,
  DEFAULT_VOICE_MIN_SPEECH_MS,
  DEFAULT_VOICE_SILENCE_MS,
  extensionForMimeType,
  isJunkTranscript,
  isStopListeningCommand,
} from "@/lib/voice-input";
import {
  containsPatientIdentifier,
  PATIENT_IDENTIFIER_MESSAGE,
} from "@/src/lib/privacy";
import type { ConversationTurn } from "@/src/lib/ai/types";
import { readVoiceVocabulary } from "@/lib/voice-vocabulary";
import { VOICE_MIN_CONFIDENCE } from "@/lib/voice-config";

export type VoiceState =
  | "off"
  | "listening"
  | "hearing"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "error";

type CommandResponse = {
  reply?: string;
  error?: string;
  navigateTo?: string;
  filter?: string;
  refresh?: boolean;
  goBack?: boolean;
  calls?: Array<{ id: string; args: Record<string, unknown> }>;
};

type VoiceRouterContext = {
  screenId: string;
  screenState: Record<string, unknown>;
  actions: Array<{
    id: string;
    description: string;
    risk: "safe" | "confirm";
    args: Record<string, unknown>;
  }>;
  dictationTarget?: string | null;
};

type WakeLockLike = { release: () => Promise<void> };
type Capture = {
  resolve: (text: string) => void;
  reject: (error: Error) => void;
};

const numberSetting = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const localNumberSetting = (key: string, fallback: number) =>
  typeof localStorage === "undefined"
    ? fallback
    : numberSetting(localStorage.getItem(key) || undefined, fallback);

export function useVoiceInput(options?: {
  getRouterContext?: () => VoiceRouterContext;
  runAction?: (id: string, args: Record<string, unknown>) => Promise<unknown>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<VoiceState>("off");
  const [active, setActive] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [lastReply, setLastReply] = useState("");
  const [headsetMode, setHeadsetModeState] = useState(false);
  const [latency, setLatency] = useState<{
    transcribe: number;
    route: number;
    action: number;
    total: number;
  } | null>(null);
  const turnsRef = useRef<ConversationTurn[]>([]);

  const activeRef = useRef(false);
  const headsetRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const speechMsRef = useRef(0);
  const lastVoiceAtRef = useRef(0);
  const lastSpeechAtRef = useRef(0);
  const vadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const turnBusyRef = useRef(false);
  const queuedRef = useRef<Blob | null>(null);
  const captureRef = useRef<Capture | null>(null);
  const oneShotRef = useRef(false);
  const speechPausedRef = useRef(false);
  const wakeLockRef = useRef<WakeLockLike | null>(null);
  const cooldownUntilRef = useRef(0);
  const actionMsRef = useRef(0);
  const processRef = useRef<(blob: Blob) => Promise<void>>(
    async () => undefined,
  );

  const appendLine = useCallback((line: string) => {
    if (
      typeof localStorage !== "undefined" &&
      localStorage.getItem("histopath_voice_transcript") === "off"
    )
      return;
    setLines((current) => [...current, line].slice(-3));
  }, []);

  const releaseWakeLock = useCallback(async () => {
    const lock = wakeLockRef.current;
    wakeLockRef.current = null;
    if (lock) await lock.release().catch(() => undefined);
  }, []);

  const stopSession = useCallback(
    (message?: string) => {
      activeRef.current = false;
      setActive(false);
      speechPausedRef.current = false;
      if (vadTimerRef.current) clearInterval(vadTimerRef.current);
      vadTimerRef.current = null;
      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (recorder?.state === "recording") {
        recorder.onstop = null;
        recorder.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      void contextRef.current?.close();
      contextRef.current = null;
      analyserRef.current = null;
      queuedRef.current = null;
      turnBusyRef.current = false;
      window.speechSynthesis?.cancel();
      void releaseWakeLock();
      if (captureRef.current) {
        captureRef.current.reject(
          new Error(message || "Voice capture stopped."),
        );
        captureRef.current = null;
      }
      oneShotRef.current = false;
      setState("off");
      if (message) setNotice(message);
    },
    [releaseWakeLock],
  );

  const speak = useCallback(
    (text: string) =>
      new Promise<void>((resolve) => {
        if (!("speechSynthesis" in window) || !text.trim()) {
          resolve();
          return;
        }
        speechPausedRef.current = !headsetRef.current;
        setState("speaking");
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = Math.min(
          2,
          Math.max(0.5, localNumberSetting("histopath_voice_rate", 1)),
        );
        const voiceName = localStorage.getItem("histopath_voice_name");
        const selectedVoice = voiceName
          ? window.speechSynthesis
              .getVoices()
              .find((voice) => voice.name === voiceName)
          : undefined;
        if (selectedVoice) utterance.voice = selectedVoice;
        const finish = () => {
          speechPausedRef.current = false;
          if (activeRef.current) setState("listening");
          resolve();
        };
        utterance.onend = finish;
        utterance.onerror = finish;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      }),
    [],
  );

  const sendCommand = useCallback(
    async (text: string) => {
      if (containsPatientIdentifier(text))
        throw new Error(PATIENT_IDENTIFIER_MESSAGE);
      setState("thinking");
      const turns = turnsRef.current.slice(-4);
      const data = await apiFetch<CommandResponse>("/api/voice/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: text,
          context: options?.getRouterContext?.() || {
            screenId: pathname,
            screenState: { screenId: pathname },
            actions: [],
          },
          lastTurns: turns,
        }),
      });
      let reply = data.reply || data.error || "I couldn't complete that.";
      const actionStarted = performance.now();
      if (data.filter)
        window.dispatchEvent(
          new CustomEvent("voice-filter", { detail: data.filter }),
        );
      if (data.refresh) window.dispatchEvent(new Event("cases-changed"));
      for (const call of data.calls || []) {
        const result = await options?.runAction?.(call.id, call.args);
        if (
          result &&
          typeof result === "object" &&
          "readBackText" in result &&
          typeof result.readBackText === "string"
        )
          reply = result.readBackText;
      }
      const actionMs = performance.now() - actionStarted;
      actionMsRef.current = actionMs;
      setLastReply(reply);
      appendLine(`Companion: ${reply}`);
      turnsRef.current = [
        ...turns,
        {
          user: text,
          assistant: reply,
          actions: (data.calls || []).map((call) => ({
            id: call.id,
            args: call.args,
          })),
        },
      ].slice(-4);
      localStorage.setItem(
        "histopath_voice_turns",
        JSON.stringify(turnsRef.current),
      );
      if (data.goBack) router.back();
      else if (data.navigateTo && pathname !== data.navigateTo)
        router.push(data.navigateTo);
      await speak(reply);
      return data;
    },
    [appendLine, options, pathname, router, speak],
  );

  const friendlyError = useCallback((cause: unknown) => {
    let message = "Network error. Use the typed command box on Worklist.";
    if (cause instanceof ApiFetchError && cause.status === 429) {
      message = "Voice is busy. Please wait a few seconds, then try again.";
      cooldownUntilRef.current = Date.now() + 5_000;
      window.setTimeout(() => {
        if (activeRef.current && Date.now() >= cooldownUntilRef.current) {
          setNotice("");
          setState("listening");
        }
      }, 5_100);
    } else if (cause instanceof Error && cause.message) message = cause.message;
    setNotice(message);
    setLastReply(message);
    setState("error");
    if (captureRef.current) {
      captureRef.current.reject(new Error(message));
      captureRef.current = null;
      if (oneShotRef.current) {
        oneShotRef.current = false;
        activeRef.current = false;
        setActive(false);
      }
    }
  }, []);

  const processBlob = useCallback(
    async (blob: Blob) => {
      if (Date.now() < cooldownUntilRef.current) {
        setState("error");
        setNotice("Voice is cooling down. Please wait a few seconds.");
        return;
      }
      turnBusyRef.current = true;
      let failed = false;
      setNotice("");
      try {
        const startedAt = performance.now();
        setState("transcribing");
        const form = new FormData();
        form.append("audio", blob, `speech.${extensionForMimeType(blob.type)}`);
        form.append("vocabulary", readVoiceVocabulary().join(", "));
        const transcribeStarted = performance.now();
        const result = await apiFetch<{
          transcript?: string;
          confidence?: number;
        }>("/api/voice/transcribe", {
          method: "POST",
          body: form,
        });
        const transcribeMs = performance.now() - transcribeStarted;
        const transcript = result.transcript?.trim() || "";
        if (
          typeof result.confidence === "number" &&
          result.confidence < VOICE_MIN_CONFIDENCE
        ) {
          setNotice("I could not hear that clearly. Please repeat.");
          return;
        }
        if (!transcript) {
          setNotice(
            "I didn't catch that. Keep speaking or use the typed command box.",
          );
          return;
        }
        if (containsPatientIdentifier(transcript))
          throw new Error(PATIENT_IDENTIFIER_MESSAGE);
        appendLine(`You: ${transcript}`);
        lastSpeechAtRef.current = Date.now();
        if (isStopListeningCommand(transcript) && activeRef.current) {
          if (options?.runAction) await options.runAction("stop_listening", {});
          else stopSession("Voice session stopped.");
          return;
        }
        const capture = captureRef.current;
        if (capture) {
          captureRef.current = null;
          capture.resolve(transcript);
          if (oneShotRef.current) stopSession();
          return;
        }
        if (
          isJunkTranscript(
            transcript,
            process.env.NEXT_PUBLIC_VOICE_JUNK_PHRASES,
          )
        ) {
          setNotice("Ignored a likely accidental or incomplete transcript.");
          return;
        }
        const routeStarted = performance.now();
        await sendCommand(transcript);
        const routeMs = performance.now() - routeStarted;
        const value = {
          transcribe: Math.round(transcribeMs),
          route: Math.round(routeMs),
          action: Math.round(actionMsRef.current),
          total: Math.round(performance.now() - startedAt),
        };
        setLatency(value);
        if (process.env.NODE_ENV === "development") {
          console.info("[voice.latency]", value);
          window.dispatchEvent(
            new CustomEvent("voice-latency", { detail: value }),
          );
        }
      } catch (cause) {
        failed = true;
        friendlyError(cause);
      } finally {
        turnBusyRef.current = false;
        if (activeRef.current && !failed && state !== "speaking")
          setState("listening");
        const queued = queuedRef.current;
        queuedRef.current = null;
        if (queued && activeRef.current) void processRef.current(queued);
      }
    },
    [appendLine, friendlyError, options, sendCommand, state, stopSession],
  );
  processRef.current = processBlob;

  const finishSegment = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    recorderRef.current = null;
    recorder.stop();
  }, []);

  const startSegment = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || recorderRef.current) return;
    const mimeType = chooseVoiceMimeType(
      (value) => MediaRecorder.isTypeSupported(value),
      navigator.userAgent,
    );
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    chunksRef.current = [];
    speechMsRef.current = 0;
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || mimeType,
      });
      chunksRef.current = [];
      if (
        speechMsRef.current <
          localNumberSetting(
            "histopath_voice_min_speech_ms",
            numberSetting(
              process.env.NEXT_PUBLIC_VOICE_MIN_SPEECH_MS,
              DEFAULT_VOICE_MIN_SPEECH_MS,
            ),
          ) ||
        !blob.size
      ) {
        if (activeRef.current) setState("listening");
        return;
      }
      if (turnBusyRef.current) {
        if (!queuedRef.current) queuedRef.current = blob;
        else
          setNotice(
            "One utterance is already queued. Please repeat after the reply.",
          );
      } else void processRef.current(blob);
    };
    recorderRef.current = recorder;
    recorder.start(200);
  }, []);

  const startSession = useCallback(async () => {
    if (activeRef.current) return;
    setNotice("");
    if (!("MediaRecorder" in window) || !navigator.mediaDevices?.getUserMedia) {
      setState("error");
      const message =
        "This browser does not support microphone recording. Use the typed command box on Worklist.";
      setNotice(message);
      if (captureRef.current) {
        captureRef.current.reject(new Error(message));
        captureRef.current = null;
        oneShotRef.current = false;
      }
      return;
    }
    if ("speechSynthesis" in window) {
      const primer = new SpeechSynthesisUtterance(" ");
      primer.volume = 0;
      window.speechSynthesis.speak(primer);
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      const AudioContextClass =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextClass)
        throw new Error(
          "Voice activity detection is not supported in this browser.",
        );
      const audioContext = new AudioContextClass();
      if (audioContext.state === "suspended") await audioContext.resume();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      contextRef.current = audioContext;
      analyserRef.current = analyser;
      activeRef.current = true;
      setActive(true);
      setState("listening");
      const now = Date.now();
      lastSpeechAtRef.current = now;
      lastVoiceAtRef.current = now;
      const wakeLock = (
        navigator as Navigator & {
          wakeLock?: { request: (type: "screen") => Promise<WakeLockLike> };
        }
      ).wakeLock;
      if (wakeLock)
        wakeLockRef.current = await wakeLock
          .request("screen")
          .catch(() => null);
      const samples = new Uint8Array(analyser.fftSize);
      const threshold = numberSetting(
        process.env.NEXT_PUBLIC_VOICE_VAD_THRESHOLD,
        0.025,
      );
      const silenceMs = localNumberSetting(
        "histopath_voice_silence_ms",
        numberSetting(
          process.env.NEXT_PUBLIC_VOICE_SILENCE_MS,
          DEFAULT_VOICE_SILENCE_MS,
        ),
      );
      const idleMs = localNumberSetting(
        "histopath_voice_idle_ms",
        numberSetting(
          process.env.NEXT_PUBLIC_VOICE_IDLE_TIMEOUT_MS,
          DEFAULT_VOICE_IDLE_TIMEOUT_MS,
        ),
      );
      vadTimerRef.current = setInterval(() => {
        if (!activeRef.current) return;
        const tick = Date.now();
        if (tick - lastSpeechAtRef.current >= idleMs) {
          stopSession(
            "Voice session stopped after two minutes without speech.",
          );
          return;
        }
        if (speechPausedRef.current) return;
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (let index = 0; index < samples.length; index += 1) {
          const centered = (samples[index] - 128) / 128;
          sum += centered * centered;
        }
        const hearing = Math.sqrt(sum / samples.length) >= threshold;
        if (hearing) {
          if (headsetRef.current && window.speechSynthesis?.speaking) {
            window.speechSynthesis.cancel();
            speechPausedRef.current = false;
          }
          lastVoiceAtRef.current = tick;
          lastSpeechAtRef.current = tick;
          speechMsRef.current += 50;
          startSegment();
          setState("hearing");
        } else if (
          recorderRef.current &&
          tick - lastVoiceAtRef.current >= silenceMs
        ) {
          finishSegment();
          setState(turnBusyRef.current ? "thinking" : "transcribing");
        }
      }, 50);
    } catch (cause) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      const denied =
        cause instanceof DOMException &&
        (cause.name === "NotAllowedError" || cause.name === "SecurityError");
      friendlyError(
        denied
          ? new Error(
              "Microphone permission was denied. Use the typed command box on Worklist.",
            )
          : cause,
      );
    }
  }, [finishSegment, friendlyError, startSegment, stopSession]);

  const captureOnce = useCallback(() => {
    if (captureRef.current)
      return Promise.reject(new Error("Another dictation is already waiting."));
    const promise = new Promise<string>((resolve, reject) => {
      captureRef.current = { resolve, reject };
    });
    if (!activeRef.current) {
      oneShotRef.current = true;
      void startSession();
    }
    return promise;
  }, [startSession]);

  const submitTypedCommand = useCallback(
    async (text: string) => {
      const value = text.trim();
      if (!value) return;
      appendLine(`You: ${value}`);
      try {
        await sendCommand(value);
      } catch (cause) {
        friendlyError(cause);
      }
    },
    [appendLine, friendlyError, sendCommand],
  );

  const setHeadsetMode = useCallback((value: boolean) => {
    headsetRef.current = value;
    setHeadsetModeState(value);
    localStorage.setItem("histopath_headset_mode", String(value));
  }, []);

  useEffect(() => {
    const value = localStorage.getItem("histopath_headset_mode") === "true";
    headsetRef.current = value;
    setHeadsetModeState(value);
  }, []);

  useEffect(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem("histopath_voice_turns") || "[]",
      ) as unknown;
      if (Array.isArray(stored))
        turnsRef.current = stored.slice(-4) as ConversationTurn[];
    } catch {
      turnsRef.current = [];
    }
  }, []);

  useEffect(() => {
    const hidden = () => {
      if (document.hidden && activeRef.current)
        stopSession("Voice stopped because the app moved to the background.");
    };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, [stopSession]);

  useEffect(() => () => stopSession(), [stopSession]);

  return {
    state,
    active,
    lines,
    notice,
    lastReply,
    latency,
    headsetMode,
    startSession,
    stopSession,
    captureOnce,
    submitTypedCommand,
    setHeadsetMode,
    speak,
  };
}
