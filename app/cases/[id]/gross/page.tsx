"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  GROSS_TEMPLATES,
  SPECIMEN_TYPES,
  type GrossTemplate,
} from "@/src/lib/gross/templates";
import HelpPanel from "@/app/components/HelpPanel";
import AppNav from "@/app/components/AppNav";

type GrossData = {
  case: {
    id: number;
    caseLabel: string;
    specimenType: string | null;
    status: string;
  };
  previous: {
    fields: Record<string, string>;
    case: { specimenType: string | null };
  } | null;
};
export default function GrossPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<GrossData | null>(null);
  const [specimen, setSpecimen] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<"guide" | "review">("guide");
  const [bypass, setBypass] = useState<"skip" | "force" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [managedTemplates, setManagedTemplates] = useState<
    Record<string, GrossTemplate>
  >({});
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  useEffect(() => {
    fetch(`/api/cases/${params.id}/gross`)
      .then((response) => response.json())
      .then((value: GrossData) => {
        setData(value);
        setSpecimen(value.case.specimenType || "");
      });
    fetch("/api/templates")
      .then((response) => response.json())
      .then((templates: { kind: string; specimenType: string; schema: unknown }[]) => {
        const managed: Record<string, GrossTemplate> = {};
        for (const item of templates) {
          if (item.kind !== "gross" || typeof item.schema !== "object" || !item.schema) continue;
          const value = item.schema as Partial<GrossTemplate>;
          if (Array.isArray(value.fields) && value.fields.length)
            managed[item.specimenType] = { name: value.name || item.specimenType, fields: value.fields };
        }
        setManagedTemplates(managed);
      });
  }, [params.id]);
  const template = specimen
    ? managedTemplates[specimen] || GROSS_TEMPLATES[specimen] || GROSS_TEMPLATES.Other
    : null;
  const description = useMemo(
    () => {
      if (!specimen || !template) return "";
      const details = template.fields
        .filter((field) => fields[field.key]?.trim())
        .map((field) => `${field.label}: ${fields[field.key].trim()}`);
      return `${specimen} specimen. ${details.join(". ")}${details.length ? "." : ""}`;
    },
    [specimen, fields, template],
  );
  const specimenTypes = Array.from(
    new Set([...SPECIMEN_TYPES, ...Object.keys(managedTemplates)]),
  );
  const completed =
    template?.fields.filter((field) => fields[field.key]?.trim()).length || 0;
  function answer(value: string) {
    if (!template) return;
    setFields((current) => ({
      ...current,
      [template.fields[index].key]: value,
    }));
    if (index < template.fields.length - 1) setIndex(index + 1);
  }
  function handleVoice(value: string) {
    const spoken = value.trim();
    const lower = spoken.toLowerCase();
    if (!specimen) {
      const matched = SPECIMEN_TYPES.find((type) =>
        lower.includes(type.toLowerCase()),
      );
      if (matched) setSpecimen(matched);
      else
        setError(
          "I didn't recognize that specimen. Please say or tap a listed type.",
        );
      return;
    }
    const skip = lower.match(/^skip (?:gross|grossing)(?: because)?\s+(.+)/);
    const force = lower.match(
      /^force (?:complete )?(?:gross|grossing)(?: because)?\s+(.+)/,
    );
    if (skip) {
      setBypass("skip");
      setReason(skip[1]);
      return;
    }
    if (force) {
      setBypass("force");
      setReason(force[1]);
      return;
    }
    if (/^(read back|review)$/.test(lower)) {
      setMode("review");
      window.speechSynthesis?.speak(new SpeechSynthesisUtterance(description));
      return;
    }
    if (
      /^(confirm|save|confirm and save)$/.test(lower) &&
      mode === "review" &&
      !bypass
    ) {
      void submitSave();
      return;
    }
    if (/^(confirm|yes)$/.test(lower) && bypass) {
      void submitBypass();
      return;
    }
    if (/^(cancel|no)$/.test(lower) && bypass) {
      setBypass(null);
      setReason("");
      return;
    }
    answer(spoken);
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
        try {
          const form = new FormData();
          form.append(
            "audio",
            new Blob(chunks.current, { type: media.mimeType || "audio/webm" }),
          );
          const response = await fetch("/api/voice/transcribe", {
            method: "POST",
            body: form,
          });
          const result = (await response.json()) as {
            transcript?: string;
            error?: string;
          };
          if (result.transcript) handleVoice(result.transcript);
          else setError(result.error || "I didn't catch that.");
        } catch {
          setError("Network error while transcribing.");
        } finally {
          setBusy(false);
        }
      };
      media.start();
      setBusy(true);
    } catch {
      setError(
        "Microphone permission is required. You can type the answer instead.",
      );
    }
  }
  function stopVoice() {
    recorder.current?.stop();
  }
  function copyPrevious() {
    if (!data?.previous) return;
    setSpecimen(data.previous.case.specimenType || "Other");
    setFields(data.previous.fields);
    setIndex(0);
  }
  async function submitSave() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/cases/${params.id}/gross`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          specimenType: specimen,
          fields,
          descriptionText: description,
          transcript: Object.values(fields).join(". "),
          notes,
          confirmed: true,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error);
      window.speechSynthesis?.speak(
        new SpeechSynthesisUtterance(
          "Gross saved. Moving to microscopy pending.",
        ),
      );
      window.location.href = `/cases/${params.id}`;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save gross");
      setBusy(false);
    }
  }
  async function submitBypass() {
    if (!bypass || reason.trim().length < 3) {
      setError("A reason is required.");
      return;
    }
    setBusy(true);
    const response = await fetch(`/api/cases/${params.id}/gross`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: bypass, reason, confirmed: true }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(result.error || "Could not continue");
      setBusy(false);
      return;
    }
    window.location.href = `/cases/${params.id}`;
  }
  if (!data) return <main className="app-shell">Loading…</main>;
  if (data.case.status !== "gross_pending")
    return (
      <main className="app-shell">
        <Link href={`/cases/${params.id}`} className="back">
          ← Case
        </Link>
        <div className="detail-card">
          <h1>Gross already completed</h1>
          <p>This case is currently {data.case.status.replaceAll("_", " ")}.</p>
        </div>
        <AppNav active="cases" />
      </main>
    );
  if (!specimen)
    return (
      <main className="app-shell">
        <Link href={`/cases/${params.id}`} className="back">
          ← Case
        </Link>
        <div className="eyebrow">{data.case.caseLabel} · FROM WORKLIST</div>
        <h1>Next case</h1>
        <h3>Specimen type</h3>
        <p className="subtle">
          The matching checklist will load. This is saved only after your final
          confirmation.
        </p>
        <button
          className="voice-answer wide"
          onClick={() => (busy ? stopVoice() : void startVoice())}
        >
          {busy ? "■ Stop" : "🎙 Say specimen type"}
        </button>
        <div className="specimen-grid">
          {specimenTypes.map((type) => (
            <button
              className="specimen-card"
              key={type}
              onClick={() => setSpecimen(type)}
            >
              {type}
            </button>
          ))}
        </div>
        {data.previous && (
          <button className="secondary wide" onClick={copyPrevious}>
            Same as previous · {data.previous.case.specimenType}
          </button>
        )}
        <AppNav active="cases" />
      </main>
    );
  return (
    <main className="app-shell gross-shell">
      <Link href={`/cases/${params.id}`} className="back">
        ← {data.case.caseLabel}
      </Link>
      <header>
        <div>
          <div className="eyebrow">
            {specimen} · Step {Math.min(index + 1, template!.fields.length)} of{" "}
            {template!.fields.length}
          </div>
          <h1>
            {mode === "review" ? "Read-back" : `Gross · ${data.case.caseLabel}`}
          </h1>
        </div>
        <span className="status-pill">
          {completed}/{template!.fields.length}
        </span>
      </header>
      {notes && (
        <div className="added-note">
          <b>Added from help:</b> {notes}
        </div>
      )}
      <button className="help-button" onClick={() => setHelpOpen(true)}>
        ✦ Ask for help
      </button>
      {mode === "guide" ? (
        <>
          <div className="gross-progress">
            <span
              style={{
                width: `${(completed / template!.fields.length) * 100}%`,
              }}
            />
          </div>
          <div className="detail-card gross-answer">
            <h2>{template!.fields[index].question}</h2>
            <label>
              {template!.fields[index].label}
              <input
                value={fields[template!.fields[index].key] || ""}
                placeholder={template!.fields[index].placeholder}
                onChange={(event) =>
                  setFields((current) => ({
                    ...current,
                    [template!.fields[index].key]: event.target.value,
                  }))
                }
              />
            </label>
            <div className="gross-actions">
              <button
                className="voice-answer"
                onClick={() => (busy ? stopVoice() : void startVoice())}
              >
                {busy ? "■ Stop" : "🎙 Answer by voice"}
              </button>
              <button
                className="primary"
                onClick={() =>
                  index < template!.fields.length - 1
                    ? setIndex(index + 1)
                    : setMode("review")
                }
              >
                {index < template!.fields.length - 1 ? "Next" : "Review"}
              </button>
            </div>
          </div>
          <div className="checklist">
            {template!.fields.map((field, fieldIndex) => (
              <button
                key={field.key}
                className={
                  fieldIndex === index ? "check-item current" : "check-item"
                }
                onClick={() => setIndex(fieldIndex)}
              >
                <span>{fields[field.key] ? "✓" : "○"}</span>
                <div>
                  <strong>{field.label}</strong>
                  <small>{fields[field.key] || "Not answered"}</small>
                </div>
              </button>
            ))}
          </div>
          <button className="secondary wide" onClick={() => setMode("review")}>
            Read back and save
          </button>
        </>
      ) : (
        <div className="detail-card readback">
          <p>{description}</p>
          <button
            className="secondary wide"
            onClick={() =>
              window.speechSynthesis?.speak(
                new SpeechSynthesisUtterance(description),
              )
            }
          >
            🔊 Read aloud
          </button>
          <div className="gross-actions">
            <button className="secondary" onClick={() => setMode("guide")}>
              Edit answers
            </button>
            <button
              className="primary"
              disabled={busy || completed < template!.fields.length}
              onClick={() => void submitSave()}
            >
              Confirm and save
            </button>
          </div>
        </div>
      )}
      <div className="bypass-row">
        <button onClick={() => setBypass("skip")}>Skip gross</button>
        <button onClick={() => setBypass("force")}>Force complete</button>
      </div>
      {bypass && (
        <div className="modal">
          <div className="modal-card">
            <button className="close" onClick={() => setBypass(null)}>
              ×
            </button>
            <div className="eyebrow">INCOMPLETE WILL BE LOGGED</div>
            <h2>
              {bypass === "skip" ? "Skip gross?" : "Force complete gross?"}
            </h2>
            <label>
              Reason required
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why is this step being bypassed?"
              />
            </label>
            <button
              className="voice-answer"
              onClick={() => (busy ? stopVoice() : void startVoice())}
            >
              {busy ? "■ Stop" : "🎙 Say confirm or cancel"}
            </button>
            <button className="primary" onClick={() => void submitBypass()}>
              Confirm {bypass}
            </button>
          </div>
        </div>
      )}
      {error && <div className="error">{error}</div>}
      {helpOpen && (
        <HelpPanel
          caseId={params.id}
          caseLabel={data.case.caseLabel}
          contextStep="gross"
          currentText={description}
          onAddNote={(note) =>
            setNotes((current) => (current ? `${current}\n${note}` : note))
          }
          onClose={() => setHelpOpen(false)}
        />
      )}
      <AppNav active="cases" />
    </main>
  );
}
